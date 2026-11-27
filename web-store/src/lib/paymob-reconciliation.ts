import { adminDb } from "./supabase/admin";
import { notifyPaymentOutcome } from "./notifications/events";
import { verifyPaymobTransactionHmac, type PaymobTransactionObj } from "./paymob";

export function queryTransaction(q: URLSearchParams): PaymobTransactionObj {
  return {
    ...Object.fromEntries(q), order: { id: q.get("order") ?? "" },
    source_data: { pan: q.get("source_data.pan"), sub_type: q.get("source_data.sub_type"), type: q.get("source_data.type") }
  };
}
const truth = (v: unknown) => v === true || v === "true";
const falsity = (v: unknown) => v === false || v === "false";

export function signedEvent(tx: PaymobTransactionObj) {
  if (truth(tx.is_refunded)) return "refunded";
  if (truth(tx.is_voided)) return "voided";
  if (truth(tx.pending)) return "pending";
  if (!falsity(tx.pending)) return null;
  if (truth(tx.error_occured) || falsity(tx.success)) return "failed";
  if (!truth(tx.success) || !falsity(tx.error_occured)) return null;
  return truth(tx.is_auth) && !truth(tx.is_capture) ? "pending" : "paid";
}

export async function reconcilePaymob(tx: PaymobTransactionObj, signature: string) {
  const provider = String(tx.order?.id ?? "");
  if (!/^\d{1,30}$/.test(provider) || !/^[0-9a-f]{128}$/i.test(signature)) return null;
  const db = adminDb();
  const attempt = await db.from("payment_attempts").select("store_id,order_id").eq("paymob_order_id", provider).maybeSingle();
  if (attempt.error) throw new Error("Attempt lookup failed");
  let query = db.from("orders").select("id,store_id,guest_tracking,user_id");
  query = attempt.data ? query.eq("store_id", attempt.data.store_id).eq("id", attempt.data.order_id) : query.eq("paymob_order_id", provider);
  const { data: order, error } = await query.maybeSingle<{ id: string; store_id: string; guest_tracking: boolean; user_id: string | null }>();
  if (error) throw new Error("Order lookup failed");
  if (!order) return null;
  const [secrets, store] = await Promise.all([
    db.from("store_payment_secrets").select("paymob_hmac_secret").eq("store_id", order.store_id).maybeSingle(),
    db.from("stores").select("slug").eq("id", order.store_id).maybeSingle(),
  ]);
  if (store.error) throw new Error("Store lookup unavailable");
  if (!store.data) return null;
  if (secrets.error) throw new Error("Signing key unavailable");
  if (!verifyPaymobTransactionHmac(tx, signature, secrets.data?.paymob_hmac_secret?.trim() ?? "")) return null;
  const event = signedEvent(tx);
  if (!event || !/^\d{1,30}$/.test(String(tx.id ?? "")) || !/^\d{1,16}$/.test(String(tx.amount_cents ?? ""))) return null;
  const { data, error: failure } = await db.rpc("reconcile_paymob_transaction", {
    p_store: order.store_id, p_order: order.id, p_provider: provider,
    p_tx: String(tx.id), p_cents: String(tx.amount_cents), p_currency: tx.currency, p_event: event
  });
  if (failure) {
    if (["P0001", "23505"].includes(failure.code)) return null;
    throw new Error("Payment write failed");
  }
  if (!data || typeof data.transitioned !== "boolean") throw new Error("Missing reconciliation receipt");
  if (data.transitioned && (data.notification === "paid" || data.notification === "failed")) {
    await notifyPaymentOutcome(order.id, data.notification);
  }
  return { order, slug: store.data.slug as string, status: data.payment_status as string, base: data.checkout_base as string | null, transitioned: data.transitioned };
}
