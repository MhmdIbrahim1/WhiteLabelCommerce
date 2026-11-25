import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverDb } from "./db";
import {
  ADMIN_STORE_COOKIE,
  DEFAULT_STORE_ID,
  DEFAULT_STORE_SLUG,
  STORE_BASE_PATH_HEADER,
  STORE_HOST_HEADER,
  STORE_SLUG_COOKIE,
  STORE_SLUG_HEADER,
  STORE_SUBDOMAIN_HEADER,
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
  STORE_HOST_HEADER,
  STORE_SLUG_COOKIE,
  STORE_SLUG_HEADER,
  STORE_SUBDOMAIN_HEADER,
  computeMobileAppUnlocked,
  storeHref,
  type ManagedStoreSummary,
  type MobileAppAccess,
  type ResolvedStore,
  type StorePlan,
  type StoreRecord,
  type StoreStatus,
};

const FALLBACK_NOVA_STORE: ResolvedStore = {
  id: DEFAULT_STORE_ID,
  slug: DEFAULT_STORE_SLUG,
  name_ar: "Nova Store",
  name_en: "Nova Store",
  custom_domain: null,
  plan: "enterprise",
  status: "active",
  max_products: 10000,
  owner_user_id: null,
  subscription_expires_at: null,
  mobile_app_access: "plan",
  pending_owner_email: null,
  basePath: "",
  isDefault: true,
};

const STORE_SELECT =
  "id,slug,name_ar,name_en,custom_domain,plan,status,max_products,owner_user_id,subscription_expires_at,mobile_app_access,pending_owner_email";

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
    basePath,
    isDefault: row.id === DEFAULT_STORE_ID,
  };
}

/**
 * Resolves the active storefront tenant for the current request:
 * 1. Custom domain or subdomain (via x-store-host / x-store-subdomain set by proxy.ts)
 * 2. Path-based entry `/s/[slug]` (via x-store-slug header or nova_store_slug cookie)
 * 3. Clean fallback to Nova Store (`00000000-0000-0000-0000-000000000001`)
 *
 * Returns `null` ONLY when a specific non-default slug/domain was requested and does not exist.
 */
export const resolveActiveStore = cache(
  async (): Promise<ResolvedStore | null> => {
    const [hdrs, jar, db] = await Promise.all([
      headers(),
      cookies(),
      serverDb(),
    ]);

    const customHost = (hdrs.get(STORE_HOST_HEADER) ?? "").trim().toLowerCase();
    const subdomain = (hdrs.get(STORE_SUBDOMAIN_HEADER) ?? "")
      .trim()
      .toLowerCase();
    const headerSlug = (hdrs.get(STORE_SLUG_HEADER) ?? "").trim().toLowerCase();
    const headerBasePath = (hdrs.get(STORE_BASE_PATH_HEADER) ?? "").trim();
    const cookieSlug = (jar.get(STORE_SLUG_COOKIE)?.value ?? "")
      .trim()
      .toLowerCase();

    // 1. Custom domain match
    if (customHost) {
      const { data, error } = await db
        .from("stores")
        .select(STORE_SELECT)
        .ilike("custom_domain", customHost)
        .maybeSingle<StoreRecord>();
      if (!error && data) {
        return normalizeStoreRecord(data, "");
      }
    }

    // 2. Subdomain match (e.g. myshop.localhost:3000 or myshop.domain.com)
    if (subdomain && subdomain !== "www") {
      const { data, error } = await db
        .from("stores")
        .select(STORE_SELECT)
        .eq("slug", subdomain)
        .maybeSingle<StoreRecord>();
      if (!error && data) {
        return normalizeStoreRecord(data, "");
      }
      if (!error && !data) {
        return null;
      }
    }

    // 3. Explicit path-based slug (`/s/[slug]`) or cookie-carried slug (for APIs/Server Actions)
    const requestedSlug = headerSlug || cookieSlug;
    if (requestedSlug && requestedSlug !== DEFAULT_STORE_SLUG) {
      const { data, error } = await db
        .from("stores")
        .select(STORE_SELECT)
        .eq("slug", requestedSlug)
        .maybeSingle<StoreRecord>();
      if (error) {
        // Fallback safely only if the stores table has not been migrated yet
        if (error.code === "42P01" || error.code === "PGRST205") {
          return FALLBACK_NOVA_STORE;
        }
        return null;
      }
      if (!data) return null;
      const basePath =
        headerBasePath ||
        (headerSlug ? `/s/${data.slug}` : "");
      return normalizeStoreRecord(data, basePath);
    }

    // 4. Default Nova Store fallback
    const { data, error } = await db
      .from("stores")
      .select(STORE_SELECT)
      .eq("id", DEFAULT_STORE_ID)
      .maybeSingle<StoreRecord>();

    if (!error && data) {
      return normalizeStoreRecord(data, headerBasePath || "");
    }
    return FALLBACK_NOVA_STORE;
  },
);

export async function resolveActiveStoreOrDefault(): Promise<ResolvedStore> {
  const store = await resolveActiveStore();
  return store ?? FALLBACK_NOVA_STORE;
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

  // Graceful fallback before migration is applied
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return [];
  const { data: profile } = await db
    .from("profiles")
    .select("role,store_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; store_id?: string | null }>();
  if (profile?.role !== "admin") return [];
  return [
    {
      store_id: profile.store_id || DEFAULT_STORE_ID,
      slug: DEFAULT_STORE_SLUG,
      name_ar: "Nova Store",
      name_en: "Nova Store",
      plan: "enterprise",
      status: "active",
      max_products: 10000,
      role: "owner",
      mobile_app_access: "plan",
      mobile_app_unlocked: true,
    },
  ];
}
