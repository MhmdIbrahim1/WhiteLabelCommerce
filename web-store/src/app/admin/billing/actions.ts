"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/db";
import { parsePlan, parseSubscription } from "@/lib/billing";

export type SaveResult = "saved" | "invalid" | "conflict" | "inactive" | "unavailable";

function result(error: { message: string; code: string } | null): SaveResult {
  if (error) {
    if (error.message === "billing_edit_conflict") return "conflict";
    if (error.message === "billing_plan_inactive") return "inactive";
    if (error.code.startsWith("22") || error.code.startsWith("23") || error.message === "invalid_plan") return "invalid";
    return "unavailable";
  }
  revalidatePath("/");
  revalidatePath("/platform-landing");
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/billing");
  revalidatePath("/super-admin");
  return "saved";
}

export async function savePlan(revision: number, form: FormData): Promise<SaveResult> {
  const { db } = await requireSuperAdmin();
  if (!Number.isSafeInteger(revision) || revision < 1) return "invalid";
  let plan;
  try { plan = parsePlan(form); } catch { return "invalid"; }
  return result((await db.rpc("billing_save_plan", { p_plan: plan, p_revision: revision })).error);
}

export async function saveSubscription(storeId: string, revision: number, form: FormData): Promise<SaveResult> {
  const { db } = await requireSuperAdmin();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(storeId) || !Number.isSafeInteger(revision) || revision < 1) return "invalid";
  let values;
  try { values = parseSubscription(form); } catch { return "invalid"; }
  return result((await db.rpc("billing_save_subscription", { p_store: storeId, p_revision: revision, ...values })).error);
}
