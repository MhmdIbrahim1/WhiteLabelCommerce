import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function adminUser(
  db: SupabaseClient,
  targetStoreId?: string,
): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) return null;

  if (targetStoreId) {
    const { data, error: rpcErr } = await db.rpc("is_store_admin", {
      target_store_id: targetStoreId,
    });
    if (!rpcErr) {
      return data === true ? user : null;
    }
    if (rpcErr.code !== "42883" && rpcErr.code !== "PGRST202") {
      return null;
    }
  } else {
    const { data, error: rpcErr } = await db.rpc("is_admin");
    if (!rpcErr) {
      return data === true ? user : null;
    }
    if (rpcErr.code !== "42883" && rpcErr.code !== "PGRST202") {
      return null;
    }
  }

  // Fallback ONLY for pre-migration environments where RPC is missing
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role,store_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; store_id?: string | null }>();
  if (profileError) return null;
  if (profile?.role !== "admin") return null;
  if (targetStoreId && profile.store_id !== targetStoreId) return null;
  return user;
}

export async function superAdminUser(
  db: SupabaseClient,
): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) return null;

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
