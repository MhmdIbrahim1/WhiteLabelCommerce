import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HostRouteCache, type RouteReply } from "./host-cache";
import type { RouteKey } from "./host-routing";

const routes = new HostRouteCache();
let client: SupabaseClient | undefined;

export function resolveHostRoute(key: RouteKey) {
  const db = client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return routes.resolve(key.kind + ":" + key.value, async knownRevision => {
    const { data, error } = await db.rpc("resolve_store_route", {
      p_kind: key.kind, p_value: key.value, p_known_revision: knownRevision,
    }).abortSignal(AbortSignal.timeout(2500)).single<RouteReply>();
    if (error || !data) throw new Error("Store route lookup unavailable");
    return data;
  });
}
