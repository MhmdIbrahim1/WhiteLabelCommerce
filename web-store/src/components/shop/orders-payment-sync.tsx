"use client";

import { formatOrderNumber, trackingReference } from "@/lib/order-number";
import { showToast } from "@/components/floating-toast";
import { useEffect } from "react";
import { CheckCircle2, Clock3, AlertCircle, Copy } from "lucide-react";
import {
  consumeReceipt,
  discardCheckout,
  markWebCartRecovered,
  useCartScope,
} from "./cart-store";
import type { OrderReceipt } from "@/lib/order-payment";
import { trackPurchase } from "@/lib/analytics";
import { useLanguage } from "@/components/language-provider";

function ReceiptReference({ id, guest, en }: { id: string; guest: boolean; en: boolean }) {
  const reference = trackingReference(id);
  if (!reference) return null;
  if (!guest) return <code dir="ltr"><bdi dir="ltr">{formatOrderNumber(reference)}</bdi></code>;

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast({ kind: "success", message: en ? "Tracking reference copied." : "تم نسخ رقم التتبع." });
    } catch {
      showToast({ kind: "error", message: en ? "Select the tracking reference and copy it." : "حدّد رقم التتبع وانسخه." });
    }
  }

  return <div className="receipt-tracking-reference">
    <span>{en ? "Tracking reference" : "رقم تتبع الطلب"}</span>
    <bdi dir="ltr" className="tabular-nums">{reference}</bdi>
    <button type="button" className="icon-copy-chip" onClick={() => void copy(reference)}>
      <Copy size={15} strokeWidth={1.5} aria-hidden="true"/>{en ? "Copy reference" : "نسخ رقم التتبع"}
    </button>
  </div>;
}

export function OrdersPaymentSync({
  guest,
  paymentCallback,
  callbackOrder,
  placedCod,
  placedWallet = false,
  placedCoupon = false, receipt,
}: {
  guest: boolean;
  paymentCallback: string;
  callbackOrder: string;
  placedCod: boolean;
  placedWallet?: boolean;
  placedCoupon?: boolean;
  receipt?: OrderReceipt | null;
}) {
  const { lang, t } = useLanguage();
  const scope = useCartScope();
  const isEn = lang === "en";

  useEffect(() => {
    if (!receipt || receipt.store_id !== scope.storeId) return;
    if (receipt.status === "cancelled") {
      void discardCheckout(scope, receipt.id).catch(() => undefined);
      return;
    }
    void consumeReceipt(scope, receipt).then(consumed => {
      if (!consumed) return;
      markWebCartRecovered(scope, receipt.id);
      trackPurchase({
        storeId: scope.storeId, orderId: receipt.id, value: receipt.total, currency: receipt.currency, items: receipt.lines.map(l => ({
          id: l.id, name: l.name, price: l.price, quantity: l.quantity, variant: [l.size, l.color].filter(Boolean).join(" / ") || undefined,
        }))
      });
    }).catch(() => undefined);
  }, [receipt, scope]);

  if (placedCoupon) return <div className="payment-callback-banner is-success" role="status">
    <strong>{isEn ? "Order confirmed. Your coupon covered the full amount." : "تم تأكيد طلبك. غطّى الكوبون كامل المبلغ."}</strong>
    <ReceiptReference id={callbackOrder} guest={guest} en={isEn} /></div>;

  if (placedWallet) {
    return (
      <div className="payment-callback-banner is-success" role="status">
        <span className="payment-banner-main">
          <CheckCircle2 size={18} aria-hidden="true" />
          <strong>
            {isEn
              ? "Order confirmed & paid in full via Store Wallet!"
              : "تم تأكيد طلبك وسداده بالكامل عبر رصيد محفظة المتجر!"}
          </strong>
        </span>
        <ReceiptReference id={callbackOrder} guest={guest} en={isEn}/>
      </div>
    );
  }

  if (placedCod) {
    return (
      <div className="payment-callback-banner is-success" role="status">
        <span className="payment-banner-main">
          <CheckCircle2 size={18} aria-hidden="true" />
          <strong>{t("paymentBannerCodSuccess")}</strong>
        </span>
        <ReceiptReference id={callbackOrder} guest={guest} en={isEn}/>
      </div>
    );
  }

  if (
    paymentCallback !== "success" &&
    paymentCallback !== "pending" &&
    paymentCallback !== "failed"
  ) {
    return null;
  }

  const Icon =
    paymentCallback === "success"
      ? CheckCircle2
      : paymentCallback === "pending"
        ? Clock3
        : AlertCircle;

  return (
    <div
      className={`payment-callback-banner is-${paymentCallback}`}
      role="status"
    >
      <span className="payment-banner-main">
        <Icon size={18} aria-hidden="true" />
        <strong>
          {paymentCallback === "success"
            ? t("paymentBannerSuccess")
            : paymentCallback === "pending"
              ? t("paymentBannerPending")
              : t("paymentBannerFailed")}
        </strong>
      </span>
      <ReceiptReference id={callbackOrder} guest={guest} en={isEn}/>
    </div>
  );
}
