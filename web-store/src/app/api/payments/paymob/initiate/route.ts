import { serverDb } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";
import {
  authenticatePaymob,
  EGYPT_WALLET_PHONE_RE,
  payPaymobWallet,
  registerPaymobOrder,
  requestPaymobPaymentKey,
  UUID_RE,
} from "@/lib/paymob";

type InitiateBody = {
  order_id?: unknown;
  method?: unknown;
  wallet_phone?: unknown;
  customer_phone?: unknown;
  phone?: unknown;
};

type OrderRow = {
  id: string;
  store_id: string;
  user_id: string | null;
  guest_tracking: boolean | null;
  status: string;
  total: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  phone: string | null;
  shipping_address: string | null;
  customer_id: string | null;
};

type CustomerRow = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type StoreFlagsRow = {
  store_id: string;
  paymob_enabled: boolean;
  paymob_card_enabled: boolean;
  paymob_wallet_enabled: boolean;
};

type PaymentSecretsRow = {
  store_id: string;
  paymob_api_key: string | null;
  paymob_card_integration_id: string | null;
  paymob_wallet_integration_id: string | null;
  paymob_iframe_id: string | null;
};

function phoneVariants(raw: string | null | undefined): string[] {
  let digits = (raw ?? "").replace(/\D+/g, "");
  if (/^2001[0125][0-9]{8}$/.test(digits)) {
    digits = "0" + digits.slice(3);
  } else if (/^00201[0125][0-9]{8}$/.test(digits)) {
    digits = "0" + digits.slice(4);
  }
  if (/^01[0125][0-9]{8}$/.test(digits)) {
    return [digits, "20" + digits.slice(1)];
  }
  if (/^201[0125][0-9]{8}$/.test(digits)) {
    return ["0" + digits.slice(2), digits];
  }
  return digits.length >= 8 ? [digits] : [];
}

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const va = phoneVariants(a);
  const vb = phoneVariants(b);
  if (va.length === 0 || vb.length === 0) return false;
  return va.some((x) => vb.includes(x));
}

