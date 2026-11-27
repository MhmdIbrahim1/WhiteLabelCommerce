import { guestOwnsReceipt } from "@/lib/order-receipt";
import { REQUEST_ORIGIN_HEADER } from "@/lib/tenant-shared";
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
  paymob_hmac_secret: string | null;
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
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid payload");
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
      .eq("store_id", activeStore.id)
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
        (phonesMatch(callerPhone, order.phone) || (method === "wallet" && phonesMatch(walletPhone, order.phone)) || await guestOwnsReceipt(order.store_id, order.id));
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
          "store_id,paymob_api_key,paymob_hmac_secret,paymob_card_integration_id,paymob_wallet_integration_id,paymob_iframe_id",
        )
        .eq("store_id", order.store_id)
        .maybeSingle<PaymentSecretsRow>(),
      order.customer_id
        ? db
            .from("store_customers")
            .select("full_name,email,phone")
          .eq("store_id", order.store_id)
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

    if (!apiKey || !secrets?.paymob_hmac_secret?.trim() || !/^\d+$/.test(integrationId) || (method === "card" && !/^\d+$/.test(iframeId))) {
      return Response.json(
        { error: "Payment gateway credentials are incomplete." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    const paymentMethod = method === "card" ? "paymob_card" : "paymob_wallet";
    const origin = req.headers.get(REQUEST_ORIGIN_HEADER);
    const reservation = await db.rpc("reserve_paymob_attempt", {
      p_store: order.store_id, p_order: order.id,
      p_method: paymentMethod, p_checkout_base: origin ? origin + activeStore.basePath : null
    });
    const a = reservation.data;
    if (reservation.error || !a) return json({ error: "Payment reservation unavailable." }, reservation.error?.code === "P0001" ? 409 : 503);
    if (a.action === "redirect") return json({ redirect_url: a.redirect_url });
    if (a.action === "pending") return json({ state: "pending", pending_wallet_prompt: true }, 202);
    if (a.action === "busy") return json({ state: "processing" }, 202);
    if (a.action !== "start" || !UUID_RE.test(a.attempt) || !UUID_RE.test(a.lease)) return json({ error: "Missing reservation." }, 503);
    const ids = { p_store: order.store_id, p_order: order.id, p_attempt: a.attempt, p_lease: a.lease };
    async function advance(step: string, url?: string) {
      const result = await db.rpc("advance_paymob_attempt", { ...ids, p_step: step, p_url: url ?? null });
      if (result.error || result.data !== true) throw new Error("Attempt changed");
    }
    let walletSent = false;
    try {
      const authToken = await authenticatePaymob(apiKey);
      const cents = Number(a.amount_cents);
      if (!Number.isSafeInteger(cents) || cents !== amountCents || a.currency !== currency) throw new Error("Order changed");
      const provider = a.provider ?? await registerPaymobOrder({ authToken, amountCents: cents, currency, merchantOrderId: a.attempt });
      const bound = await db.rpc("bind_paymob_attempt", { ...ids, p_provider: provider });
      if (bound.error || bound.data !== true) throw new Error("Missing durable binding");
      const customer = customerRes.data;
      const paymentToken = await requestPaymobPaymentKey({
        authToken, amountCents: cents, paymobOrderId: provider, integrationId, currency,
        expiration: Math.floor((Date.parse(a.expires_at) - Date.now()) / 1000), customerName: customer?.full_name,
        customerEmail: customer?.email, customerPhone: customer?.phone || order.phone, shippingAddress: order.shipping_address
      });
      if (method === "card") {
        const redirect = `https://accept.paymob.com/api/acceptance/iframes/${encodeURIComponent(iframeId)}?payment_token=${encodeURIComponent(paymentToken)}`;
        await advance("ready", redirect);
        return json({ redirect_url: redirect });
      }
      await advance("charging");
      walletSent = true;
      const wallet = await payPaymobWallet({ paymentToken, walletPhone });
      await advance(wallet.state, wallet.url);
      if (wallet.state === "failed") return json({ state: "failed" }, 422);
      return wallet.state === "ready" ? json({ redirect_url: wallet.url }) : json({ state: "pending", pending_wallet_prompt: true }, 202);
    } catch {
      if (walletSent) return json({ state: "pending", pending_wallet_prompt: true }, 202);
      await advance("release").catch(() => undefined);
      return json({ error: "Payment initiation unavailable." }, 502);
    }
  } catch {
    return Response.json(
      { error: "Unable to initiate online payment right now." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
