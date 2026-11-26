"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  MapPin,
  Phone,
  Package,
  Truck,
  Banknote,
  Store,
  AlertCircle,
} from "lucide-react";
import { date, money } from "@/lib/brand";
import { localizedText, orderStatusLabel } from "@/lib/i18n";
import { localizeCarrierLabel } from "@/lib/shipping";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { confirmDelivery } from "./action";

export type DeliveryInfo = {
  order_id: string;
  status: string;
  shipping_address: string;
  lat?: number | null;
  lng?: number | null;
  recipient_name?: string | null;
  phone: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  courier_note: string | null;
  total: number | null;
  currency: string;
  payment_method: string | null;
  item_count: number;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

export function DeliveryCard({
  token,
  storeName,
  storeNameEn,
  info,
}: {
  token: string;
  storeName: string;
  storeNameEn?: string;
  info: DeliveryInfo;
}) {
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const displayStoreName = localizedText(lang, storeName, storeNameEn ?? storeName);
  const [status, setStatus] = useState(info.status);
  const [deliveredAt, setDeliveredAt] = useState(info.delivered_at);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDelivered = status === "delivered";
  const canConfirm = status === "shipped";
  const isCod = (info.payment_method ?? "").trim().toLowerCase() === "cod";
  const carrierDisplay = localizeCarrierLabel(info.shipping_carrier, lang);

  const handleConfirm = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await confirmDelivery(token);
      if (res.error) {
        setFeedback(res.error);
        return;
      }
      if (
        res.outcome === "delivered" ||
        res.outcome === "already_delivered"
      ) {
        setStatus("delivered");
        setDeliveredAt(res.deliveredAt ?? new Date().toISOString());
        setFeedback(
          isEn
            ? "Delivery confirmed and order status updated."
            : "تم تأكيد تسليم الطلب وتحديث حالته بنجاح.",
        );
      } else if (res.outcome === "expired") {
        setFeedback(
          isEn
            ? "This delivery confirmation link has expired."
            : "انتهت صلاحية رابط تأكيد التسليم هذا.",
        );
      } else if (res.outcome === "invalid_state") {
        setFeedback(
          isEn
            ? "This order cannot be marked delivered in its current state."
            : "لا يمكن تأكيد تسليم هذا الطلب في حالته الحالية.",
        );
      } else {
        setFeedback(isEn ? "Order not found." : "تعذر العثور على الطلب.");
      }
    });
  };

  return (
    <main className="delivery-shell">
      <article className="delivery-card">
        <header className="delivery-header">
          <div className="delivery-brand">
            <span className="delivery-brand-icon">
              <Store size={18} />
            </span>
            <div>
              <strong>{displayStoreName}</strong>
              <small>{t("deliverySubtitle")}</small>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <LanguageToggle className="lang-toggle-pill" />
            <span className={`delivery-pill delivery-pill--${status}`}>
              {orderStatusLabel(status, lang)}
            </span>
          </div>
        </header>

        <section className="delivery-order-banner">
          <div>
            <small>{t("orderNumberLabel")}</small>
            <strong dir="ltr">#{info.order_id.slice(0, 8)}</strong>
          </div>
          <div className="delivery-amount">
            <small>
              <Banknote size={13} />{" "}
              {isCod ? t("deliveryCollectCod") : t("deliveryOrderValue")}
            </small>
            <strong>{money(info.total, info.currency, lang)}</strong>
          </div>
        </section>

        <section className="delivery-details">
          {info.shipping_address && (
            <div className="delivery-row">
              <MapPin size={18} />
              <div>
                <small>{t("deliveryAddress")}</small>
                <strong>{info.recipient_name}</strong><p>{info.shipping_address}</p>
                {info.lat != null && info.lng != null && <a href={`https://www.google.com/maps/search/?api=1&query=${info.lat},${info.lng}`} target="_blank" rel="noreferrer">{isEn ? "Open delivery pin" : "فتح موقع التوصيل"}</a>}
              </div>
            </div>
          )}

          {info.phone && (
            <div className="delivery-row">
              <Phone size={18} />
              <div>
                <small>{t("deliveryPhone")}</small>
                <a
                  href={`tel:${info.phone}`}
                  dir="ltr"
                  className="delivery-phone-link"
                >
                  {info.phone}
                </a>
              </div>
            </div>
          )}

          <div className="delivery-row">
            <Package size={18} />
            <div>
              <small>{t("deliveryItemsCount")}</small>
              <p>
                {info.item_count} {t("deliveryPieceUnit")}
              </p>
            </div>
          </div>

          {(carrierDisplay || info.tracking_number || info.courier_note) && (
            <div className="delivery-row">
              <Truck size={18} />
              <div>
                <small>{t("deliveryShippingInfo")}</small>
                <p>
                  {[carrierDisplay, info.tracking_number]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {info.courier_note && (
                  <small className="delivery-note">{info.courier_note}</small>
                )}
              </div>
            </div>
          )}
        </section>

        {isDelivered ? (
          <div className="delivery-success-box" role="status">
            <CheckCircle2 size={28} />
            <div>
              <strong>{t("deliverySuccessTitle")}</strong>
              {deliveredAt && (
                <small>
                  {t("deliveryDeliveredAt")}: {date(deliveredAt, lang)}
                </small>
              )}
            </div>
          </div>
        ) : canConfirm ? (
          <div className="delivery-cta-wrap">
            <button
              type="button"
              className="delivery-confirm-btn"
              disabled={isPending}
              onClick={handleConfirm}
            >
              <CheckCircle2 size={20} />
              {isPending ? t("deliveryConfirming") : t("deliveryConfirmBtn")}
            </button>
            <small>{t("deliveryConfirmHint")}</small>
          </div>
        ) : (
          <div className="delivery-warning-box" role="status">
            <AlertCircle size={20} />
            <span>
              {isEn
                ? `This order is currently "${orderStatusLabel(status, lang)}" and cannot be confirmed.`
                : `هذا الطلب في حالة (${orderStatusLabel(status, lang)}) ولا يمكن تأكيد تسليمه حالياً.`}
            </span>
          </div>
        )}

        {feedback && !isDelivered && (
          <p className="delivery-feedback" role="status">
            {feedback}
          </p>
        )}
      </article>
    </main>
  );
}
