"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/db";
import { UUID_RE } from "@/lib/paymob";
import { credentialFields, paymentFlags, receivingFields } from "./payment-fields";
import type { SaveResult } from "./actions";

export async function reviewUpgrade(invoiceId: string, decision: "approve" | "reject", form: FormData): Promise<SaveResult> {
  const { db } = await requireSuperAdmin();
  const note = form.get("review_note") ?? "";
  if (!UUID_RE.test(invoiceId) || !["approve", "reject"].includes(decision) || typeof note !== "string" ||
      note.length > 1000 || (decision === "reject" && !note.trim())) return "invalid";
  const { error } = await db.rpc("billing_review_manual_upgrade", {
    p_invoice_id: invoiceId, p_decision: decision, p_review_note: note.trim() || null,
  });
  if (error) {
    if (error.code === "PT400") return "invalid";
    return ["P0001", "P0002", "PT409"].includes(error.code) ? "conflict" : "unavailable";
  }
  revalidatePath("/admin", "layout");
  return "saved";
}

export async function savePaymentSettings(revision: number, form: FormData): Promise<SaveResult> {
  const { db } = await requireSuperAdmin();
  if (!Number.isSafeInteger(revision) || revision < 1) return "invalid";
  const settings: Record<string, string | boolean | null> = {};
  for (const flag of Object.keys(paymentFlags)) {
    if (form.has(flag) && form.get(flag) !== "on") return "invalid";
    settings[flag] = form.has(flag);
  }
  for (const [key, { max }] of Object.entries({ ...receivingFields, manual_instructions_en: { max: 1000 }, manual_instructions_ar: { max: 1000 } })) {
    const value = form.get(key);
    if (typeof value !== "string" || value.trim().length > max) return "invalid";
    settings[key] = value.trim() || null;
  }
  const secrets: Record<string, string> = {};
  for (const key of Object.keys(credentialFields)) {
    const value = form.get(key);
    if (typeof value !== "string") return "invalid";
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > 4000 || (key.endsWith("_id") && !/^\d{1,15}$/.test(trimmed))) return "invalid";
    secrets[key] = trimmed;
  }
  const { error } = await db.rpc("billing_admin_payment_settings", { p_expected_revision: revision, p_settings: settings, p_secrets: secrets });
  if (error) {
    if (error.message === "billing_edit_conflict" || error.code === "40001") return "conflict";
    return ["22023", "23514", "P0001", "PT400"].includes(error.code) ? "invalid" : "unavailable";
  }
  revalidatePath("/admin/billing");
  return "saved";
}
