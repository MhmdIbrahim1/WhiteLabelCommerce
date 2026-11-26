"use server";
import { serverDb } from "@/lib/db";
import { resolveActiveStoreOrDefault, storeHref } from "@/lib/tenant";
import { redirect } from "next/navigation";
export async function sendTicket(f: FormData) {
  const store = await resolveActiveStoreOrDefault();
  const subject = String(f.get("subject") ?? "").trim(),
    message = String(f.get("message") ?? "").trim();
  if (!subject || !message || subject.length > 160 || message.length > 4000)
    redirect(storeHref(store.basePath, "/contact?sent=no"));
  const db = await serverDb();
  const orderId = String(f.get("order") || "");
  const { data: { user } } = await db.auth.getUser();
  const args = { p_store: store.id, p_subject: subject, p_message: message };
  const hasOrder = user && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(orderId);
  const { error } = await db.rpc("mobile_support", hasOrder ? { ...args, p_order: orderId } : args);
  redirect(storeHref(store.basePath, error ? "/contact?sent=no" : "/contact?sent=yes"));
}
