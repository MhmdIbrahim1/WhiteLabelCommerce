import type { Lang } from "./i18n";
import { money } from "./brand";

export type StorePixelsConfig = {
  metaPixelId: string;
  tiktokPixelId: string;
  ga4MeasurementId: string;
};

export type AbandonedCartStatus = "open" | "reminded" | "recovered" | "dismissed";
export type AbandonedCartSource = "web" | "android";

export type AbandonedCartItem = {
  id: string;
  name: string;
  name_en?: string | null;
  quantity: number;
  price: number;
  size?: string | null;
  color?: string | null;
};

export type AbandonedCartRecord = {
  id: string;
  store_id: string;
  user_id: string | null;
  session_key: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  items: AbandonedCartItem[];
  subtotal: number;
  currency: string;
  source: AbandonedCartSource;
  status: AbandonedCartStatus;
  recovery_coupon_code: string | null;
  reminder_count: number;
  last_reminded_at: string | null;
  recovered_order_id: string | null;
  created_at: string;
  updated_at: string;
};

export function sanitizeMetaPixelId(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, "");
}

export function validateMetaPixelId(raw: string | null | undefined): {
  valid: boolean;
  value: string;
} {
  const value = sanitizeMetaPixelId(raw);
  if (!value) return { valid: true, value: "" };
  return { valid: /^[0-9]{5,20}$/.test(value), value };
}

export function sanitizeTiktokPixelId(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function validateTiktokPixelId(raw: string | null | undefined): {
  valid: boolean;
  value: string;
} {
  const value = sanitizeTiktokPixelId(raw);
  if (!value) return { valid: true, value: "" };
  return { valid: /^[A-Z0-9]{6,32}$/.test(value), value };
}

export function sanitizeGa4Id(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function validateGa4Id(raw: string | null | undefined): {
  valid: boolean;
  value: string;
} {
  const value = sanitizeGa4Id(raw);
  if (!value) return { valid: true, value: "" };
  return { valid: /^G-[A-Z0-9]{4,20}$/.test(value), value };
}

export function normalizeAbandonedCartItems(raw: unknown): AbandonedCartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): AbandonedCartItem | null => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const qty = Number(obj.quantity ?? 0);
      const price = Number(obj.price ?? obj.unit_price ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) return null;
      return {
        id: String(obj.id ?? obj.product_id ?? ""),
        name: String(obj.name ?? obj.product_name ?? ""),
        name_en: typeof obj.name_en === "string" ? obj.name_en : null,
        quantity: Math.round(qty),
        price: Number.isFinite(price) ? price : 0,
        size: typeof obj.size === "string" && obj.size.trim() ? obj.size.trim() : null,
        color:
          typeof obj.color === "string" && obj.color.trim() ? obj.color.trim() : null,
      };
    })
    .filter((item): item is AbandonedCartItem => item !== null);
}

export function normalizeAbandonedCartRecord(
  raw: Record<string, unknown>,
): AbandonedCartRecord {
  const rawStatus = String(raw.status ?? "open");
  const rawSource = String(raw.source ?? "web");
  return {
    id: String(raw.id ?? ""),
    store_id: String(raw.store_id ?? ""),
    user_id: typeof raw.user_id === "string" ? raw.user_id : null,
    session_key: String(raw.session_key ?? ""),
    customer_name:
      typeof raw.customer_name === "string" ? raw.customer_name : null,
    customer_email:
      typeof raw.customer_email === "string" ? raw.customer_email : null,
    customer_phone:
      typeof raw.customer_phone === "string" ? raw.customer_phone : null,
    items: normalizeAbandonedCartItems(raw.items),
    subtotal: Number(raw.subtotal ?? 0),
    currency: String(raw.currency ?? "EGP"),
    source: rawSource === "android" ? "android" : "web",
    status:
      rawStatus === "reminded" ||
      rawStatus === "recovered" ||
      rawStatus === "dismissed"
        ? rawStatus
        : "open",
    recovery_coupon_code:
      typeof raw.recovery_coupon_code === "string"
        ? raw.recovery_coupon_code
        : null,
    reminder_count: Number(raw.reminder_count ?? 0),
    last_reminded_at:
      typeof raw.last_reminded_at === "string" ? raw.last_reminded_at : null,
    recovered_order_id:
      typeof raw.recovered_order_id === "string"
        ? raw.recovered_order_id
        : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? raw.created_at ?? ""),
  };
}

