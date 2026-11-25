import { adminDb } from "@/lib/supabase/admin";
import { dispatchNotification, notifyStoreAdmins } from "./dispatcher";

type OrderEventRow = {
  id: string;
  store_id: string;
  user_id: string | null;
  phone: string | null;
  total: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_status: string;
  shipping_carrier: string | null;
  tracking_number: string | null;
};

type OrderItemProductRow = {
  product_id: string | null;
  product_name: string;
  products?:
    | { id: string; name: string; name_en: string | null; stock: number }
    | { id: string; name: string; name_en: string | null; stock: number }[]
    | null;
};

function shortOrderId(id: string): string {
  return `#${id.slice(0, 8)}`;
}

/** Wraps #xxxxxxxx in Unicode LTR isolate so '#' never flips sides in RTL Arabic prose. */
function rtlSafeOrderCode(id: string): string {
  return `\u2066#${id.slice(0, 8)}\u2069`;
}

function formatArabicCurrency(currency: string): string {
  return currency.trim().toUpperCase() === "EGP" ? "ج.م" : currency;
}

/**
 * Fires after checkout creates an order:
 * 1) Customer confirmation alert (for COD orders immediately, or pending payment notice)
 * 2) Store Admin new-order alert
 * 3) Store Admin low-stock alerts for any ordered product that dropped to stock <= 3
 */
