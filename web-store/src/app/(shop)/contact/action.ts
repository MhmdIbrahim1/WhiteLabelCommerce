"use server";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { adminDb } from "@/lib/supabase/admin";
import { serverDb } from "@/lib/db";
import { resolveActiveStoreOrDefault, storeHref } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { supportInput, supportOutcome } from "@/lib/support-inbox";
export async function sendTicket(f: FormData) {
  const store = await resolveActiveStoreOrDefault();
  const subject = supportInput(f.get("subject"), 160);
  const message = supportInput(f.get("message"), 4000);
  if (!subject || !message) redirect(storeHref(store.basePath, "/contact?sent=invalid"));
  const db = await serverDb();
  const orderId = String(f.get("order") || "");
  const { data: { user } } = await db.auth.getUser();
  const args = { p_store: store.id, p_subject: subject, p_message: message };
  const hasOrder = user && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(orderId);
  // Vercel supplies this header at ingress. Other deployments use the gateway's own anonymous bucket.
  const clientIp = !user && process.env.VERCEL === "1" ? (await headers()).get("x-vercel-forwarded-for")?.trim() : null;
  const { error } = clientIp && isIP(clientIp)
    ? await adminDb().rpc("web_anonymous_support", { ...args, p_client_ip: clientIp })
    : await db.rpc("mobile_support", hasOrder ? { ...args, p_order: orderId } : args);
  redirect(storeHref(store.basePath, "/contact?sent=" + supportOutcome(error)));
}
