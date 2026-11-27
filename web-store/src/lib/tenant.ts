import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverDb } from "./db";
import { resolveHostRoute } from "./host-resolver";
import { resolveMerchantStorefrontUrl } from "./host-routing";
import {
  ADMIN_STORE_COOKIE,
  DEFAULT_STORE_ID,
  DEFAULT_STORE_SLUG,
  REQUEST_ORIGIN_HEADER,
  STORE_BASE_PATH_HEADER,
  STORE_SLUG_HEADER,
  STORE_ID_HEADER,
  computeMobileAppUnlocked,
  storeHref,
  type ManagedStoreSummary,
  type MobileAppAccess,
  type ResolvedStore,
  type StorePlan,
  type StoreRecord,
  type StoreStatus,
} from "./tenant-shared";

export {
  ADMIN_STORE_COOKIE,
  DEFAULT_STORE_ID,
  DEFAULT_STORE_SLUG,
  STORE_BASE_PATH_HEADER,
  STORE_SLUG_HEADER,
  STORE_ID_HEADER,
  computeMobileAppUnlocked,
  storeHref,
  type ManagedStoreSummary,
  type MobileAppAccess,
  type ResolvedStore,
  type StorePlan,
  type StoreRecord,
  type StoreStatus,
};

const STORE_SELECT = "id,slug,name_ar,name_en,custom_domain,plan,status";

export const merchantStorefrontUrl = cache(async (slug: string) => {
  const requestOrigin = (await headers()).get(REQUEST_ORIGIN_HEADER);
  let primaryDomain: string | null = null;
  try {
    const route = await resolveHostRoute({ kind: "slug", value: slug });
    primaryDomain = route?.primaryDomain ?? null;
  } catch { /* The store can still be reached without its directory entry. */ }
  return resolveMerchantStorefrontUrl(slug, primaryDomain, requestOrigin);
});

export function normalizeStoreRecord(
  row: StoreRecord,
  basePath: string,
): ResolvedStore {
  return {
    ...row,
    plan:
      row.plan === "growth" || row.plan === "enterprise"
        ? row.plan
        : "starter",
    status:
      row.status === "trial" || row.status === "suspended"
        ? row.status
        : "active",
    max_products: Number(row.max_products ?? 50),
    owner_user_id: row.owner_user_id ?? null,
    subscription_expires_at: row.subscription_expires_at ?? null,
    basePath,
    isDefault: row.id === DEFAULT_STORE_ID,
  };
}

// The proxy binds both identifiers. A stale or missing binding must never select another store.
export const resolveActiveStore = cache(async (): Promise<ResolvedStore | null> => {
  const hdrs = await headers();
  const id = hdrs.get(STORE_ID_HEADER);
  const slug = hdrs.get(STORE_SLUG_HEADER);
  if (!id || !slug) return null;
  const db = await serverDb();
  const { data, error } = await db.from("stores").select(STORE_SELECT)
    .eq("id", id).eq("slug", slug).maybeSingle<StoreRecord>();
  if (error) throw new Error("Store lookup unavailable");
  return data ? normalizeStoreRecord(data, hdrs.get(STORE_BASE_PATH_HEADER) || "") : null;
});

export async function resolveActiveStoreOrDefault(): Promise<ResolvedStore> {
  return (await resolveActiveStore()) ?? notFound();
}

export async function isPlatformSuperAdmin(
  db: SupabaseClient,
): Promise<boolean> {
  const {
    data: { user },
    error: authErr,
  } = await db.auth.getUser();
  if (authErr || !user) return false;

  const { data, error } = await db.rpc("is_platform_super_admin");
  if (!error) {
    return data === true;
  }

  // Fallback check on platform_admins directly under RLS (read self)
  const { data: row } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle<{ user_id: string }>();
  return Boolean(row?.user_id);
}

export async function getManagedStores(
  db: SupabaseClient,
): Promise<ManagedStoreSummary[]> {
  const { data, error } = await db.rpc("get_my_managed_stores");
  if (!error && Array.isArray(data)) {
    return (data as ManagedStoreSummary[]).map((s) => {
      const plan: StorePlan =
        s.plan === "growth" || s.plan === "enterprise" ? s.plan : "starter";
      const access: MobileAppAccess =
        s.mobile_app_access === "enabled" || s.mobile_app_access === "disabled"
          ? s.mobile_app_access
          : "plan";
      return {
        ...s,
        plan,
        max_products: Number(s.max_products ?? 50),
        mobile_app_access: access,
        mobile_app_unlocked:
          typeof s.mobile_app_unlocked === "boolean"
            ? s.mobile_app_unlocked
            : computeMobileAppUnlocked(plan, access),
      };
    });
  }

  return [];
}
