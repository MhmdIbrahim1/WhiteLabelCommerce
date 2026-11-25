export const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_STORE_SLUG = "nova-store";
export const STORE_SLUG_COOKIE = "nova_store_slug";
export const ADMIN_STORE_COOKIE = "nova_admin_store_id";
export const STORE_SLUG_HEADER = "x-store-slug";
export const STORE_HOST_HEADER = "x-store-host";
export const STORE_SUBDOMAIN_HEADER = "x-store-subdomain";
export const STORE_BASE_PATH_HEADER = "x-store-base-path";

export type StorePlan = "starter" | "growth" | "enterprise";
export type StoreStatus = "active" | "trial" | "suspended";
export type MobileAppAccess = "plan" | "enabled" | "disabled";

export function computeMobileAppUnlocked(
  plan: StorePlan,
  access?: MobileAppAccess | null,
): boolean {
  if (access === "enabled") return true;
  if (access === "disabled") return false;
  return plan === "growth" || plan === "enterprise";
}

export type StoreRecord = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  custom_domain: string | null;
  plan: StorePlan;
  status: StoreStatus;
  max_products?: number;
  owner_user_id?: string | null;
  subscription_expires_at?: string | null;
  mobile_app_access?: MobileAppAccess;
  pending_owner_email?: string | null;
};

export type ResolvedStore = StoreRecord & {
  basePath: string;
  isDefault: boolean;
};

export type ManagedStoreSummary = {
  store_id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  plan: StorePlan;
  status: StoreStatus;
  max_products: number;
  role: string;
  mobile_app_access?: MobileAppAccess;
  mobile_app_unlocked?: boolean;
};

const PLATFORM_PREFIXES = [
  "/admin",
  "/super-admin",
  "/create-store",
  "/login",
  "/register",
  "/api",
  "/delivery",
];

/**
 * Prefixes storefront links with the active tenant's basePath (e.g. "/s/my-shop")
 * while keeping bare Nova Store & custom-domain links clean ("") and leaving
 * platform/external URLs untouched. Client-safe.
 */
export function storeHref(basePath: string, href: string): string {
  const cleanBase = basePath.trim().replace(/\/+$/, "");
  if (!cleanBase) return href;
  if (!href) return cleanBase;
  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#")
  ) {
    return href;
  }
  if (href.startsWith(cleanBase + "/") || href === cleanBase) {
    return href;
  }
  if (
    PLATFORM_PREFIXES.some(
      (prefix) =>
        href === prefix ||
        href.startsWith(prefix + "/") ||
        href.startsWith(prefix + "?"),
    )
  ) {
    return href;
  }
  if (href === "/") return cleanBase;
  if (href.startsWith("/#")) return `${cleanBase}${href}`;
  if (href.startsWith("/")) return `${cleanBase}${href}`;
  return `${cleanBase}/${href}`;
}
