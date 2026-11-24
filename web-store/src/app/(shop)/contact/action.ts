"use server";
import { serverDb } from "@/lib/db";
import { redirect } from "next/navigation";
export async function sendTicket(f: FormData) {
  const subject = String(f.get("subject") ?? "").trim(),
    message = String(f.get("message") ?? "").trim();
  if (!subject || !message || subject.length > 160 || message.length > 4000)
    redirect("/contact?sent=no");
  const db = await serverDb();
  const { error } = await db
    .from("support_tickets")
    .insert({ subject, message });
  redirect(error ? "/contact?sent=no" : "/contact?sent=yes");
}
