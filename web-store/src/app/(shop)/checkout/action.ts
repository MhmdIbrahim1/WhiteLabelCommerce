"use server";
import { headers } from "next/headers";
import { REQUEST_ORIGIN_HEADER } from "@/lib/tenant-shared";
import { rememberCheckout } from "@/lib/order-receipt";
import { adminDb } from "@/lib/supabase/admin";
import { quotaFailure, quotaMessage } from "@/lib/billing";
import { serverDb } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { notifyOrderCreated } from "@/lib/notifications/events";
import { orderLimitError } from "@/lib/variant-stock";
import { normalizePhone } from "@/lib/phone";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";

export type CheckoutResult = {
  id?: string;
  total?: number;
  currency?: string;
  error?: string;
  changedTotal?: number;
  refreshQuote?: boolean;
  method?: string;
  paymentStatus?: string;
  status?: string;
  expiresAt?: string | null;
};

export type CouponPreviewResult = {
  valid: boolean;
  code?: string;
  discountAmount?: number;
  subtotal?: number;
  message: string;
};

export async function previewCoupon(
  code: string,
  lines: { id: string; quantity: number }[],
): Promise<CouponPreviewResult> {
  const isEn = (await getServerLang()) === "en";
  const clean = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (clean.length < 2) {
    return {
      valid: false,
      message: isEn ? "Enter a valid promo code." : "أدخل كود خصم صالحاً.",
    };
  }
  const [db, store] = await Promise.all([
    serverDb(),
    resolveActiveStoreOrDefault(),
  ]);
  const { data, error } = await db
    .rpc("quote_checkout_coupon", {
      p_code: clean,
      p_lines: lines,
      p_store: store.id,
    })
    .maybeSingle<{
      valid: boolean;
      reason: string;
      code: string;
      discount_type: string | null;
      discount_value: number;
      discount_amount: number;
      min_order_amount: number;
      subtotal: number;
    }>();

  if (error || !data) {
    return {
      valid: false,
      message: isEn
        ? "Could not verify promo code right now."
        : "تعذر التحقق من كود الخصم حالياً.",
    };
  }

  if (!data.valid) {
    switch (data.reason) {
      case "expired":
        return {
          valid: false,
          message: isEn ? "This coupon has expired." : "انتهت صلاحية هذا الكوبون.",
        };
      case "max_uses_reached":
        return {
          valid: false,
          message: isEn
            ? "This coupon has reached its usage limit."
            : "بلغ الكوبون الحد الأقصى للاستخدام.",
        };
      case "min_order_not_met":
        return {
          valid: false,
          message: isEn
            ? `Minimum order amount for this coupon is ${data.min_order_amount}.`
            : `الحد الأدنى لتطبيق الكوبون هو ${data.min_order_amount}.`,
        };
      default:
        return {
          valid: false,
          message: isEn
            ? "Invalid or inactive promo code."
            : "كود الخصم غير صحيح أو غير مفعّل.",
        };
    }
  }

  return {
    valid: true,
    code: data.code,
    subtotal: Number(data.subtotal),
    discountAmount: Number(data.discount_amount ?? 0),
    message: isEn
      ? `Coupon (${data.code}) applied successfully.`
      : `تم تطبيق الكوبون (${data.code}) بنجاح.`,
  };
}

