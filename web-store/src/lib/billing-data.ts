import "server-only";
import { cache } from "react";
import { checked, requireSuperAdmin, serverDb } from "./db";
import type { Plan, StoreBilling, Subscription } from "./billing";

export const getStoreBilling = cache(async (storeId: string): Promise<StoreBilling> => {
  const db = await serverDb();
  return checked(await db.rpc("get_store_billing", { p_store: storeId })) as StoreBilling;
});

export const getPlanCatalog = cache(async (includeInactive = false): Promise<Plan[]> => {
  const db = includeInactive ? (await requireSuperAdmin()).db : await serverDb();
  let query = db.from("saas_plans").select("*").order("sort_order").order("code");
  if (!includeInactive) query = query.eq("is_active", true);
  return checked(await query.returns<Plan[]>());
});

type BillingStore = Pick<Subscription, "store_id" | "plan_code" | "quota_overrides"> & {
  stores: { slug: string; name_ar: string; name_en: string };
};
export const getBillingStores = cache(async (): Promise<BillingStore[]> => {
  const { db } = await requireSuperAdmin();
  const stores: BillingStore[] = [];
  for (let from = 0; ; from += 250) {
    const rows = checked(await db.from("store_subscriptions").select("store_id,plan_code,quota_overrides,stores!inner(slug,name_ar,name_en)")
      .order("store_id").range(from, from + 249).returns<BillingStore[]>());
    stores.push(...rows);
    if (rows.length < 250) return stores;
  }
});
