import { computeMobileAppUnlocked } from "@/lib/tenant-shared";
import { requireSuperAdmin } from "@/lib/db";
import { getBillingStores, getPlanCatalog } from "@/lib/billing-data";
import { resolveEntitlements } from "@/lib/billing";
import { SuperAdminPortal } from "./portal-client";
import type { SuperAdminStoreOverview } from "./actions";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const { db, user } = await requireSuperAdmin();

  const [{ data, error }, subscriptions, plans] = await Promise.all([db.rpc("super_admin_list_stores_overview"),
    getBillingStores(), getPlanCatalog(true)]);
  const byStore = new Map(subscriptions.map(s => [s.store_id, s]));
  if (error) {
    throw new Error("تعذر تحميل بيانات لوحة إدارة المنصة.");
  }

  const stores: SuperAdminStoreOverview[] = (
    (data ?? []) as SuperAdminStoreOverview[]
  ).map((row) => {
    const sub = byStore.get(row.store_id);
    const plan = plans.find(p => p.code === sub?.plan_code);
    if (!sub || !plan) throw new Error("Store subscription unavailable");
    const mobileAccess =
      row.mobile_app_access === "enabled" || row.mobile_app_access === "disabled"
        ? row.mobile_app_access
        : "plan";
    return {
      ...row,
      billingPlan: plan.code,
      productLimit: resolveEntitlements(plan, sub.quota_overrides).max_products,
      max_products: Number(row.max_products ?? 50),
      products_count: Number(row.products_count ?? 0),
      active_products_count: Number(row.active_products_count ?? 0),
      orders_count: Number(row.orders_count ?? 0),
      gmv: Number(row.gmv ?? 0),
      mobile_app_access: mobileAccess,
      mobile_app_unlocked:
        typeof row.mobile_app_unlocked === "boolean"
          ? row.mobile_app_unlocked
          : computeMobileAppUnlocked(row.plan, mobileAccess),
      pending_owner_email: row.pending_owner_email ?? null,
    };
  });

  return (
    <SuperAdminPortal
      initialStores={stores}
      plans={plans.map(({ code, name_ar, name_en }) => ({ code, name_ar, name_en }))}
      adminEmail={user.email ?? ""}
    />
  );
}
