export type PaymentOptions = {
  codEnabled: boolean; paymobEnabled: boolean; paymobCardEnabled: boolean; paymobWalletEnabled: boolean;
};

export type PaymentOrder = {
  id: string; payment_method?: string | null; payment_status?: string | null; status: string;
  reservation_expires_at?: string | null;
};

export type ReceiptLine = { id: string; size: string; color: string; quantity: number };
export type OrderReceipt = PaymentOrder & {
  store_id: string; total: number; currency: string; guest: boolean;
  lines: (ReceiptLine & { name: string; price: number })[];
};

export const walletPhonePattern = /^01[0125][0-9]{8}$/;
export function canRetryOrder(order: PaymentOrder, now = Date.now()) {
  return ["pending", "confirmed"].includes(order.status) &&
    ["paymob_card", "paymob_wallet"].includes(order.payment_method ?? "") &&
    ["unpaid", "pending", "failed"].includes(order.payment_status ?? "") &&
    (!order.reservation_expires_at || Date.parse(order.reservation_expires_at) > now);
}

const payments: Record<string, [string, string]> = {
  paid: ["Paid", "مدفوع"], unpaid: ["Unpaid", "غير مدفوع"], failed: ["Payment failed", "فشل الدفع"],
  pending: ["Awaiting payment", "بانتظار الدفع"], cod_pending: ["Cash on delivery", "دفع عند الاستلام"],
  refunded: ["Refunded", "مسترد"], refund_pending: ["Refund pending", "استرداد معلق"], voided: ["Voided", "أُلغي الدفع"],
};
const fulfillment: Record<string, [string, string]> = {
  pending: ["Awaiting confirmation", "بانتظار التأكيد"], confirmed: ["Confirmed", "مؤكد"], shipped: ["Shipped", "تم الشحن"],
  delivered: ["Delivered", "تم التوصيل"], cancelled: ["Cancelled", "ملغي"],
};
export function orderLabels(order: PaymentOrder, en: boolean) {
  const status = order.payment_status ?? "";
  const payment = order.payment_method === "cod" && ["unpaid", "pending"].includes(status) ? "cod_pending" : status;
  const i = en ? 0 : 1;
  return {
    payment: payments[payment]?.[i] ?? (en ? "Unknown" : "غير معروف"),
    fulfillment: fulfillment[order.status]?.[i] ?? (en ? "Unknown" : "غير معروف")
  };
}

export function paymentOutcome(status?: string | null) {
  if (status === "paid") return "success";
  if (status === "failed") return "failed";
  return status === "pending" || status === "unpaid" ? "pending" : "";
}

export function cartSignature(lines: readonly ReceiptLine[]) {
  return JSON.stringify(lines.map(l => JSON.stringify([l.id, l.color, l.size, l.quantity])).sort());
}
