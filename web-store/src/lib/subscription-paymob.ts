import { adminDb } from "./supabase/admin";
import { signedEvent, UUID_RE, verifyPaymobTransactionHmac, type PaymobTransactionObj } from "./paymob";

export type BillingPaymentOutcome = "success" | "pending" | "failed" | "unverified";

export function billingPaymentLocation(payment: BillingPaymentOutcome, invoice?: string) {
  const params = new URLSearchParams({ payment });
  if (invoice) params.set("invoice", invoice);
  return "/admin/billing?" + params;
}

export async function reconcileSubscriptionPayment(tx: PaymobTransactionObj, hmac: string) {
  if (!tx || typeof tx !== "object" || typeof hmac !== "string" || !/^[a-f0-9]{128}$/i.test(hmac)) return null;
  const order = String(tx.order?.id ?? "");
  const transaction = String(tx.id ?? "");
  const cents = Number(tx.amount_cents);
  const event = signedEvent(tx);
  if (!/^\d{1,30}$/.test(order) || !/^\d{1,30}$/.test(transaction) ||
    !/^\d{1,10}$/.test(String(tx.amount_cents ?? "")) || cents <= 0 || cents > 2147483647 ||
    tx.currency !== "EGP" || !event) return null;

  const db = adminDb();
  const key = await db.from("platform_billing_secrets").select("paymob_hmac_secret").eq("id", 1).maybeSingle();
  if (key.error) throw new Error("Billing signing key unavailable");
  if (!verifyPaymobTransactionHmac(tx, hmac, key.data?.paymob_hmac_secret ?? "")) return null;

  // Keep the signed identifiers and outcome for audit. Wallet and cardholder data
  // and arbitrary additions to the provider's envelope do not belong in this ledger.
  const { data, error } = await db.rpc("reconcile_subscription_paymob", {
    p_paymob_order_id: order, p_paymob_tx_id: transaction, p_amount_cents: cents, p_currency: tx.currency,
    p_success: event === "paid", p_pending: event === "pending", p_refunded: event === "refunded", p_voided: event === "voided",
    p_payload: { id: transaction, order, amount_cents: cents, currency: tx.currency, event,
      created_at: tx.created_at, integration_id: tx.integration_id },
  });
  if (error) {
    if (["P0001", "P0002", "22023", "23505", "PT400", "PT409"].includes(error.code)) return null;
    throw new Error("Subscription payment reconciliation unavailable");
  }
  if (!data || !UUID_RE.test(data.invoice_id) || !["pending", "paid", "failed", "refunded", "voided", "expired", "cancelled"].includes(data.status)) {
    throw new Error("Missing billing settlement result");
  }
  const outcome: BillingPaymentOutcome = data.status === "paid" ? "success" : data.status === "pending" ? "pending" : "failed";
  return { invoiceId: data.invoice_id as string, outcome, status: data.status as string };
}
