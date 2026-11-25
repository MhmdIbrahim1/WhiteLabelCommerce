"use client";

import { useEffect } from "react";
import { CheckCircle2, Clock3, AlertCircle } from "lucide-react";
import {
  clearCart,
  clearPendingOnlineOrder,
  getPendingOnlineOrder,
} from "./cart-store";
import { useLanguage } from "@/components/language-provider";

export function OrdersPaymentSync({
  paymentCallback,
  callbackOrder,
  placedCod,
  placedWallet = false,
  paidOrderIds,
}: {
  paymentCallback: string;
  callbackOrder: string;
  placedCod: boolean;
  placedWallet?: boolean;
  paidOrderIds: string[];
}) {
  const { lang, t } = useLanguage();
  const isEn = lang === "en";

  useEffect(() => {
    const pendingId = getPendingOnlineOrder();
    const pendingNowPaid =
      Boolean(pendingId) && paidOrderIds.includes(pendingId!);

    // Clear cart ONLY on confirmed online payment (?payment=success or pending order now paid).
    // Never clear cart on ?payment=failed so the customer can retry seamlessly.
    if (paymentCallback === "success" || pendingNowPaid) {
      clearCart();
      clearPendingOnlineOrder();
    }
  }, [paymentCallback, paidOrderIds]);

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
        {callbackOrder && <code dir="ltr">#{callbackOrder.slice(0, 8)}</code>}
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
        {callbackOrder && <code dir="ltr">#{callbackOrder.slice(0, 8)}</code>}
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
      {callbackOrder && <code dir="ltr">#{callbackOrder.slice(0, 8)}</code>}
    </div>
  );
}
