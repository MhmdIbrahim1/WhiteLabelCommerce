import type { SupabaseClient } from "@supabase/supabase-js";

export async function adminUser(db: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) return null;
  const { data, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (profileError) return null;
  return data?.role === "admin" ? user : null;
}
