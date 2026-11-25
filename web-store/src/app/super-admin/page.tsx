import { requireSuperAdmin } from "@/lib/db";
import { SuperAdminPortal } from "./portal-client";
import type { SuperAdminStoreOverview } from "./actions";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const { db, user } = await requireSuperAdmin();

  const { data, error } = await db.rpc("super_admin_list_stores_overview");
  if (error) {
    throw new Error("تعذر تحميل بيانات لوحة إدارة المنصة.");
  }

  const stores: SuperAdminStoreOverview[] = (
    (data ?? []) as SuperAdminStoreOverview[]
  ).map((row) => ({
    ...row,
    max_products: Number(row.max_products ?? 50),
    products_count: Number(row.products_count ?? 0),
    active_products_count: Number(row.active_products_count ?? 0),
    orders_count: Number(row.orders_count ?? 0),
    gmv: Number(row.gmv ?? 0),
  }));

  return (
    <SuperAdminPortal
      initialStores={stores}
      adminEmail={user.email ?? ""}
    />
  );
}
