"use client";

import { formatOrderNumber } from "@/lib/order-number";
import { showToast, ToastFeedback } from "@/components/floating-toast";
import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Truck,
  Copy,
  Check,
  ExternalLink,
  Clock3,
  FileText,
  Package,
  RefreshCw,
  CreditCard,
  Smartphone,
  Banknote,
  XCircle,
  CheckCircle2,
  X,
  ArrowUpRight,
} from "lucide-react";
import {
  track,
  switchOrderToCodAction,
  type Summary,
} from "@/app/(shop)/orders/actions";
import { orderStatusLabel, translateColor } from "@/lib/i18n";
import { date } from "@/lib/brand";
import { useLanguage } from "@/components/language-provider";
import { isSafeHttpUrl, localizeCarrierLabel } from "@/lib/shipping";
import { OrderReturnPanel } from "./order-return-panel";
import {
  clearPendingOnlineOrder,
  setPendingOnlineOrder,
  useCartTenant,
} from "./cart-store";

const EGYPT_WALLET_RE = /^01[0125][0-9]{8}$/;

type RetryOption = "paymob_card" | "paymob_wallet" | "cod";

export function Timeline({
  row,
  index = 0,
  detailHref,
  currency = "EGP",
  hideReturnPanel = false,
}: {
  row: Summary;
  index?: number;
  detailHref?: string;
  currency?: string;
  hideReturnPanel?: boolean;
}) {
  const router = useRouter();
  const tenantId = useCartTenant();
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAwb, setCopiedAwb] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [retryChoice, setRetryChoice] = useState<RetryOption>(
    (row.payment_method ?? "").toLowerCase() === "paymob_wallet"
      ? "paymob_wallet"
      : "paymob_card",
  );
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [walletPhone, setWalletPhone] = useState(
    row.phone && EGYPT_WALLET_RE.test(row.phone) ? row.phone : "",
  );
  const [localOverride, setLocalOverride] = useState<{
    status: string;
    payment_method: string;
    payment_status: string;
  } | null>(null);
  const [codBanner, setCodBanner] = useState(false);

  const effectiveStatus = localOverride?.status ?? row.status;
  const effectiveMethod = (
    localOverride?.payment_method ??
    row.payment_method ??
    "cod"
  ).toLowerCase();
  const effectivePaymentStatus = (
    localOverride?.payment_status ??
    row.payment_status ??
    ""
  ).toLowerCase();

  const canRetryOnlinePayment =
    effectiveStatus !== "cancelled" &&
    effectiveStatus !== "delivered" &&
    (effectiveMethod === "paymob_card" ||
      effectiveMethod === "paymob_wallet") &&
    (effectivePaymentStatus === "pending" ||
      effectivePaymentStatus === "failed");

  const handleConfirmRetry = async () => {
    setRetryError(null);

    if (retryChoice === "cod") {
      setRetrying(true);
      try {
        const res = await switchOrderToCodAction(row.id, row.phone ?? "");
        if (!res.ok) {
          setRetryError(
            res.error ??
              (isEn
                ? "Could not switch to Cash on Delivery."
                : "تعذر التحويل إلى الدفع عند الاستلام."),
          );
          setRetrying(false);
          return;
        }
        clearPendingOnlineOrder(tenantId);
        setLocalOverride({
          status: res.status ?? "confirmed",
          payment_method: "cod",
          payment_status: "cod_pending",
        });
        setRetryOpen(false);
        setCodBanner(true);
        router.refresh();
      } catch {
        setRetryError(
          isEn
            ? "Could not switch to Cash on Delivery."
            : "تعذر التحويل إلى الدفع عند الاستلام.",
        );
      } finally {
        setRetrying(false);
      }
      return;
    }

    const method = retryChoice === "paymob_wallet" ? "wallet" : "card";
    const cleanWallet = walletPhone.replace(/\s+/g, "");
    if (method === "wallet" && !EGYPT_WALLET_RE.test(cleanWallet)) {
      setRetryError(t("paymentWalletPhoneError"));
      return;
    }

    setRetrying(true);
    try {
      setPendingOnlineOrder(tenantId, row.id);
      const res = await fetch("/api/payments/paymob/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: row.id,
          method,
          wallet_phone: method === "wallet" ? cleanWallet : undefined,
          customer_phone: row.phone ?? undefined,
        }),
      });
      const data = (await res.json()) as { redirect_url?: string };
      if (!res.ok || !data.redirect_url) {
        setRetryError(t("paymentRetryError"));
        setRetrying(false);
        return;
      }
      window.location.assign(data.redirect_url);
    } catch {
      setRetryError(t("paymentRetryError"));
      setRetrying(false);
    }
  };

  const stages = [
    { key: "pending", ar: "قيد الانتظار", en: "Pending", icon: Clock3 },
    { key: "confirmed", ar: "قيد التجهيز", en: "Processing", icon: Package },
    { key: "shipped", ar: "تم الشحن", en: "Shipped", icon: Truck },
    { key: "delivered", ar: "تم التوصيل", en: "Delivered", icon: CheckCircle2 },
  ] as const;

  const isCancelled = effectiveStatus === "cancelled";
  const currentIdx = Math.max(
    0,
    stages.findIndex((s) => s.key === effectiveStatus),
  );
  const progressPercent = isCancelled
    ? 0
    : Math.round((currentIdx / (stages.length - 1)) * 100);

  const hasShippingInfo = Boolean(
    row.shipping_carrier ||
      row.tracking_number ||
      row.tracking_url ||
      row.courier_note,
  );

  const items = row.order_items ?? [];

  const copyValue = async (val: string, kind: "id" | "awb") => {
    try {
      await navigator.clipboard.writeText(val);
      showToast({ kind: "success", message: document.documentElement.lang.startsWith("en") ? "Copied to clipboard" : "تم النسخ" });
      if (kind === "id") {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 1800);
      } else {
        setCopiedAwb(true);
        setTimeout(() => setCopiedAwb(false), 1800);
      }
    } catch {}
  };

  const paymentBadge = (() => {
    if (effectiveMethod === "wallet" && effectivePaymentStatus === "paid")
      return {
        tone: "paid",
        label: isEn ? "Paid via Wallet" : "مدفوع بالمحفظة",
      };
    if (effectivePaymentStatus === "paid")
      return { tone: "paid", label: t("paymentStatusPaid") };
    if (effectivePaymentStatus === "failed")
      return { tone: "failed", label: t("paymentStatusFailed") };
    if (effectivePaymentStatus === "refunded")
      return { tone: "refunded", label: t("paymentStatusRefunded") };
    if (effectivePaymentStatus === "cod_pending" || effectiveMethod === "cod")
      return { tone: "cod", label: t("paymentStatusCod") };
    return { tone: "pending", label: t("paymentStatusPending") };
  })();

  return (
    <article
      className="order-summary order-card shop-animate"
      style={{ animationDelay: `${Math.min(index, 7) * 40}ms` }}
    >
      <div className="order-card-head">
        <div className="order-id-block">
          <div className="order-id-row">
            {detailHref ? (
              <Link
                href={detailHref}
                dir="ltr"
                className="order-id order-id-link"
                title={row.id}
              >
                <bdi dir="ltr">{formatOrderNumber(row.id)}</bdi>
              </Link>
            ) : (
              <span dir="ltr" className="order-id" title={row.id}>
                <bdi dir="ltr">{formatOrderNumber(row.id)}</bdi>
              </span>
            )}
            <button
              type="button"
              className="icon-copy-chip"
              onClick={() => copyValue(row.id, "id")}
              aria-label={t("copyId")}
            >
              {copiedId ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedId ? t("copied") : t("copyId")}</span>
            </button>
            {detailHref && (
              <Link href={detailHref} className="order-detail-chip">
                <span>{isEn ? "Details" : "التفاصيل"}</span>
                <ArrowUpRight size={12} />
              </Link>
            )}
          </div>
          <small className="order-date-row">
            <Clock3 size={12} /> <bdi dir="ltr">{date(row.created_at, lang)}</bdi>
          </small>
        </div>
        <div className="order-badges-cluster">
          <span
            className="payment-status-badge"
            data-payment-status={paymentBadge.tone}
          >
            {paymentBadge.label}
          </span>
          <span className="order-status-badge" data-status={effectiveStatus}>
            {orderStatusLabel(effectiveStatus, lang)}
          </span>
        </div>
      </div>

      {codBanner && (
        <p className="account-notice account-notice--ok" role="status">
          {isEn
            ? "Switched to Cash on Delivery! Your order is now confirmed and being processed."
            : "تم تحويل الطلب إلى الدفع عند الاستلام بنجاح! طلبك الآن مؤكد وقيد التجهيز."}
        </p>
      )}

      {/* Animated Order Status Tracker */}
      {isCancelled ? (
        <div className="order-cancelled-banner" role="status">
          <XCircle size={18} aria-hidden="true" />
          <div>
            <strong>{isEn ? "Order Cancelled" : "تم إلغاء الطلب"}</strong>
            <small>
              {isEn
                ? "Contact support if you need help with this order."
                : "في حال وجود أي استفسار يرجى التواصل مع فريق الدعم."}
            </small>
          </div>
        </div>
      ) : (
        <div className="animated-order-tracker" aria-label={t("orderNumberLabel")}>
          <div className="tracker-rail" aria-hidden="true">
            <div
              className="tracker-rail-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <ol className="tracker-steps">
            {stages.map((stage, i) => {
              const Icon = stage.icon;
              const isCompleted = i < currentIdx;
              const isActive = i === currentIdx;
              return (
                <li
                  key={stage.key}
                  className={`tracker-step ${isCompleted ? "is-completed" : ""} ${isActive ? "is-active" : ""}`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span className="tracker-node">
                    {isActive && <span className="tracker-pulse-halo" aria-hidden="true" />}
                    <span className="tracker-node-circle">
                      {isCompleted ? <Check size={14} /> : <Icon size={14} />}
                    </span>
                  </span>
                  <span className="tracker-step-label">
                    {isEn ? stage.en : stage.ar}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {items.length > 0 && (
        <div className="order-items-strip">
          <small className="order-items-label">
            <Package size={13} /> {t("orderItemsHeading")}
          </small>
          <ul className="order-items-ul">
            {items.map((it) => (
              <li key={it.id} className="order-item-row">
                <span className="order-item-name">
                  {it.product_name} × <bdi dir="ltr">{it.quantity.toLocaleString(lang)}</bdi>
                </span>
                {(it.size || it.color) && (
                  <span className="variant-badges-row">
                    {it.size && (
                      <span className="variant-pill-badge">
                        {t("sizeLabel")}: <b>{it.size}</b>
                      </span>
                    )}
                    {it.color && (
                      <span className="variant-pill-badge">
                        {t("colorLabel")}: <b>{translateColor(it.color, lang)}</b>
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canRetryOnlinePayment && (
        <div className="order-retry-payment-box">
          {!retryOpen ? (
            <button
              type="button"
              className="order-retry-payment-btn"
              onClick={() => {
                setRetryOpen(true);
                setRetryError(null);
              }}
            >
              <RefreshCw size={14} />
              <span>{t("paymentRetryBtn")}</span>
            </button>
          ) : (
            <div className="retry-method-sheet" role="dialog" aria-label={isEn ? "Choose payment method" : "اختر طريقة الدفع"}>
              <div className="retry-sheet-head">
                <strong>
                  {isEn
                    ? "Retry or Switch Payment Method"
                    : "إعادة الدفع أو تغيير طريقة الدفع"}
                </strong>
                <button
                  type="button"
                  className="icon-ghost-btn"
                  aria-label={isEn ? "Close" : "إغلاق"}
                  onClick={() => {
                    setRetryOpen(false);
                    setRetryError(null);
                  }}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="retry-options-grid">
                <label className={`retry-option-card ${retryChoice === "paymob_card" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name={`retry-${row.id}`}
                    checked={retryChoice === "paymob_card"}
                    onChange={() => {
                      setRetryChoice("paymob_card");
                      setRetryError(null);
                    }}
                  />
                  <CreditCard size={17} aria-hidden="true" />
                  <span>{isEn ? "Credit / Debit Card" : "بطاقة بنكية (فيزا / ماستركارد)"}</span>
                </label>

                <label className={`retry-option-card ${retryChoice === "paymob_wallet" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name={`retry-${row.id}`}
                    checked={retryChoice === "paymob_wallet"}
                    onChange={() => {
                      setRetryChoice("paymob_wallet");
                      setRetryError(null);
                    }}
                  />
                  <Smartphone size={17} aria-hidden="true" />
                  <span>{isEn ? "Mobile Wallet" : "محفظة إلكترونية"}</span>
                </label>

                <label className={`retry-option-card ${retryChoice === "cod" ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name={`retry-${row.id}`}
                    checked={retryChoice === "cod"}
                    onChange={() => {
                      setRetryChoice("cod");
                      setRetryError(null);
                    }}
                  />
                  <Banknote size={17} aria-hidden="true" />
                  <span>{isEn ? "Cash on Delivery (COD)" : "الدفع عند الاستلام"}</span>
                </label>
              </div>

              {retryChoice === "paymob_wallet" && (
                <label className="order-retry-wallet-label">
                  <span>{t("paymentWalletPhoneLabel")}</span>
                  <input
                    type="tel"
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={11}
                    value={walletPhone}
                    onChange={(e) => {
                      setWalletPhone(e.target.value.replace(/\D/g, "").slice(0, 11));
                      if (retryError) setRetryError(null);
                    }}
                    placeholder={t("paymentWalletPhonePlaceholder")}
                  />
                </label>
              )}

              <button
                type="button"
                className="order-retry-payment-btn"
                disabled={retrying}
                onClick={handleConfirmRetry}
              >
                <RefreshCw size={14} className={retrying ? "spin-icon" : undefined} />
                <span>
                  {retrying
                    ? t("paymentRetryingBtn")
                    : retryChoice === "cod"
                      ? isEn
                        ? "Confirm Cash on Delivery"
                        : "تأكيد الدفع عند الاستلام"
                      : isEn
                        ? "Continue to Payment"
                        : "متابعة إلى بوابة الدفع"}
                </span>
              </button>

              {retryError && (
                <small role="alert" className="wallet-error-text">
                  {retryError}
                </small>
              )}
            </div>
          )}
        </div>
      )}

      {hasShippingInfo && (
        <div className="customer-shipping-card">
          <div className="customer-shipping-head">
            <span className="customer-shipping-title">
              <Truck size={15} />
              <strong>
                {localizeCarrierLabel(row.shipping_carrier, lang) ||
                  t("shippingDetails")}
              </strong>
            </span>
            {row.shipped_at && (
              <small>
                {t("shippedOn")} <bdi dir="ltr">{date(row.shipped_at, lang)}</bdi>
              </small>
            )}
          </div>

          {row.tracking_number && (
            <div className="customer-tracking-row">
              <small>{t("trackingNumber")}:</small>
              <code dir="ltr"><bdi dir="ltr">{row.tracking_number}</bdi></code>
              <button
                type="button"
                className="icon-copy-chip"
                onClick={() => copyValue(row.tracking_number!, "awb")}
              >
                {copiedAwb ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedAwb ? t("copiedDone") : t("copy")}</span>
              </button>
            </div>
          )}

          {row.courier_note && (
            <p className="customer-courier-note">
              <FileText size={13} /> {row.courier_note}
            </p>
          )}

          {row.tracking_url && isSafeHttpUrl(row.tracking_url) && (
            <a
              href={row.tracking_url}
              target="_blank"
              rel="noreferrer"
              className="customer-track-btn"
            >
              <span>{t("trackShipment")}</span>
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}

      {!hideReturnPanel && (detailHref || row.return_request) && (
        <OrderReturnPanel
          orderId={row.id}
          orderStatus={effectiveStatus}
          currency={row.currency || currency}
          orderItems={items}
          initialReturn={row.return_request ?? null}
        />
      )}
    </article>
  );
}

export function GuestTracking() {
  const { t } = useLanguage();
  const [state, action, busy] = useActionState(track, {});
  return (
    <section className="panel order-panel">
      <h2>{t("guestTrackTitle")}</h2>
      <form action={action}>
        <label>
          {t("orderNumberLabel")}
          <input
            name="number"
            dir="ltr"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            required
            maxLength={36}
          />
        </label>
        <label>
          {t("orderPhoneLabel")}
          <input name="phone" type="tel" dir="ltr" required maxLength={24} />
        </label>
        <button disabled={busy}>
          {busy ? t("searchingLabel") : t("trackOrderSubmit")}
        </button>
      </form>
      {state.error && <ToastFeedback message={state.error} kind="error" />}
      {state.row && <Timeline row={state.row} />}
    </section>
  );
}
