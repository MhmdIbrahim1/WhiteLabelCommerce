"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/db";
import { cycles, planCodes, type BillingCycle, type PlanCode } from "@/lib/billing";
import { parseManualTransfer, uuidPattern } from "@/lib/billing-checkout";
import { validateImageMagicBytes } from "@/lib/security";
import { adminDb } from "@/lib/supabase/admin";

export type BillingActionResult = "ok" | "invalid" | "unavailable" | "receipt" | "changed" | "price" | "pending" | "disabled";

function finish(error: { code: string; message: string } | null): BillingActionResult {
  if (error) {
    if (error.message === "billing_manual_pending" || error.code === "23505") return "pending";
    if (error.message === "billing_channel_unavailable") return "disabled";
    if (error.message === "billing_price_changed") return "price";
    if (error.code.startsWith("22") || error.message === "billing_invalid_input") return "invalid";
    if (error.message.startsWith("billing_")) return "changed";
    return "unavailable";
  }
  revalidatePath("/admin", "layout");
  return "ok";
}

export async function changeBillingPlan(store: string, action: "trial" | "schedule", plan: PlanCode, cycle: BillingCycle): Promise<BillingActionResult> {
  const { db, storeId } = await requireAdmin("manage_billing");
  if (store !== storeId || !planCodes.includes(plan) || !cycles.includes(cycle) || !["trial", "schedule"].includes(action)) return "invalid";
  const rpc = action === "trial" ? "billing_start_trial" : "billing_schedule_plan_change";
  return finish((await db.rpc(rpc, { p_store: storeId, p_plan: plan, p_cycle: cycle })).error);
}

export async function cancelBillingChange(store: string, invoiceId?: string): Promise<BillingActionResult> {
  const { db, storeId } = await requireAdmin("manage_billing");
  if (store !== storeId || (invoiceId !== undefined && !uuidPattern.test(invoiceId))) return "invalid";
  const response = invoiceId
    ? await db.rpc("billing_cancel_manual_upgrade", { p_store: storeId, p_invoice_id: invoiceId })
    : await db.rpc("billing_cancel_scheduled_change", { p_store: storeId });
  return finish(response.error);
}

export async function submitBillingTransfer(store: string, plan: PlanCode, cycle: BillingCycle, expectedAmount: number, form: FormData): Promise<BillingActionResult> {
  const { db, storeId } = await requireAdmin("manage_billing");
  if (store !== storeId || !planCodes.includes(plan) || !cycles.includes(cycle) || !Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) return "invalid";
  let transfer;
  try { transfer = parseManualTransfer(form); } catch (error) {
    return error instanceof Error && error.message === "receipt" ? "receipt" : "invalid";
  }
  const { channel, reference, sender, note, key, receipt } = transfer;
  const submit = (path: string | null) => db.rpc("billing_submit_manual_upgrade", {
    p_store: storeId, p_plan: plan, p_cycle: cycle, p_channel: channel, p_reference: reference,
    p_sender: sender, p_note: note, p_receipt_path: path, p_idempotency_key: key, p_expected_amount: expectedAmount,
  });
  if (!receipt) return finish((await submit(null)).error);

  const bytes = new Uint8Array(await receipt.arrayBuffer());
  const image = validateImageMagicBytes(bytes);
  if (!image || image.mime !== receipt.type) return "receipt";
  const digest = createHash("sha256").update(bytes).digest("hex") + "." + image.ext;
  const persistedReceipt = () => db.from("subscription_invoices").select("receipt_path")
    .eq("store_id", storeId).eq("idempotency_key", key).maybeSingle<{ receipt_path: string | null }>();
  const existing = await persistedReceipt();
  if (existing.error) return "unavailable";
  if (existing.data) return existing.data.receipt_path?.endsWith("/" + digest)
    ? finish((await submit(existing.data.receipt_path)).error) : "changed";

  // Each submission owns a distinct object until its invoice claims it.
  const path = storeId + "/" + randomUUID() + "/" + digest;
  const bucket = adminDb().storage.from("billing-receipts");
  const upload = await bucket.upload(path, bytes, { contentType: image.mime, upsert: false });
  if (upload.error && !(await bucket.exists(path)).data) return "unavailable";
  let submission = await submit(path);
  if (submission.error && (!submission.error.code || submission.status >= 500)) {
    // A lost response may follow a commit. The store lock and key make a replay safe.
    submission = await submit(path);
  }
  if (!submission.error) return finish(null);
  const canonical = await persistedReceipt();
  if (canonical.error) return "unavailable";
  if (canonical.data?.receipt_path === path) return finish(null);
  // With no acknowledged outcome, keep the private object for the in-flight invoice.
  if (!canonical.data && (!submission.error.code || submission.status >= 500)) return "unavailable";
  if ((await bucket.remove([path])).error) return "unavailable";
  if (canonical.data?.receipt_path?.endsWith("/" + digest)) {
    return finish((await submit(canonical.data.receipt_path)).error);
  }
  return finish(submission.error);
}
