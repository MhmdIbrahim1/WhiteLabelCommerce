import { headers } from "next/headers";
import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveActiveStore } from "@/lib/tenant";
import { PLATFORM_SURFACE_HEADER, storeHref } from "@/lib/tenant-shared";
import { welcomeHref } from "@/lib/auth-flow";

export async function authStorefront() {
  if ((await headers()).get(PLATFORM_SURFACE_HEADER) !== "storefront") return null;
  const store = await resolveActiveStore();
  return store && store.status !== "suspended" ? store : null;
}

export const storeCustomerMembership = cache(async (db: SupabaseClient, storeId: string) => {
  const { data, error } = await db.rpc("store_customer_membership", { p_store_id: storeId });
  if (error || typeof data?.enrolled !== "boolean") throw new Error("Store membership unavailable");
  return { enrolled: data.enrolled as boolean, fullName: data.enrolled && typeof data.full_name === "string" ? data.full_name : "" };
});

export async function storeCustomerEnrolled(db: SupabaseClient, storeId: string): Promise<boolean> {
  return (await storeCustomerMembership(db, storeId)).enrolled;
}

export async function storefrontDestination(db: SupabaseClient, storeId: string, base: string, next: string) {
  return await storeCustomerEnrolled(db, storeId) ? next || storeHref(base, "/account") : welcomeHref(base, next);
}

export async function googleProfileName(db: SupabaseClient, user: User) {
  const providers = user.identities?.filter(identity => identity.provider !== "email") ?? [];
  if (providers.length !== 1 || providers[0].provider !== "google") return "";
  const identity = providers[0].identity_data;
  if (String(identity?.email_verified).toLowerCase() !== "true" ||
      identity?.email?.toLowerCase() !== user.email?.toLowerCase()) return "";
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  const methods = claims?.amr?.flatMap(entry => typeof entry === "string" ? [] : [entry]);
  const latest = methods?.sort((a, b) => b.timestamp - a.timestamp)[0];
  if (claims?.sub !== user.id || latest?.method !== "oauth") return "";
  return typeof identity?.full_name === "string" ? identity.full_name.trim().slice(0, 100) : "";
}
