"use client";

import { formatOrderNumber } from "@/lib/order-number";
import { showToast, ToastFeedback } from "@/components/floating-toast";
import { useActionState, useState } from "react";
import Link from "next/link";
import { OrderBadges, OrderPaymentControls } from "./order-payment-controls";
import type { PaymentOptions } from "@/lib/order-payment";
import {
  Truck,
  Copy,
  Check,
  ExternalLink,
  Clock3,
  FileText,
  Package,
  XCircle,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import {
  track,
  type Summary,
} from "@/app/(shop)/orders/actions";
import { translateColor } from "@/lib/i18n";
import { date } from "@/lib/brand";
import { useLanguage } from "@/components/language-provider";
import { isSafeHttpUrl, localizeCarrierLabel } from "@/lib/shipping";
import { OrderReturnPanel } from "./order-return-panel";
export function Timeline({
  row,
  index = 0,
  detailHref,
  currency = "EGP",
  hideReturnPanel = false, options, basePath,
}: {
  row: Summary;
  index?: number;
  detailHref?: string;
  currency?: string;
  hideReturnPanel?: boolean;
  options: PaymentOptions; basePath: string;
}) {
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const [copiedId, setCopiedId] = useState(false);
  const [copiedAwb, setCopiedAwb] = useState(false);
  const effectiveStatus = row.status;

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
        <OrderBadges order={row} />
      </div>

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

      <OrderPaymentControls order={row} options={options} basePath={basePath} phone={row.phone} />

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

export function GuestTracking({ options, basePath }: { options: PaymentOptions; basePath: string }) {
  const { t, lang } = useLanguage();
  const [state, action, busy] = useActionState(track, {});
  return (
    <section className="panel order-panel">
      <h2>{t("guestTrackTitle")}</h2>
      <form action={action}>
        <label>
          {lang === "en" ? "Tracking reference" : "رقم تتبع الطلب"}
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
      {state.row && <Timeline row={state.row} options={options} basePath={basePath} />}
    </section>
  );
}
