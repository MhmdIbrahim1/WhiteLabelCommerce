import type { Permission } from "./team";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function adminUser(
  db: SupabaseClient,
  targetStoreId?: string,
  authenticatedUser?: User | null,
): Promise<User | null> {
  const user = authenticatedUser === undefined
    ? (await db.auth.getUser()).data.user
    : authenticatedUser;
  if (!user) return null;

  const result = targetStoreId
    ? await db.rpc("my_store_permissions", { p_store: targetStoreId })
    : await db.rpc("is_admin");
  if (result.error) return null;
  return (targetStoreId ? result.data !== null : result.data === true) ? user : null;
}

export async function hasStorePermission(db: SupabaseClient, storeId: string, permission: Permission) {
  const { data, error } = await db.rpc("has_store_permission", { p_store: storeId, p_permission: permission });
  return !error && data === true;
}

export async function hasStoreNotificationAccess(db: SupabaseClient, storeId: string) {
  const { data, error } = await db.rpc("can_manage_store_notifications", { tenant: storeId });
  return !error && data === true;
}

export async function superAdminUser(
  db: SupabaseClient,
  authenticatedUser?: User | null,
): Promise<User | null> {
  const user = authenticatedUser === undefined
    ? (await db.auth.getUser()).data.user
    : authenticatedUser;
  if (!user) return null;

  const { data, error: rpcErr } = await db.rpc("is_platform_super_admin");
  if (!rpcErr) {
    return data === true ? user : null;
  }

  const { data: row } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle<{ user_id: string }>();
  return row?.user_id ? user : null;
}