export async function checkout(
  request: string,
  address: string,
  phone: string,
  payment: string,
  lines: { id: string; quantity: number; size: string; color: string }[],
  couponCode?: string,
  customerName?: string,
  useWallet = false,
  delivery?: { governorate: string; lat: number | null; lng: number | null },
  expectedTotal?: number,
): Promise<CheckoutResult> {
  const isEn = (await getServerLang()) === "en";
  const shippingAddress = typeof address === "string" ? address.trim() : "";
  const addressLength = Array.from(shippingAddress).length;
  if (addressLength < 3 || addressLength > 500)
    return {
      error: isEn
        ? "Enter a shipping address between 3 and 500 characters."
        : "أدخل عنوان شحن بين ٣ و٥٠٠ حرف.",
    };
  const digits = typeof phone === "string" ? normalizePhone(phone) : "";
  if (!/^[0-9]{8,15}$/.test(digits))
    return {
      error: isEn
        ? "Enter a valid phone number (8 to 15 digits)."
        : "أدخل رقم هاتف صحيحًا من ٨ إلى ١٥ رقمًا.",
    };
  const normalizedPayment =
    typeof payment === "string"
      ? payment.trim().toUpperCase() === "COD"
        ? "cod"
        : payment.trim().toLowerCase()
      : "";
  const allowedPayments = new Set(["cod", "paymob_card", "paymob_wallet", "wallet", "coupon"]);
  if (
    !Array.isArray(lines) ||
    !lines.length ||
    lines.length > 100 ||
    !allowedPayments.has(normalizedPayment)
  )
    return {
      error: isEn
        ? "Please check your bag and payment method."
        : "تحقق من السلة وطريقة الدفع.",
    };

  const cleanCoupon =
    typeof couponCode === "string" && couponCode.trim()
      ? couponCode.trim().toUpperCase()
      : null;
  const cleanName =
    typeof customerName === "string" && customerName.trim()
      ? customerName.trim().slice(0, 100)
      : null;

  const [db, store] = await Promise.all([
    serverDb(),
    resolveActiveStoreOrDefault(),
  ]);
  if (typeof expectedTotal !== "number" || !Number.isFinite(expectedTotal)) return { error: isEn ? "Review your order total." : "راجع إجمالي الطلب." };
  const origin = (await headers()).get(REQUEST_ORIGIN_HEADER);
  const release = await adminDb().rpc("release_expired_unpaid_orders", { p_store: store.id, p_limit: 50 });
  if (release.error) return { error: isEn ? "Checkout is temporarily unavailable." : "تعذر إتمام الشراء حالياً." };
  const { data, error } = await db
    .rpc("checkout_reviewed", {
      p_expected_total: expectedTotal,
      p_checkout_base: origin ? origin + store.basePath : null,
      p_delivery: delivery ?? {},
      request_key: request,
      address: shippingAddress,
      customer_phone: digits,
      payment: normalizedPayment,
      lines,
      p_coupon_code: cleanCoupon,
      p_customer_name: cleanName,
      p_use_wallet: Boolean(useWallet) || normalizedPayment === "wallet",
      p_store_id: store.id,
    })
    .single<{ order_number: string; amount: number; order_currency: string; method: string; pay_status: string; fulfillment: string; expires_at: string | null; created: boolean; guest: boolean }>();

  if (error || !data) {
    const quota = quotaFailure(error);
    if (quota?.resource === "orders") return { error: quotaMessage("orders", isEn ? "en" : "ar") };
    switch (error?.message) {
      case "checkout_quote_changed":
        return { changedTotal: Number(error?.details), error: isEn ? "The total changed. Review the new amount before confirming." : "تغيّر الإجمالي. راجع المبلغ الجديد قبل التأكيد." };
      case "store_suspended":
        return {
          error: isEn
            ? "This store is temporarily unavailable and not accepting orders."
            : "هذا المتجر متوقف مؤقتاً ولا يستقبل طلبات حالياً.",
        };
      case "insufficient_wallet_balance":
        return {
          error: isEn
            ? "Your wallet balance is no longer sufficient to cover the full order."
            : "رصيد المحفظة لم يعد كافياً لتغطية كامل قيمة الطلب.",
        };
      case "payment_method_disabled":
        return {
          refreshQuote: true,
          error: isEn
            ? "Selected payment method is currently unavailable."
            : "طريقة الدفع المختارة غير متاحة حالياً.",
        };
      case "max_order_qty_exceeded": {
        let allowed: number | undefined;
        try {
          const detail = JSON.parse(error?.details ?? "{}");
          if (Number.isInteger(detail.allowed) && detail.allowed >= 0) allowed = detail.allowed;
        } catch {}
        return { error: orderLimitError(isEn ? "en" : "ar", allowed) };
      }
      case "stock_unavailable":
        return {
          error: isEn
            ? "Stock has changed. Please review your bag quantities."
            : "تغيّر المخزون. راجع كميات السلة.",
        };
      case "invalid_variant":
        return {
          error: isEn
            ? "Product options changed. Please re-select from the store."
            : "تغيّرت خيارات المنتج. أعد اختياره من المتجر.",
        };
      case "coupon_does_not_cover_order":
        return { refreshQuote: true, changedTotal: Number(error?.details), error: isEn ? "The coupon no longer covers the full order. Review your updated total." : "لم يعد الكوبون يغطي كامل الطلب. راجع الإجمالي المحدّث." };
      case "invalid_coupon":
        return {
          refreshQuote: true,
          error: isEn
            ? "Promo code is no longer valid. Remove it or try another."
            : "كود الخصم لم يعد صالحاً. أزله أو جرّب كوداً آخر.",
        };
      case "invalid_quantity":
      case "invalid_cart":
        return {
          error: isEn
            ? "Please review the items and quantities in your bag."
            : "راجع المنتجات والكميات في السلة.",
        };
    }
    console.error("store_checkout failed", {
      code: error?.code || "NO_RECEIPT",
    });
    return {
      error: isEn
        ? "Order service is temporarily unavailable. Please try again."
        : "خدمة تأكيد الطلب غير متاحة الآن. أعد المحاولة لاحقًا.",
    };
  }
  // Fire-and-forget bilingual notifications (customer confirmation, admin alert, low-stock alerts)
  await rememberCheckout(store.id, data.order_number, data.guest);
  if (data.created) void notifyOrderCreated(data.order_number);

  return {
    id: data.order_number,
    total: Number(data.amount), method: data.method, paymentStatus: data.pay_status, status: data.fulfillment, expiresAt: data.expires_at,
    currency: data.order_currency,
  };
}
