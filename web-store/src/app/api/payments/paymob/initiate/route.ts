import { adminDb } from "@/lib/supabase/admin";
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
};

type OrderRow = {
  id: string;
  store_id: string;
  total: number;
  currency: string;
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
    const db = adminDb();

    const { data: order, error: orderErr } = await db
      .from("orders")
      .select(
        "id,store_id,total,currency,payment_status,phone,shipping_address,customer_id",
      )
      .eq("id", orderId)
      .maybeSingle<OrderRow>();

    if (orderErr || !order) {
      return Response.json(
        { error: "Order not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (order.payment_status === "paid") {
      return Response.json(
        { error: "Order is already paid." },
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
      currency: "EGP",
    });

    await db
      .from("orders")
      .update({
        paymob_order_id: paymobOrderId,
        payment_method: method === "card" ? "paymob_card" : "paymob_wallet",
        payment_status: "pending",
      })
      .eq("id", order.id)
      .eq("store_id", order.store_id);

    // 3. Payment Key with safe fallback billing data
    const customer = customerRes.data;
    const paymentToken = await requestPaymobPaymentKey({
      authToken,
      amountCents,
      paymobOrderId,
      integrationId,
      currency: "EGP",
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
