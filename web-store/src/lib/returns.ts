import type { Lang } from "./i18n";

export type ReturnRequestType = "return" | "exchange";
export type ReturnRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "received"
  | "refunded";
export type ReturnRefundMethod = "wallet" | "original_payment";

export type ReturnRequestItem = {
  order_item_id?: string | null;
  product_id?: string | null;
  variant_id?: string | null;
  product_name: string;
  quantity: number;
  max_quantity?: number;
  unit_price: number;
  line_total?: number;
  size?: string | null;
  color?: string | null;
};

export type ReturnRequestRecord = {
  id: string;
  store_id: string;
  order_id: string;
  user_id: string;
  request_type: ReturnRequestType;
  status: ReturnRequestStatus;
  refund_method: ReturnRefundMethod;
  reason: string;
  customer_notes: string | null;
  admin_notes: string | null;
  refund_amount: number;
  items: ReturnRequestItem[];
  restocked: boolean;
  wallet_credited: boolean;
  created_at: string;
  updated_at: string;
};

export const RETURN_REASON_OPTIONS = [
  {
    code: "wrong_size",
    ar: "المقاس غير مناسب",
    en: "Wrong size or fit",
  },
  {
    code: "damaged",
    ar: "المنتج تالف أو به عيب صناعة",
    en: "Item arrived damaged or defective",
  },
  {
    code: "wrong_item",
    ar: "استلمت منتجاً مختلفاً عن طلبي",
    en: "Received wrong item",
  },
  {
    code: "not_as_described",
    ar: "المنتج لا يطابق الوصف أو الصور",
    en: "Item does not match description",
  },
  {
    code: "changed_mind",
    ar: "لم أعد بحاجة إلى المنتج",
    en: "Changed my mind",
  },
  {
    code: "other",
    ar: "سبب آخر",
    en: "Other reason",
  },
] as const;

export function hasActiveReturn(
  req: ReturnRequestRecord | null | undefined,
): boolean {
  if (!req) return false;
  return (
    req.status === "pending" ||
    req.status === "approved" ||
    req.status === "received" ||
    req.status === "refunded"
  );
}

export function normalizeReturnItems(raw: unknown): ReturnRequestItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): ReturnRequestItem | null => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const qty = Number(obj.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) return null;
      const unitPrice = Number(obj.unit_price ?? 0);
      return {
        order_item_id:
          typeof obj.order_item_id === "string" ? obj.order_item_id : null,
        product_id: typeof obj.product_id === "string" ? obj.product_id : null,
        variant_id: typeof obj.variant_id === "string" ? obj.variant_id : null,
        product_name: String(obj.product_name ?? ""),
        quantity: Math.round(qty),
        max_quantity:
          typeof obj.max_quantity === "number" ? obj.max_quantity : undefined,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        line_total: Number.isFinite(Number(obj.line_total))
          ? Number(obj.line_total)
          : Math.round(unitPrice * qty * 100) / 100,
        size: typeof obj.size === "string" ? obj.size : null,
        color: typeof obj.color === "string" ? obj.color : null,
      };
    })
    .filter((item): item is ReturnRequestItem => item !== null);
}

export function normalizeReturnRecord(
  raw: Record<string, unknown>,
): ReturnRequestRecord {
  const rawType = String(raw.request_type ?? "return");
  const rawStatus = String(raw.status ?? "pending");
  const rawMethod = String(raw.refund_method ?? "wallet");
  return {
    id: String(raw.id ?? ""),
    store_id: String(raw.store_id ?? ""),
    order_id: String(raw.order_id ?? ""),
    user_id: String(raw.user_id ?? ""),
    request_type: rawType === "exchange" ? "exchange" : "return",
    status:
      rawStatus === "approved" ||
      rawStatus === "rejected" ||
      rawStatus === "received" ||
      rawStatus === "refunded"
        ? rawStatus
        : "pending",
    refund_method:
      rawMethod === "original_payment" ? "original_payment" : "wallet",
    reason: String(raw.reason ?? ""),
    customer_notes:
      typeof raw.customer_notes === "string" ? raw.customer_notes : null,
    admin_notes: typeof raw.admin_notes === "string" ? raw.admin_notes : null,
    refund_amount: Number(raw.refund_amount ?? 0),
    items: normalizeReturnItems(raw.items),
    restocked: Boolean(raw.restocked),
    wallet_credited: Boolean(raw.wallet_credited),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? raw.created_at ?? ""),
  };
}

export function returnStatusMeta(
  status: ReturnRequestStatus,
  lang: Lang,
): { label: string; bg: string; color: string; border: string } {
  const isEn = lang === "en";
  switch (status) {
    case "approved":
      return {
        label: isEn ? "Approved" : "مقبول",
        bg: "#eff6ff",
        color: "#1d4ed8",
        border: "#bfdbfe",
      };
    case "received":
      return {
        label: isEn ? "Item Received" : "تم استلام المرتجع",
        bg: "#f5f3ff",
        color: "#6d28d9",
        border: "#ddd6fe",
      };
    case "refunded":
      return {
        label: isEn ? "Refunded" : "تم الاسترداد",
        bg: "#ecfdf5",
        color: "#047857",
        border: "#a7f3d0",
      };
    case "rejected":
      return {
        label: isEn ? "Rejected" : "مرفوض",
        bg: "#fef2f2",
        color: "#b91c1c",
        border: "#fecaca",
      };
    default:
      return {
        label: isEn ? "Pending Review" : "قيد المراجعة",
        bg: "#fffbeb",
        color: "#b45309",
        border: "#fde68a",
      };
  }
}

export function returnTypeLabel(type: ReturnRequestType, lang: Lang): string {
  if (lang === "en") return type === "exchange" ? "Exchange" : "Return";
  return type === "exchange" ? "استبدال" : "إرجاع";
}

export function refundMethodLabel(
  method: ReturnRefundMethod,
  lang: Lang,
): string {
  if (lang === "en") {
    return method === "wallet"
      ? "Store Wallet (Instant)"
      : "Original Payment Method";
  }
  return method === "wallet"
    ? "محفظة المتجر (فوري)"
    : "وسيلة الدفع الأصلية";
}

export function localizeReturnReason(rawReason: string, lang: Lang): string {
  const clean = rawReason.trim();
  const matched = RETURN_REASON_OPTIONS.find(
    (opt) =>
      opt.code === clean.toLowerCase() ||
      opt.ar === clean ||
      opt.en.toLowerCase() === clean.toLowerCase(),
  );
  if (!matched) return clean;
  return lang === "en" ? matched.en : matched.ar;
}
