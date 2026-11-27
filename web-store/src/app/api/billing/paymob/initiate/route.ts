import { cycles, planCodes } from "@/lib/billing";
import { requireAdmin } from "@/lib/db";
import { matchesRequestOrigin } from "@/lib/password-policy";
import { authenticatePaymob, EGYPT_WALLET_PHONE_RE, payPaymobWallet, registerPaymobOrder, requestPaymobPaymentKey, UUID_RE } from "@/lib/paymob";
import { billingPaymentLocation } from "@/lib/subscription-paymob";
import { adminDb } from "@/lib/supabase/admin";

const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (code: string, status: number) => reply({ ok: false, code }, status);

type Reservation = { attempt_id: string; invoice_id: string; created: boolean; status: string; amount_cents: number;
  checkout_url: string | null; expires_at: string };

export async function POST(request: Request) {
  if (!request.headers.has("origin") || !matchesRequestOrigin(request)) return fail("origin", 403);
  const body = await request.json().catch(() => null);
  if (!body || !planCodes.includes(body.planCode) || !cycles.includes(body.billingCycle) ||
      !["paymob_card", "paymob_wallet"].includes(body.paymentMethod) ||
      typeof body.idempotencyKey !== "string" || !/^[A-Za-z0-9_.-]{8,120}$/.test(body.idempotencyKey) ||
      (body.expectedAmountEGP !== undefined && (!Number.isSafeInteger(body.expectedAmountEGP) || body.expectedAmountEGP < 1 ||
        body.expectedAmountEGP > 21474836))) return fail("invalid", 400);
  const wallet = body.paymentMethod === "paymob_wallet";
  if (wallet && (typeof body.walletPhone !== "string" || !EGYPT_WALLET_PHONE_RE.test(body.walletPhone))) return fail("wallet_phone", 400);
  const { storeId, user } = await requireAdmin("manage_billing");
  if (body.storeId !== undefined && body.storeId !== storeId) return fail("store_changed", 409);
  const db = adminDb();
  const [settings, vault] = await Promise.all([
    db.from("platform_billing_settings").select("paymob_enabled,paymob_card_enabled,paymob_wallet_enabled").eq("id", 1).single(),
    db.from("platform_billing_secrets").select("paymob_api_key,paymob_hmac_secret,paymob_card_integration_id,paymob_card_iframe_id,paymob_wallet_integration_id").eq("id", 1).maybeSingle(),
  ]);
  if (settings.error || vault.error) return fail("unavailable", 503);
  const config = settings.data, secrets = vault.data;
  const integration = wallet ? secrets?.paymob_wallet_integration_id : secrets?.paymob_card_integration_id;
  if (!config?.paymob_enabled || !(wallet ? config.paymob_wallet_enabled : config.paymob_card_enabled) ||
      !secrets?.paymob_api_key || !secrets.paymob_hmac_secret || !/^\d{1,15}$/.test(integration ?? "") ||
      (!wallet && !/^\d{1,15}$/.test(secrets.paymob_card_iframe_id ?? ""))) return fail("unavailable", 409);
  const reservation = await db.rpc("reserve_subscription_paymob", { p_store: storeId, p_user: user.id, p_plan: body.planCode,
    p_cycle: body.billingCycle, p_method: body.paymentMethod, p_idempotency_key: body.idempotencyKey,
    p_expected_amount: body.expectedAmountEGP ?? null });
  if (reservation.error) {
    const status: Record<string, number> = { PT400: 400, "22023": 400, "42501": 403, PT409: 409, P0001: 409, "23505": 409 };
    return fail(reservation.error.message === "billing_price_changed" ? "billing_price_changed" : "reservation", status[reservation.error.code] ?? 503);
  }
  const attempt: Reservation = reservation.data;
  if (!attempt || !UUID_RE.test(attempt.attempt_id) || !UUID_RE.test(attempt.invoice_id) ||
      !Number.isSafeInteger(attempt.amount_cents) || attempt.amount_cents < 1 || typeof attempt.created !== "boolean") return fail("unavailable", 503);

  const invoiceId = attempt.invoice_id;
  function feedback(outcome: "success" | "pending") {
    return reply({ ok: true, invoiceId, redirectUrl: billingPaymentLocation(outcome, invoiceId) }, outcome === "pending" ? 202 : 200);
  }
  if (!attempt.created) {
    if (attempt.status === "paid") return feedback("success");
    if (attempt.status === "expired") return fail("expired", 409);
    if (!["reserved", "initiated", "pending"].includes(attempt.status)) return fail("payment_failed", 409);
    if (attempt.checkout_url && attempt.status !== "pending") return reply({ ok: true, invoiceId, [wallet ? "redirectUrl" : "iframeUrl"]: attempt.checkout_url });
    return feedback("pending");
  }

  let walletSubmitted = false;
  try {
    const token = await authenticatePaymob(secrets.paymob_api_key);
    const order = await registerPaymobOrder({ authToken: token, amountCents: attempt.amount_cents, merchantOrderId: attempt.attempt_id });
    const bound = await db.rpc("bind_subscription_paymob", { p_attempt_id: attempt.attempt_id, p_paymob_order_id: order });
    if (bound.error || bound.data !== true) throw new Error("Binding failed");
    const paymentToken = await requestPaymobPaymentKey({ authToken: token, paymobOrderId: order, amountCents: attempt.amount_cents,
      integrationId: integration, expiration: Math.floor((Date.parse(attempt.expires_at) - Date.now()) / 1000),
      customerName: user.user_metadata?.full_name, customerEmail: user.email, customerPhone: wallet ? body.walletPhone : user.phone });
    let checkoutUrl: string;
    if (wallet) {
      walletSubmitted = true;
      const response = await payPaymobWallet({ paymentToken, walletPhone: body.walletPhone });
      if (response.state === "prompt") return feedback("pending");
      if (response.state === "failed") {
        walletSubmitted = false;
        throw new Error("Wallet declined");
      }
      checkoutUrl = response.url;
    } else {
      checkoutUrl = "https://accept.paymob.com/api/acceptance/iframes/" + secrets.paymob_card_iframe_id + "?payment_token=" + encodeURIComponent(paymentToken);
    }
    const saved = await db.rpc("billing_paymob_checkout_ready", { p_attempt_id: attempt.attempt_id, p_redirect_url: checkoutUrl });
    if (saved.error || saved.data !== true) throw new Error("Checkout unavailable");
    return reply({ ok: true, invoiceId, [wallet ? "redirectUrl" : "iframeUrl"]: checkoutUrl });
  } catch {
    // A wallet timeout may follow a charge or an OTP. Await the signed result
    // for this order and keep subsequent submissions on the same attempt.
    if (walletSubmitted) return feedback("pending");
    const failed = await db.rpc("fail_subscription_paymob", { p_attempt_id: attempt.attempt_id });
    if (failed.error) return fail("unavailable", 503);
    return failed.data === true ? fail("payment_failed", 502) : feedback("pending");
  }
}