export async function notifyOrderCreated(orderId: string): Promise<void> {
  try {
    const db = adminDb();
    const { data: order } = await db
      .from("orders")
      .select(
        "id,store_id,user_id,phone,total,currency,status,payment_method,payment_status,shipping_carrier,tracking_number",
      )
      .eq("id", orderId)
      .maybeSingle<OrderEventRow>();

    if (!order) return;

    const code = shortOrderId(order.id);
    const codeAr = rtlSafeOrderCode(order.id);
    const totalLabelEn = `${Number(order.total).toFixed(0)} ${order.currency}`;
    const totalLabelAr = `${Number(order.total).toFixed(0)} ${formatArabicCurrency(order.currency)}`;

    // Customer confirmation (COD or full Store Wallet confirmed immediately; online notifies when payment completes)
    if (order.payment_method === "cod" || order.payment_method === "wallet") {
      const isWallet = order.payment_method === "wallet";
      await dispatchNotification({
        storeId: order.store_id,
        userId: order.user_id,
        phone: order.phone,
        targetRole: "customer",
        category: "order_update",
        titleAr: isWallet
          ? `تم تأكيد طلبك بالمحفظة ${codeAr}`
          : `تم استلام طلبك ${codeAr}`,
        titleEn: isWallet
          ? `Wallet Order ${code} Confirmed`
          : `Order ${code} Received`,
        bodyAr: isWallet
          ? `تم سداد طلبك بالكامل باستخدام رصيد محفظة المتجر وجارٍ تجهيزه للشحن الآن.`
          : `شكراً لتسوّقك معنا! طلبك بقيمة ${totalLabelAr} قيد المراجعة وسيتم تجهيزه قريباً.`,
        bodyEn: isWallet
          ? `Your order was paid in full using your store wallet and is now being prepared.`
          : `Thank you for your order! Your ${totalLabelEn} COD order is confirmed and being prepared.`,
        deepLink: `/orders?order=${order.id}`,
        dedupeKey: `order_created:${order.id}`,
        data: { order_id: order.id, status: order.status },
      });
    }

    // Admin new order alert
    const methodLabelAr =
      order.payment_method === "wallet"
        ? "رصيد المحفظة"
        : order.payment_method === "cod"
          ? "عند الاستلام"
          : "دفع إلكتروني";
    await notifyStoreAdmins({
      storeId: order.store_id,
      titleAr: `طلب جديد ${codeAr}`,
      titleEn: `New Order ${code}`,
      bodyAr: `تم تسجيل طلب جديد بقيمة ${totalLabelAr} (${methodLabelAr}).`,
      bodyEn: `A new ${totalLabelEn} order was placed (${order.payment_method}).`,
      deepLink: `/admin/orders/${order.id}`,
      dedupeKey: `admin_new_order:${order.id}`,
      data: { order_id: order.id, total: Number(order.total) },
    });

    // Low-stock admin alert for any ordered product now at stock <= 3
    const { data: items } = await db
      .from("order_items")
      .select("product_id,product_name,products(id,name,name_en,stock)")
      .eq("order_id", order.id);

    for (const item of (items ?? []) as OrderItemProductRow[]) {
      const prod = Array.isArray(item.products)
        ? item.products[0]
        : item.products;
      if (!prod || prod.stock > 3) continue;
      const prodNameEn = prod.name_en?.trim() || prod.name;
      await notifyStoreAdmins({
        storeId: order.store_id,
        titleAr: `تنبيه انخفاض المخزون (${prod.stock} متبقي)`,
        titleEn: `Low Stock Alert (${prod.stock} left)`,
        bodyAr: `المنتج "${prod.name}" وصل مخزونه إلى ${prod.stock} قطع فقط.`,
        bodyEn: `"${prodNameEn}" is down to ${prod.stock} units in stock.`,
        deepLink: "/admin/products",
        dedupeKey: `admin_low_stock:${prod.id}:${prod.stock}:${new Date().toISOString().slice(0, 10)}`,
        data: { product_id: prod.id, stock: prod.stock },
      });
    }
  } catch (err) {
    console.error("[notifications] notifyOrderCreated failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * Fires from Paymob webhook on confirmed payment success or failure.
 */
export async function notifyPaymentOutcome(
  orderId: string,
  outcome: "paid" | "failed",
): Promise<void> {
  try {
    const db = adminDb();
    const { data: order } = await db
      .from("orders")
      .select("id,store_id,user_id,phone,total,currency,status,payment_method,payment_status")
      .eq("id", orderId)
      .maybeSingle<OrderEventRow>();
    if (!order) return;

    const code = shortOrderId(order.id);
    const codeAr = rtlSafeOrderCode(order.id);
    const totalLabelEn = `${Number(order.total).toFixed(0)} ${order.currency}`;
    const totalLabelAr = `${Number(order.total).toFixed(0)} ${formatArabicCurrency(order.currency)}`;

    if (outcome === "paid") {
      await dispatchNotification({
        storeId: order.store_id,
        userId: order.user_id,
        phone: order.phone,
        targetRole: "customer",
        category: "order_update",
        titleAr: `تم الدفع بنجاح للطلب ${codeAr}`,
        titleEn: `Payment Confirmed for ${code}`,
        bodyAr: `تم تأكيد دفعتك بقيمة ${totalLabelAr} بنجاح وجارٍ تجهيز طلبك للشحن.`,
        bodyEn: `Your ${totalLabelEn} payment is confirmed. We are now preparing your order.`,
        deepLink: `/orders?payment=success&order=${order.id}`,
        dedupeKey: `payment_paid:${order.id}`,
        data: { order_id: order.id, payment_status: "paid" },
      });
    } else {
      await dispatchNotification({
        storeId: order.store_id,
        userId: order.user_id,
        phone: order.phone,
        targetRole: "customer",
        category: "payment_recovery",
        titleAr: `لم يكتمل الدفع للطلب ${codeAr}`,
        titleEn: `Payment Incomplete for ${code}`,
        bodyAr: `تعذر إتمام عملية الدفع. اضغط لإعادة المحاولة أو التحويل للدفع عند الاستلام.`,
        bodyEn: `Your payment could not be completed. Tap to retry payment or switch to Cash on Delivery.`,
        deepLink: `/orders?payment=failed&order=${order.id}`,
        dedupeKey: `payment_failed:${order.id}:${Date.now().toString().slice(0, -4)}`,
        data: { order_id: order.id, payment_status: "failed" },
      });
    }
  } catch (err) {
    console.error("[notifications] notifyPaymentOutcome failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * Fires when an admin updates an order status in /admin/orders.
 */
export async function notifyOrderStatusChanged(params: {
  orderId: string;
  status: string;
  shippingCarrier?: string | null;
  trackingNumber?: string | null;
}): Promise<void> {
  try {
    const db = adminDb();
    const { data: order } = await db
      .from("orders")
      .select(
        "id,store_id,user_id,phone,total,currency,status,payment_method,payment_status,shipping_carrier,tracking_number",
      )
      .eq("id", params.orderId)
      .maybeSingle<OrderEventRow>();
    if (!order) return;

    const code = shortOrderId(order.id);
    const codeAr = rtlSafeOrderCode(order.id);
    const carrier = params.shippingCarrier || order.shipping_carrier || "";
    const tracking = params.trackingNumber || order.tracking_number || "";

    let titleAr = "";
    let titleEn = "";
    let bodyAr = "";
    let bodyEn = "";

    switch (params.status) {
      case "confirmed":
        titleAr = `جاري تجهيز طلبك ${codeAr}`;
        titleEn = `Order ${code} is Processing`;
        bodyAr = `تم تأكيد طلبك وجارٍ تغليفه وتجهيزه للشحن الآن.`;
        bodyEn = `Your order has been confirmed and is being packed for shipment.`;
        break;
      case "shipped":
        titleAr = `تم شحن طلبك ${codeAr}`;
        titleEn = `Order ${code} Has Shipped!`;
        bodyAr = tracking
          ? `شحنتك في الطريق إليك${carrier ? ` عبر ${carrier}` : ""} · رقم التتبع: ${tracking}`
          : `شحنتك في الطريق إليك${carrier ? ` عبر ${carrier}` : ""}. تتبّع حالتها الآن.`;
        bodyEn = tracking
          ? `Your parcel is on the way${carrier ? ` via ${carrier}` : ""} · Tracking: ${tracking}`
          : `Your parcel is on the way${carrier ? ` via ${carrier}` : ""}. Tap to track live.`;
        break;
      case "delivered":
        titleAr = `تم تسليم طلبك ${codeAr}`;
        titleEn = `Order ${code} Delivered`;
        bodyAr = `نتمنى أن تنال مشترياتك إعجابك! شكراً لاختيارك متجرنا.`;
        bodyEn = `Your order has been delivered! We hope you love your items.`;
        break;
      case "cancelled":
        titleAr = `تم إلغاء الطلب ${codeAr}`;
        titleEn = `Order ${code} Cancelled`;
        bodyAr = `تم إلغاء طلبك ${codeAr}. إذا كان لديك أي استفسار تواصل مع فريق الدعم.`;
        bodyEn = `Your order ${code} has been cancelled. Reach out to support if you need help.`;
        break;
      default:
        return;
    }

    await dispatchNotification({
      storeId: order.store_id,
      userId: order.user_id,
      phone: order.phone,
      targetRole: "customer",
      category: "order_update",
      titleAr,
      titleEn,
      bodyAr,
      bodyEn,
      deepLink: `/orders?order=${order.id}`,
      dedupeKey: `order_status:${order.id}:${params.status}:${tracking}`,
      data: {
        order_id: order.id,
        status: params.status,
        tracking_number: tracking,
      },
    });
  } catch (err) {
    console.error("[notifications] notifyOrderStatusChanged failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * Fires when an admin replenishes stock (> 0) for a previously out-of-stock product.
 */
export async function notifyBackInStock(
  productId: string,
  storeId: string,
): Promise<number> {
  try {
    const db = adminDb();
    const { data: prod } = await db
      .from("products")
      .select("id,name,name_en,stock")
      .eq("id", productId)
      .eq("store_id", storeId)
      .maybeSingle<{ id: string; name: string; name_en: string | null; stock: number }>();

    if (!prod || prod.stock <= 0) return 0;

    const { data: subs } = await db
      .from("back_in_stock_subscriptions")
      .select("id,user_id,phone,push_token,variant_key")
      .eq("store_id", storeId)
      .eq("product_id", productId)
      .is("notified_at", null);

    const waiting = (subs ?? []) as {
      id: string;
      user_id: string | null;
      phone: string | null;
      push_token: string | null;
      variant_key: string;
    }[];

    if (waiting.length === 0) return 0;

    const nameEn = prod.name_en?.trim() || prod.name;
    const notifiedIds: string[] = [];

    for (const sub of waiting) {
      await dispatchNotification({
        storeId,
        userId: sub.user_id,
        phone: sub.phone,
        explicitTokens: sub.push_token
          ? [{ token: sub.push_token, platform: "android", locale: "ar" }]
          : undefined,
        targetRole: "customer",
        category: "back_in_stock",
        titleAr: `توفر المنتج من جديد!`,
        titleEn: `Back in Stock!`,
        bodyAr: `"${prod.name}" عاد للمخزون الآن — اطلبه قبل نفاد الكمية.`,
        bodyEn: `"${nameEn}" is back in stock now — grab yours before it sells out.`,
        deepLink: `/products/${prod.id}`,
        dedupeKey: `restock:${sub.id}`,
        data: { product_id: prod.id, variant_key: sub.variant_key },
      });
      notifiedIds.push(sub.id);
    }

    if (notifiedIds.length > 0) {
      await db
        .from("back_in_stock_subscriptions")
        .update({ notified_at: new Date().toISOString() })
        .in("id", notifiedIds);
    }

    return notifiedIds.length;
  } catch (err) {
    console.error("[notifications] notifyBackInStock failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
    return 0;
  }
}

/**
 * Recovery scan for /api/notifications/cron/recovery:
 * 1) Carts inactive > 1 hour in cart_sessions
 * 2) Unpaid online orders > 20 minutes in public.orders
 */
export async function runRecoveryAutomations(storeId?: string): Promise<{
  abandonedCartsNotified: number;
  unpaidOrdersNotified: number;
}> {
  const db = adminDb();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  let abandonedCartsNotified = 0;
  let unpaidOrdersNotified = 0;

  // 1. Abandoned carts > 1 hour
  let cartQuery = db
    .from("cart_sessions")
    .select("id,store_id,user_id,phone,push_token,locale,item_count,subtotal")
    .gt("item_count", 0)
    .is("abandoned_notified_at", null)
    .lt("updated_at", oneHourAgo)
    .gt("updated_at", twoDaysAgo)
    .limit(50);

  if (storeId) cartQuery = cartQuery.eq("store_id", storeId);

  const { data: carts } = await cartQuery;
  for (const c of (carts ?? []) as {
    id: string;
    store_id: string;
    user_id: string | null;
    phone: string | null;
    push_token: string | null;
    locale: "ar" | "en";
    item_count: number;
    subtotal: number;
  }[]) {
    const res = await dispatchNotification({
      storeId: c.store_id,
      userId: c.user_id,
      phone: c.phone,
      explicitTokens: c.push_token
        ? [{ token: c.push_token, platform: "web", locale: c.locale }]
        : undefined,
      targetRole: "customer",
      category: "abandoned_cart",
      titleAr: `سلتك بانتظارك!`,
      titleEn: `Your Bag Misses You!`,
      bodyAr: `ما زال لديك ${c.item_count} منتج في السلة. أكمل طلبك الآن بنقرة واحدة قبل نفاد المخزون.`,
      bodyEn: `You still have ${c.item_count} item(s) waiting in your cart. Complete your order in one tap.`,
      deepLink: "/cart",
      dedupeKey: `abandoned_cart:${c.id}:${new Date().toISOString().slice(0, 10)}`,
      data: { cart_session_id: c.id, item_count: c.item_count },
    });

    if (!res.suppressedByQuietHours) {
      await db
        .from("cart_sessions")
        .update({ abandoned_notified_at: new Date().toISOString() })
        .eq("id", c.id);
      if (!res.deduped) abandonedCartsNotified += 1;
    }
  }

  // 2. Unpaid online orders > 20 minutes
  let orderQuery = db
    .from("orders")
    .select("id,store_id,user_id,phone,total,currency")
    .in("payment_method", ["paymob_card", "paymob_wallet"])
    .in("payment_status", ["pending", "failed"])
    .neq("status", "cancelled")
    .lt("created_at", twentyMinAgo)
    .gt("created_at", twoDaysAgo)
    .limit(50);

  if (storeId) orderQuery = orderQuery.eq("store_id", storeId);

  const { data: unpaid } = await orderQuery;
  for (const o of (unpaid ?? []) as {
    id: string;
    store_id: string;
    user_id: string | null;
    phone: string | null;
    total: number;
    currency: string;
  }[]) {
    const code = shortOrderId(o.id);
    const codeAr = rtlSafeOrderCode(o.id);
    const amount = Number(o.total).toFixed(0);
    const currencyAr = formatArabicCurrency(o.currency);
    const res = await dispatchNotification({
      storeId: o.store_id,
      userId: o.user_id,
      phone: o.phone,
      targetRole: "customer",
      category: "payment_recovery",
      titleAr: `أكمل الدفع لطلبك ${codeAr}`,
      titleEn: `Complete Payment for ${code}`,
      bodyAr: `طلبك بقيمة ${amount} ${currencyAr} بانتظار تأكيد الدفع. اضغط لإتمام الدفع أو اختيار الدفع عند الاستلام.`,
      bodyEn: `Your ${amount} ${o.currency} order is awaiting payment. Tap to pay now or switch to COD.`,
      deepLink: `/orders?payment=failed&order=${o.id}`,
      dedupeKey: `payment_recovery_20m:${o.id}`,
      data: { order_id: o.id },
    });
    if (!res.deduped) unpaidOrdersNotified += 1;
  }

  return { abandonedCartsNotified, unpaidOrdersNotified };
}

/**
 * Fires when cashback is credited to a customer's wallet on order delivery.
 */
export async function notifyWalletCashback(params: {
  storeId: string;
  userId: string;
  orderId: string;
  amount: number;
  balanceAfter: number;
  currency: string;
}): Promise<void> {
  try {
    if (!params.userId || params.amount <= 0) return;
    const code = shortOrderId(params.orderId);
    const codeAr = rtlSafeOrderCode(params.orderId);
    const formattedAmount = Number(params.amount).toFixed(
      Number.isInteger(params.amount) ? 0 : 2,
    );
    const formattedBalance = Number(params.balanceAfter).toFixed(
      Number.isInteger(params.balanceAfter) ? 0 : 2,
    );
    const currencyAr = formatArabicCurrency(params.currency);

    await dispatchNotification({
      storeId: params.storeId,
      userId: params.userId,
      targetRole: "customer",
      category: "order_update",
      titleAr: `تم إضافة ${formattedAmount} ${currencyAr} كاش باك إلى محفظتك!`,
      titleEn: `${formattedAmount} ${params.currency} cashback added to your wallet!`,
      bodyAr: `مبروك! ربحت ${formattedAmount} ${currencyAr} كاش باك عن الطلب ${codeAr}. رصيدك المتاح الآن: ${formattedBalance} ${currencyAr}.`,
      bodyEn: `Congrats! You earned ${formattedAmount} ${params.currency} cashback on order ${code}. Available balance: ${formattedBalance} ${params.currency}.`,
      deepLink: "/account",
      dedupeKey: `wallet_cashback:${params.orderId}`,
      data: {
        order_id: params.orderId,
        cashback_amount: params.amount,
        balance_after: params.balanceAfter,
      },
    });
  } catch (err) {
    console.error("[notifications] notifyWalletCashback failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * Fires when a store admin posts or updates a reply on a verified customer review.
 */
export async function notifyReviewReply(params: {
  storeId: string;
  userId: string;
  productId: string;
  reviewId: string;
  replyText: string;
}): Promise<void> {
  try {
    if (!params.userId || !params.replyText.trim()) return;
    const db = adminDb();

    // Ensure target user exists in auth/profiles (skips synthetic seeded review UUIDs cleanly)
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("id", params.userId)
      .maybeSingle<{ id: string }>();
    if (!profile) return;

    const { data: prod } = await db
      .from("products")
      .select("id,name,name_en")
      .eq("id", params.productId)
      .eq("store_id", params.storeId)
      .maybeSingle<{ id: string; name: string; name_en: string | null }>();

    const prodAr = prod?.name || "المنتج";
    const prodEn = prod?.name_en?.trim() || prod?.name || "the product";
    const snippet = params.replyText.trim().slice(0, 120);

    await dispatchNotification({
      storeId: params.storeId,
      userId: params.userId,
      targetRole: "customer",
      category: "order_update",
      titleAr: `رد جديد من المتجر على تقييمك`,
      titleEn: `New Store Reply to Your Review`,
      bodyAr: `ردّ المتجر على تقييمك لمنتج "${prodAr}": "${snippet}"`,
      bodyEn: `The store replied to your review on "${prodEn}": "${snippet}"`,
      deepLink: `/products/${params.productId}#reviews`,
      dedupeKey: `review_reply:${params.reviewId}:${Date.now().toString().slice(0, -4)}`,
      data: { product_id: params.productId, review_id: params.reviewId },
    });
  } catch (err) {
    console.error("[notifications] notifyReviewReply failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
  }
}

/**
 * Fires when a wishlisted product drops in price OR is restocked from 0 -> > 0.
 * Queries public.wishlists scoped strictly by (store_id, product_id).
 */
export async function notifyWishlistProductAlert(params: {
  storeId: string;
  productId: string;
  kind: "price_drop" | "restock";
  oldPrice?: number;
  newPrice?: number;
  currency?: string;
}): Promise<number> {
  try {
    const db = adminDb();
    const [prodRes, wishRes, settingsRes] = await Promise.all([
      db
        .from("products")
        .select("id,name,name_en,price,stock,is_active")
        .eq("id", params.productId)
        .eq("store_id", params.storeId)
        .maybeSingle<{
          id: string;
          name: string;
          name_en: string | null;
          price: number;
          stock: number;
          is_active: boolean;
        }>(),
      db
        .from("wishlists")
        .select("user_id")
        .eq("store_id", params.storeId)
        .eq("product_id", params.productId),
      db
        .from("store_settings")
        .select("currency")
        .eq("store_id", params.storeId)
        .maybeSingle<{ currency: string }>(),
    ]);

    const prod = prodRes.data;
    if (!prod || !prod.is_active) return 0;

    const userIds = Array.from(
      new Set(
        ((wishRes.data ?? []) as { user_id: string }[])
          .map((w) => w.user_id)
          .filter(Boolean),
      ),
    );
    if (userIds.length === 0) return 0;

    const currency = params.currency || settingsRes.data?.currency || "EGP";
    const currencyAr = formatArabicCurrency(currency);
    const nameEn = prod.name_en?.trim() || prod.name;
    const today = new Date().toISOString().slice(0, 10);

    let sent = 0;
    for (const userId of userIds) {
      if (params.kind === "price_drop") {
        const nextVal = Number(params.newPrice ?? prod.price).toFixed(0);
        const prevVal = params.oldPrice ? Number(params.oldPrice).toFixed(0) : null;
        await dispatchNotification({
          storeId: params.storeId,
          userId,
          targetRole: "customer",
          category: "promo_campaign",
          bypassQuietHours: true,
          titleAr: `انخفض سعر منتج في مفضلتك!`,
          titleEn: `Price Drop on Your Wishlist!`,
          bodyAr: prevVal
            ? `"${prod.name}" أصبح بسعر ${nextVal} ${currencyAr} بدلاً من ${prevVal} ${currencyAr}. تسوّقه الآن!`
            : `"${prod.name}" انخفض سعره الآن إلى ${nextVal} ${currencyAr}. تسوّقه الآن!`,
          bodyEn: prevVal
            ? `"${nameEn}" dropped from ${prevVal} ${currency} to ${nextVal} ${currency}. Grab it now!`
            : `"${nameEn}" is now ${nextVal} ${currency}. Grab it now!`,
          deepLink: `/products/${prod.id}`,
          dedupeKey: `wishlist_price_drop:${params.storeId}:${prod.id}:${userId}:${nextVal}:${today}`,
          data: { product_id: prod.id, new_price: Number(nextVal) },
        });
      } else {
        await dispatchNotification({
          storeId: params.storeId,
          userId,
          targetRole: "customer",
          category: "back_in_stock",
          titleAr: `منتجك المفضل عاد للمخزون!`,
          titleEn: `Your Saved Item Is Back in Stock!`,
          bodyAr: `"${prod.name}" في قائمة مفضلتك أصبح متوفراً الآن — اطلبه قبل نفاد الكمية.`,
          bodyEn: `"${nameEn}" from your wishlist is back in stock now — order before it sells out.`,
          deepLink: `/products/${prod.id}`,
          dedupeKey: `wishlist_restock:${params.storeId}:${prod.id}:${userId}:${today}`,
          data: { product_id: prod.id, stock: prod.stock },
        });
      }
      sent += 1;
    }
    return sent;
  } catch (err) {
    console.error("[notifications] notifyWishlistProductAlert failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
    return 0;
  }
}