export async function POST(req: Request) {
  let body: InitiateBody;
  try {
    body = (await req.json()) as InitiateBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const orderId =
    typeof body.order_id === "string" ? body.order_id.trim() : "";
  const method =
    typeof body.method === "string" ? body.method.trim().toLowerCase() : "";
  const walletPhone =
    typeof body.wallet_phone === "string"
      ? body.wallet_phone.replace(/\s+/g, "")
      : "";
  const callerPhone =
    typeof body.customer_phone === "string" && body.customer_phone.trim()
      ? body.customer_phone.trim()
      : typeof body.phone === "string" && body.phone.trim()
        ? body.phone.trim()
        : "";

  if (!UUID_RE.test(orderId)) {
    return Response.json(
      { error: "Invalid order_id." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (method !== "card" && method !== "wallet") {
    return Response.json(
      { error: "Invalid payment method." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (method === "wallet" && !EGYPT_WALLET_PHONE_RE.test(walletPhone)) {
    return Response.json(
      { error: "Invalid Egyptian mobile wallet number." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [userDb, activeStore] = await Promise.all([
      serverDb(),
      resolveActiveStoreOrDefault(),
    ]);
    const {
      data: { user },
    } = await userDb.auth.getUser();

    const db = adminDb();

    const { data: order, error: orderErr } = await db
      .from("orders")
      .select(
        "id,store_id,user_id,guest_tracking,status,total,currency,payment_method,payment_status,phone,shipping_address,customer_id",
      )
      .eq("id", orderId)
      .maybeSingle<OrderRow>();

    if (orderErr || !order) {
      return Response.json(
        { error: "Order not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Strict tenant check: order must belong to the active store
    if (order.store_id !== activeStore.id) {
      return Response.json(
        { error: "Order does not belong to this store." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Strict caller authorization: authenticated owner OR verified guest phone
    if (order.user_id) {
      if (!user || user.id !== order.user_id) {
        return Response.json(
          { error: "Unauthorized order payment initiation." },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
      }
    } else {
      const verifiedGuestPhone =
        order.guest_tracking === true &&
        (phonesMatch(callerPhone, order.phone) ||
          (method === "wallet" && phonesMatch(walletPhone, order.phone)));
      if (!verifiedGuestPhone) {
        return Response.json(
          { error: "Guest phone verification required." },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    // Reject closed, already-paid, or non-online orders
    if (order.status === "cancelled" || order.status === "delivered") {
      return Response.json(
        { error: "Order is closed and cannot be paid." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (order.payment_status === "paid") {
      return Response.json(
        { error: "Order is already paid." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (
      order.payment_method !== "paymob_card" &&
      order.payment_method !== "paymob_wallet"
    ) {
      return Response.json(
        { error: "Order is not eligible for online payment." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const amountCents = Math.round(Number(order.total) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return Response.json(
        { error: "Invalid order amount." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const currency = (order.currency || "EGP").trim().toUpperCase();

    const [flagsRes, secretsRes, customerRes] = await Promise.all([
      db
        .from("store_settings")
        .select(
          "store_id,paymob_enabled,paymob_card_enabled,paymob_wallet_enabled",
        )
        .eq("store_id", order.store_id)
        .maybeSingle<StoreFlagsRow>(),
      db
        .from("store_payment_secrets")
        .select(
          "store_id,paymob_api_key,paymob_card_integration_id,paymob_wallet_integration_id,paymob_iframe_id",
        )
        .eq("store_id", order.store_id)
        .maybeSingle<PaymentSecretsRow>(),
      order.customer_id
        ? db
            .from("store_customers")
            .select("full_name,email,phone")
            .eq("id", order.customer_id)
            .maybeSingle<CustomerRow>()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const flags = flagsRes.data;
    const secrets = secretsRes.data;

    if (!flags || !flags.paymob_enabled) {
      return Response.json(
        { error: "Online payment is currently unavailable for this store." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (method === "card" && !flags.paymob_card_enabled) {
      return Response.json(
        { error: "Card payment is disabled for this store." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (method === "wallet" && !flags.paymob_wallet_enabled) {
      return Response.json(
        { error: "Mobile wallet payment is disabled for this store." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const apiKey = secrets?.paymob_api_key?.trim() ?? "";
    const integrationId =
      method === "card"
        ? (secrets?.paymob_card_integration_id?.trim() ?? "")
        : (secrets?.paymob_wallet_integration_id?.trim() ?? "");
    const iframeId = secrets?.paymob_iframe_id?.trim() ?? "";

    if (!apiKey || !integrationId || (method === "card" && !iframeId)) {
      return Response.json(
        { error: "Payment gateway credentials are incomplete." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    // 1. Paymob Auth Token
    const authToken = await authenticatePaymob(apiKey);

    // 2. Register Paymob Order (unique merchant_order_id supports safe payment retries)
    const merchantOrderId = `${order.id}__${Date.now()}`;
    const paymobOrderId = await registerPaymobOrder({
      authToken,
      amountCents,
      merchantOrderId,
      currency,
    });

    const nextPaymentMethod =
      method === "card" ? "paymob_card" : "paymob_wallet";

    // Record attempt cleanly in payment_attempts so every initiated paymob_order_id remains resolvable
    await db
      .from("payment_attempts")
      .insert({
        store_id: order.store_id,
        order_id: order.id,
        paymob_order_id: paymobOrderId,
        payment_method: nextPaymentMethod,
      })
      .then(() => undefined, () => undefined);

    await db
      .from("orders")
      .update({
        paymob_order_id: paymobOrderId,
        payment_method: nextPaymentMethod,
        payment_status: "pending",
      })
      .eq("id", order.id)
      .eq("store_id", order.store_id)
      .neq("payment_status", "paid")
      .not("status", "in", "(cancelled,delivered)");

    // 3. Payment Key with safe fallback billing data
    const customer = customerRes.data;
    const paymentToken = await requestPaymobPaymentKey({
      authToken,
      amountCents,
      paymobOrderId,
      integrationId,
      currency,
      customerName: customer?.full_name,
      customerEmail: customer?.email,
      customerPhone: customer?.phone || order.phone,
      shippingAddress: order.shipping_address,
    });

    if (method === "card") {
      const redirectUrl = `https://accept.paymob.com/api/acceptance/iframes/${encodeURIComponent(iframeId)}?payment_token=${encodeURIComponent(paymentToken)}`;
      return Response.json(
        { redirect_url: redirectUrl },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const walletRedirect = await payPaymobWallet({
      paymentToken,
      walletPhone,
    });

    return Response.json(
      { redirect_url: walletRedirect, pending_wallet_prompt: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("Paymob initiate failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
    return Response.json(
      { error: "Unable to initiate online payment right now." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
