"use server";
import { serverDb } from "@/lib/db";
import { UUID_RE } from "@/lib/paymob";
import { adminDb } from "@/lib/supabase/admin";
import { rememberCheckout, currentReceipt } from "@/lib/order-receipt";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";

export async function readPaymentReceipt(id: string) {
  const [store, db] = await Promise.all([resolveActiveStoreOrDefault(), serverDb()]);
  const { data: { user } } = await db.auth.getUser();
  return currentReceipt(store.id, id, user?.id);
}

export async function recoverCheckout(key: string) {
  if (!UUID_RE.test(key)) return null;
  const [store, db] = await Promise.all([resolveActiveStoreOrDefault(), serverDb()]);
  const { data: { user } } = await db.auth.getUser();
  // The random checkout key is a browser-held capability for its own guest submission.
  const { data, error } = await adminDb().from("orders").select("id,user_id,guest_tracking")
    .eq("store_id", store.id).eq("checkout_key", key).maybeSingle();
  if (error) throw new Error("Checkout lookup unavailable");
  if (!data || (data.user_id ? data.user_id !== user?.id : !data.guest_tracking)) return null;
  await rememberCheckout(store.id, data.id, !data.user_id);
  return currentReceipt(store.id, data.id, user?.id);
}
