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
  const { error } = await db
    .from("support_tickets")
    .insert({ store_id: store.id, subject, message });
  redirect(storeHref(store.basePath, error ? "/contact?sent=no" : "/contact?sent=yes"));
}