export function abandonedCartStatusMeta(
  status: AbandonedCartStatus,
  lang: Lang,
): { label: string; bg: string; color: string; border: string } {
  const isEn = lang === "en";
  switch (status) {
    case "reminded":
      return {
        label: isEn ? "Reminded" : "تم التذكير",
        bg: "#eff6ff",
        color: "#1d4ed8",
        border: "#bfdbfe",
      };
    case "recovered":
      return {
        label: isEn ? "Recovered" : "تم الاسترداد",
        bg: "#ecfdf5",
        color: "#047857",
        border: "#a7f3d0",
      };
    case "dismissed":
      return {
        label: isEn ? "Dismissed" : "تم التجاهل",
        bg: "#f1f5f9",
        color: "#475569",
        border: "#cbd5e1",
      };
    default:
      return {
        label: isEn ? "Open" : "مفتوحة",
        bg: "#fffbeb",
        color: "#b45309",
        border: "#fde68a",
      };
  }
}

export function formatWhatsAppPhone(rawPhone: string | null | undefined): string {
  const digits = (rawPhone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // Normalize Egyptian 01XXXXXXXXX -> 201XXXXXXXXX
  if (/^01[0125][0-9]{8}$/.test(digits)) {
    return "2" + digits;
  }
  if (/^00/.test(digits)) {
    return digits.slice(2);
  }
  return digits;
}

export function buildWhatsAppRecoveryUrl(params: {
  phone: string | null | undefined;
  customerName?: string | null;
  storeName: string;
  items: AbandonedCartItem[];
  subtotal: number;
  currency: string;
  cartUrl: string;
  couponCode?: string | null;
  lang: Lang;
}): string | null {
  const waPhone = formatWhatsAppPhone(params.phone);
  if (!waPhone) return null;

  const isEn = params.lang === "en";
  const name = params.customerName?.trim();
  const totalFormatted = money(params.subtotal, params.currency, params.lang);
  const itemLines = params.items
    .slice(0, 4)
    .map((it) => `• ${it.name} × ${it.quantity}`)
    .join("\n");
  const extraCount = Math.max(0, params.items.length - 4);
  const coupon = params.couponCode?.trim().toUpperCase();

  let message: string;
  if (isEn) {
    const greeting = name ? `Hi ${name},` : "Hello,";
    const lines = [
      `${greeting} we noticed you left some items in your bag at ${params.storeName}:`,
      itemLines + (extraCount > 0 ? `\n+ ${extraCount} more item(s)` : ""),
      `Total: ${totalFormatted}`,
    ];
    if (coupon) {
      lines.push(`Use promo code ${coupon} at checkout for an instant discount!`);
    }
    lines.push(`Complete your order here: ${params.cartUrl}`);
    message = lines.join("\n\n");
  } else {
    const greeting = name ? `أهلاً ${name}،` : "أهلاً بك،";
    const lines = [
      `${greeting} لاحظنا أنك تركت بعض المنتجات في سلة التسوق لدى ${params.storeName}:`,
      itemLines + (extraCount > 0 ? `\n+ ${extraCount} منتجات أخرى` : ""),
      `الإجمالي: ${totalFormatted}`,
    ];
    if (coupon) {
      lines.push(`استخدم كود الخصم ${coupon} عند إتمام الطلب للحصول على خصم فوري!`);
    }
    lines.push(`يمكنك إكمال طلبك مباشرة من هنا: ${params.cartUrl}`);
    message = lines.join("\n\n");
  }

  return `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
}

export function formatTimeAgo(isoDate: string, lang: Lang): string {
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const isEn = lang === "en";
  if (diffSec < 60) return isEn ? "Just now" : "الآن";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return isEn ? `${mins}m ago` : `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isEn ? `${hours}h ago` : `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return isEn ? `${days}d ago` : `منذ ${days} يوم`;
}
