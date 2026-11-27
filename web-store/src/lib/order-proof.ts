import { createHmac, timingSafeEqual } from "node:crypto";
import { UUID_RE } from "./paymob";

type Scope = "return" | "receipt";
const lifetime = { return: 300, receipt: 86400 };
export const receiptCookie = (id: string) => "wlc_receipt_" + id;
export const latestOrderCookie = (store: string) => "wlc_order_" + store;

function mac(scope: Scope, store: string, order: string, expiry: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing server signing key");
  return createHmac("sha256", key).update(["wlc.order.v1", scope, store, order, expiry].join("|")).digest("base64url");
}
export function signOrderProof(scope: Scope, store: string, order: string, now = Date.now()) {
  const expiry = String(Math.floor(now / 1000) + lifetime[scope]);
  return expiry + "." + mac(scope, store, order, expiry);
}
export function verifyOrderProof(scope: Scope, store: string, order: string, proof?: string, now = Date.now()) {
  if (!UUID_RE.test(store) || !UUID_RE.test(order) || !proof || !/^\d{10,11}\.[A-Za-z0-9_-]{43}$/.test(proof)) return false;
  const [expiry, signature] = proof.split(".");
  const seconds = Math.floor(now / 1000);
  return Number(expiry) >= seconds && Number(expiry) <= seconds + lifetime[scope] &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(mac(scope, store, order, expiry)));
}
