import { cookies } from "next/headers";
import { adminDb } from "./supabase/admin";
import { receiptCookie, latestOrderCookie, signOrderProof, verifyOrderProof } from "./order-proof";
import { UUID_RE } from "./paymob";
import type { OrderReceipt } from "./order-payment";

export async function rememberCheckout(store: string, order: string, guest: boolean) {
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 86400 };
  jar.set(latestOrderCookie(store), order, options);
  if (guest) jar.set(receiptCookie(order), signOrderProof("receipt", store, order), options);
}
export async function guestOwnsReceipt(store: string, id: string) {
  return verifyOrderProof("receipt", store, id, (await cookies()).get(receiptCookie(id))?.value);
}

export async function authorizedReceipt(store: string, id: string, userId?: string): Promise<OrderReceipt | null> {
  if (!UUID_RE.test(id)) return null;
  const proof = await guestOwnsReceipt(store, id);
  if (!userId && !proof) return null;
  let query = adminDb().from("orders").select("id,store_id,user_id,guest_tracking,status,payment_method,payment_status,reservation_expires_at,total,currency,order_items(product_id,size,color,quantity,unit_price,product_name)")
    .eq("store_id", store).eq("id", id);
  if (!proof) query = query.eq("user_id", userId!);
  const { data: o, error } = await query.maybeSingle();
  if (error) throw new Error("Receipt unavailable");
  if (!o || (o.user_id ? o.user_id !== userId : !o.guest_tracking || !proof) || o.total == null || !o.currency) return null;
  return {
    id: o.id, store_id: o.store_id, guest: !o.user_id && o.guest_tracking, status: o.status, payment_method: o.payment_method, payment_status: o.payment_status,
    reservation_expires_at: o.reservation_expires_at, total: Number(o.total), currency: o.currency,
    lines: o.order_items.map(l => ({
      id: l.product_id, size: l.size ?? "", color: l.color ?? "", quantity: l.quantity,
      name: l.product_name, price: Number(l.unit_price)
    }))
  };
}

export async function currentReceipt(store: string, id: string, userId?: string) {
  const receipt = await authorizedReceipt(store, id, userId);
  if (!receipt?.reservation_expires_at || Date.parse(receipt.reservation_expires_at) > Date.now() ||
    !["pending", "confirmed"].includes(receipt.status) || !["pending", "unpaid", "failed"].includes(receipt.payment_status ?? "")) return receipt;
  const released = await adminDb().rpc("release_expired_unpaid_orders", { p_store: store, p_order: id, p_limit: 1 });
  if (released.error) throw new Error("Reservation release unavailable");
  return authorizedReceipt(store, id, userId);
}
