"use client";

import { useActionState, useState } from "react";
import {
  Truck,
  Copy,
  Check,
  ExternalLink,
  CheckCircle2,
  Clock3,
  FileText,
  Package,
  RefreshCw,
} from "lucide-react";
import { track, type Summary } from "@/app/(shop)/orders/actions";
import { orderStatusLabel, translateColor } from "@/lib/i18n";
import { date } from "@/lib/brand";
import { useLanguage } from "@/components/language-provider";
import { setPendingOnlineOrder } from "./cart-store";

const EGYPT_WALLET_RE = /^01[0125][0-9]{8}$/;

export function Timeline({
  row,
  index = 0,
}: {
  row: Summary;
  index?: number;
}) {
  const { lang, t } = useLanguage();
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAwb, setCopiedAwb] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [showWalletRetry, setShowWalletRetry] = useState(false);
  const [walletPhone, setWalletPhone] = useState("");

  const paymentMethodLower = (row.payment_method ?? "cod").toLowerCase();
  const paymentStatusLower = (row.payment_status ?? "").toLowerCase();
  const canRetryOnlinePayment =
    row.status !== "cancelled" &&
    (paymentMethodLower === "paymob_card" ||
      paymentMethodLower === "paymob_wallet") &&
    (paymentStatusLower === "pending" || paymentStatusLower === "failed");

  const handleRetryPayment = async () => {
    const method = paymentMethodLower === "paymob_wallet" ? "wallet" : "card";
    const cleanWallet = walletPhone.replace(/\s+/g, "");
    if (method === "wallet") {
      if (!showWalletRetry) {
        setShowWalletRetry(true);
        setRetryError(null);
        return;
      }
      if (!EGYPT_WALLET_RE.test(cleanWallet)) {
        setRetryError(t("paymentWalletPhoneError"));
        return;
      }
    }
    setRetrying(true);
    setRetryError(null);
    try {
      setPendingOnlineOrder(row.id);
      const res = await fetch("/api/payments/paymob/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: row.id,
          method,
          wallet_phone: method === "wallet" ? cleanWallet : undefined,
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

  const sequence =
    row.status === "cancelled"
      ? ["pending", "cancelled"]
      : ["pending", "confirmed", "shipped", "delivered"];
  const currentIdx = sequence.indexOf(row.status);

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
    const status = (row.payment_status ?? "").toLowerCase();
    const method = (row.payment_method ?? "cod").toLowerCase();
    if (status === "paid")
      return { tone: "paid", label: t("paymentStatusPaid") };
    if (status === "failed")
      return { tone: "failed", label: t("paymentStatusFailed") };
    if (status === "refunded")
      return { tone: "refunded", label: t("paymentStatusRefunded") };
    if (status === "pending" || method !== "cod")
      return { tone: "pending", label: t("paymentStatusPending") };
    return { tone: "cod", label: t("paymentStatusCod") };
  })();

  return (
    <article
      className="order-summary order-card shop-animate"
      style={{ animationDelay: `${Math.min(index, 7) * 40}ms` }}
    >
      <div className="order-card-head">
        <div className="order-id-block">
          <div className="order-id-row">
            <span dir="ltr" className="order-id" title={row.id}>
              #{row.id.slice(0, 8)}
            </span>
            <button
              type="button"
              className="icon-copy-chip"
              onClick={() => copyValue(row.id, "id")}
              aria-label={t("copyId")}
            >
              {copiedId ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedId ? t("copied") : t("copyId")}</span>
            </button>
          </div>
          <small className="order-date-row">
            <Clock3 size={12} /> {date(row.created_at, lang)}
          </small>
        </div>
        <div className="order-badges-cluster">
          <span
            className="payment-status-badge"
            data-payment-status={paymentBadge.tone}
          >
            {paymentBadge.label}
          </span>
          <span className="order-status-badge" data-status={row.status}>
            {orderStatusLabel(row.status, lang)}
          </span>
        </div>
      </div>

      <ol className="timeline" aria-label={t("orderNumberLabel")}>
        {sequence.map((s, i) => {
          const done = i <= currentIdx;
          const active = s === row.status;
          return (
            <li
              key={s}
              aria-current={active ? "step" : undefined}
              data-done={done}
            >
              {done && <CheckCircle2 size={13} />}
              <span>{orderStatusLabel(s, lang)}</span>
            </li>
          );
        })}
      </ol>

      {items.length > 0 && (
        <div className="order-items-strip">
          <small className="order-items-label">
            <Package size={13} /> {t("orderItemsHeading")}
          </small>
          <ul className="order-items-ul">
            {items.map((it) => (
              <li key={it.id} className="order-item-row">
                <span className="order-item-name">
                  {it.product_name} × {it.quantity}
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
          {showWalletRetry && paymentMethodLower === "paymob_wallet" && (
            <label className="order-retry-wallet-label">
              <span>{t("paymentWalletPhoneLabel")}</span>
              <input
                type="tel"
                dir="ltr"
                inputMode="numeric"
                maxLength={11}
                value={walletPhone}
                onChange={(e) => {
                  setWalletPhone(e.target.value);
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
            onClick={handleRetryPayment}
          >
            <RefreshCw size={14} className={retrying ? "spin-icon" : undefined} />
            <span>{retrying ? t("paymentRetryingBtn") : t("paymentRetryBtn")}</span>
          </button>
          {retryError && (
            <small role="alert" className="wallet-error-text">
              {retryError}
            </small>
          )}
        </div>
      )}

      {hasShippingInfo && (
        <div className="customer-shipping-card">
          <div className="customer-shipping-head">
            <span className="customer-shipping-title">
              <Truck size={15} />
              <strong>{row.shipping_carrier || t("shippingDetails")}</strong>
            </span>
            {row.shipped_at && (
              <small>
                {t("shippedOn")} {date(row.shipped_at, lang)}
              </small>
            )}
          </div>

          {row.tracking_number && (
            <div className="customer-tracking-row">
              <small>{t("trackingNumber")}:</small>
              <code dir="ltr">{row.tracking_number}</code>
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

          {row.tracking_url && (
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
      {state.error && (
        <p role="status" className="tracking-error">
          {state.error}
        </p>
      )}
      {state.row && <Timeline row={state.row} />}
    </section>
  );
}
