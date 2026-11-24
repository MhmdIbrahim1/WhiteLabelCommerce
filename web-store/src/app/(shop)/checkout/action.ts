"use server";
import { serverDb } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { normalizePhone } from "@/lib/phone";

export type CheckoutResult = {
  id?: string;
  total?: number;
  currency?: string;
  error?: string;
};

export type CouponPreviewResult = {
  valid: boolean;
  code?: string;
  discountAmount?: number;
  message: string;
};

export async function previewCoupon(
  code: string,
  subtotal: number,
): Promise<CouponPreviewResult> {
  const isEn = (await getServerLang()) === "en";
  const clean = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (clean.length < 2) {
    return {
      valid: false,
      message: isEn ? "Enter a valid promo code." : "أدخل كود خصم صالحاً.",
    };
  }
  const db = await serverDb();
  const { data, error } = await db
    .rpc("validate_coupon", { p_code: clean, p_subtotal: subtotal })
    .maybeSingle<{
      valid: boolean;
      reason: string;
      code: string;
      discount_type: string | null;
      discount_value: number;
      discount_amount: number;
      min_order_amount: number;
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
  const allowedPayments = new Set(["cod", "paymob_card", "paymob_wallet"]);
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

  const db = await serverDb();
  const { data, error } = await db
    .rpc("store_checkout", {
      request_key: request,
      address: shippingAddress,
      customer_phone: digits,
      payment: normalizedPayment,
      lines,
      p_coupon_code: cleanCoupon,
      p_customer_name: cleanName,
    })
    .single<{ order_number: string; amount: number; order_currency: string }>();

  if (error || !data) {
    switch (error?.message) {
      case "payment_method_disabled":
        return {
          error: isEn
            ? "Selected payment method is currently unavailable."
            : "طريقة الدفع المختارة غير متاحة حالياً.",
        };
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
      case "invalid_coupon":
        return {
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
  return {
    id: data.order_number,
    total: data.amount,
    currency: data.order_currency,
  };
}
