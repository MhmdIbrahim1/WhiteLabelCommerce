"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { canRetryOrder, orderLabels, walletPhonePattern, type PaymentOptions, type PaymentOrder } from "@/lib/order-payment";
import { paymentDeadline, startOrderPayment, type InitiationState } from "@/lib/payment-client";
import { storeHref } from "@/lib/tenant-shared";
import { switchOrderToCodAction } from "@/app/(shop)/orders/actions";
import { readPaymentReceipt } from "@/app/(shop)/orders/payment-actions";

export function OrderBadges({ order }: { order: PaymentOrder }) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const labels = orderLabels(order, en);

  return (
    <div className="order-badges-cluster">
      <span className="payment-status-badge" data-payment-status={order.payment_status}>
        {en ? "Payment" : "حالة الدفع"} · {labels.payment}
      </span>
      <span className="order-status-badge" data-status={order.status}>
        {en ? "Fulfillment" : "حالة التجهيز"} · {labels.fulfillment}
      </span>
    </div>
  );
}

type RecoveryProps = {
  order: PaymentOrder;
  options: PaymentOptions;
  basePath: string;
  phone?: string | null;
  initialState?: InitiationState;
};

export function OrderPaymentControls({ order, options, basePath, phone, initialState }: RecoveryProps) {
  const { lang, t } = useLanguage();
  const en = lang === "en";
  const router = useRouter();
  const card = options.paymobEnabled && options.paymobCardEnabled;
  const wallet = options.paymobEnabled && options.paymobWalletEnabled;
  const [selected, setSelected] = useState<"card" | "wallet">(order.payment_method === "paymob_wallet" ? "wallet" : "card");
  const method = card && wallet ? selected : wallet ? "wallet" : "card";
  const [number, setNumber] = useState(phone && walletPhonePattern.test(phone) ? phone : "");
  const [error, setError] = useState("");
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [now, setNow] = useState(Date.now);
  const href = storeHref(basePath, "/orders?order=" + encodeURIComponent(order.id));

  useEffect(() => {
    if (!order.reservation_expires_at) return;
    const untilExpiry = Date.parse(order.reservation_expires_at) - Date.now() + 1;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(untilExpiry, 2147483647)));
    return () => clearTimeout(timer);
  }, [order.reservation_expires_at]);

  if (!canRetryOrder(order, now)) return null;

  async function pay(cod: boolean) {
    if (lock.current) return;
    setError("");
    if (!cod && method === "wallet" && !walletPhonePattern.test(number)) {
      setError(t("paymentWalletPhoneError"));
      return;
    }

    lock.current = true;
    setBusy(true);
    try {
      if (cod) {
        const result = await paymentDeadline(switchOrderToCodAction(order.id, phone ?? undefined));
        if (!result.ok) {
          setError(result.error ?? t("paymentRetryError"));
          return;
        }
        router.push(href + "&placed=cod");
        router.refresh();
      } else {
        setState(await startOrderPayment(basePath, order.id, method, number, phone));
      }
    } catch {
      setError(t("paymentRetryError"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function check() {
    try {
      const receipt = await paymentDeadline(readPaymentReceipt(order.id));
      if (receipt && !canRetryOrder(receipt)) {
        router.push(href);
        router.refresh();
      } else {
        setState(receipt?.payment_status === "failed" ? "failed" : "pending");
      }
    } catch {
      setError(t("paymentRetryError"));
    }
  }

  const waiting = state === "pending" || state === "processing";
  return (
    <div className="order-retry-payment-box">
      {waiting && <p role="status">
        {state === "processing"
          ? (en ? "Your payment is being prepared. Check its status in a moment." : "يجري تجهيز عملية الدفع. تحقّق من حالتها بعد قليل.")
          : (en ? "Awaiting wallet confirmation. Check your phone, then check payment status." : "بانتظار تأكيد المحفظة. راجع هاتفك ثم تحقّق من حالة الدفع.")}{" "}
        <button type="button" onClick={check}>{en ? "Check payment status" : "تحقّق من حالة الدفع"}</button>
      </p>}
      {state === "redirect" && <p role="status">
        {en ? "Continue in the payment window. If it didn’t open, retry below." : "أكمل الدفع في نافذة البوابة. إذا لم تُفتح، أعد المحاولة."}
      </p>}
      {(state === "unavailable" || state === "failed") && <p role="alert">
        {en ? "Payment was not completed. Retry this order or choose another method." : "لم يكتمل الدفع. أعد المحاولة لهذا الطلب أو اختر طريقة أخرى."}
      </p>}
      {card && wallet && <label>
        {en ? "Payment method" : "طريقة الدفع"}
        <select disabled={busy} value={method} onChange={e => setSelected(e.target.value === "wallet" ? "wallet" : "card")}>
          <option value="card">{t("paymentCardOption")}</option>
          <option value="wallet">{t("paymentWalletOption")}</option>
        </select>
      </label>}
      {wallet && method === "wallet" && <label>
        {t("paymentWalletPhoneLabel")}
        <input type="tel" inputMode="numeric" dir="ltr" value={number} maxLength={11}
          onChange={e => setNumber(e.target.value)} />
      </label>}
      <div className="order-actions">
        {(card || wallet) && <button type="button" disabled={busy} onClick={() => pay(false)}>
          {busy ? t("paymentRetryingBtn") : en ? "Retry Payment" : "إعادة محاولة الدفع"}
        </button>}
        {options.codEnabled && <button type="button" disabled={busy} onClick={() => pay(true)}>
          {en ? "Switch to Cash on Delivery" : "تحويل للدفع عند الاستلام"}
        </button>}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
