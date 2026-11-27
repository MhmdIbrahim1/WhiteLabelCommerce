export const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_STORE_SLUG = "nova-store";
export const STORE_SLUG_COOKIE = "nova_store_slug";
export const ADMIN_STORE_COOKIE = "nova_admin_store_id";
export const STORE_SLUG_HEADER = "x-store-slug";
export const STORE_ID_HEADER = "x-store-id";
export const STORE_CANONICAL_HEADER = "x-store-canonical";
export const PLATFORM_ORIGIN_HEADER = "x-platform-origin";
export const REQUEST_ORIGIN_HEADER = "x-wlc-request-origin";
export const STORE_BASE_PATH_HEADER = "x-store-base-path";
export const STUDIO_LOCALE_HEADER = "x-wlc-studio-locale";
export const STUDIO_PREVIEW_QUERY = "studioPreview";

export function isStudioPreviewPage(path: string) {
  return path === "/" || /^\/products(?:\/[a-z0-9][a-z0-9_-]{0,127})?$/i.test(path);
}

export type StorePlan = "starter" | "growth" | "enterprise";
export type StoreStatus = "active" | "trial" | "suspended";
export type MobileAppAccess = "plan" | "enabled" | "disabled";

export function computeMobileAppUnlocked(
  _plan: StorePlan,
  access?: MobileAppAccess | null,
): boolean {
  return access !== "disabled";
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

export function storefrontPath(slug: string) {
  return "/store/" + slug;
}

// Older storefront links carry their tenant in the relative return path.
export function tenantAuthEntry(basePath: string, route: "/login" | "/register", next: string) {
  const prefix = /^\/(?:s|store)\/[a-z0-9-]+(?=[/?#]|$)/i.exec(next)?.[0];
  return prefix && !basePath ? prefix + route + "?next=" + encodeURIComponent(next) : null;
}

const PLATFORM_PREFIXES = [
  "/admin",
  "/super-admin",
  "/invite",
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
