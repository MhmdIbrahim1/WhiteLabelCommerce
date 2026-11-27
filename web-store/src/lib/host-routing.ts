import type { StoreRoute } from "./host-cache";

const reserved = new Set([
  "www", "app", "admin", "api", "auth", "mail", "billing", "support", "docs", "status", "cdn", "static", "assets",
  "super-admin", "account", "cart", "checkout", "create-store", "s", "store", "products", "orders", "login",
  "register", "contact", "delivery", "dashboard", "settings", "public", "health",
]);
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const dnsSuffix = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,58}[a-z0-9])$/;

export function isStoreSlug(slug: string) {
  return slug.length >= 3 && slug.length <= 40 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !reserved.has(slug);
}

export function isLocalHost(name: string) {
  return name === "localhost" || name.endsWith(".localhost") || name === "127.0.0.1" || name === "[::1]";
}

function validDnsName(name: string) {
  const labels = name.split(".");
  if (name.length > 253 || labels.length < 2 || !labels.every(label => dnsLabel.test(label)) ||
      !dnsSuffix.test(labels[labels.length - 1])) return false;
  // The URL parser also validates ASCII-encoded international labels and rejects alternate IP spellings.
  try { return new URL("https://" + name).hostname === name; } catch { return false; }
}

export type Authority = { hostname: string; authority: string };

export function normalizeHost(raw: string | null): Authority | null {
  if (!raw || raw.length > 260 || /[^!-~]/.test(raw)) return null;
  const match = /^(\[::1\]|[a-z0-9.-]+)(?::([1-9][0-9]{0,4}))?$/i.exec(raw);
  if (!match) return null;
  const hostname = match[1].toLowerCase().replace(/\.$/, "");
  const port = match[2];
  if (port && Number(port) > 65535) return null;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) && !validDnsName(hostname)) return null;
  if (!isLocalHost(hostname) && port && port !== "443" && port !== "80") return null;
  return { hostname, authority: hostname + (port ? ":" + port : "") };
}

// Ingress must preserve Host and overwrite X-Forwarded-Host. Never choose between conflicting authorities.
export function requestAuthority(host: string | null, forwarded: string | null) {
  const parsed = normalizeHost(host);
  if (forwarded !== null && normalizeHost(forwarded)?.authority !== parsed?.authority) return null;
  return parsed;
}

export function platformRootDomain(configured = process.env.PLATFORM_ROOT_DOMAIN, legacy = process.env.NEXT_PUBLIC_ROOT_DOMAIN) {
  let raw = configured || "localhost";
  if (!configured && legacy?.trim()) {
    const value = legacy.trim();
    const url = new URL(/^https?:\/\//i.test(value) ? value : "https://" + value);
    if (url.username || url.password) throw new Error("Invalid legacy platform origin");
    raw = url.hostname;
  }
  const parsed = normalizeHost(raw);
  if (!parsed || parsed.hostname !== parsed.authority || (parsed.hostname !== "localhost" && isLocalHost(parsed.hostname))) {
    throw new Error("PLATFORM_ROOT_DOMAIN must be a bare DNS hostname");
  }
  return parsed.hostname;
}

export function customDomain(input: string, root: string): string | null {
  const parsed = normalizeHost(input);
  if (!parsed || parsed.hostname !== parsed.authority) return null;
  const name = parsed.hostname;
  if (name.length > 241 || name === root || name.endsWith("." + root) ||
      isLocalHost(name) || /(?:^|\.)(?:local|internal|home\.arpa)$/.test(name)) return null;
  return name;
}

export type RouteKey = { kind: "slug" | "domain"; value: string };
export function classifyHost(hostname: string, root: string, allowLocal: boolean): RouteKey | "platform" | null {
  const local = isLocalHost(hostname);
  if (local && !allowLocal) return null;
  if (hostname === root || (local && !hostname.endsWith(".localhost"))) return "platform";
  const suffix = "." + (local ? "localhost" : root);
  if (hostname.endsWith(suffix)) {
    const slug = hostname.slice(0, -suffix.length);
    return isStoreSlug(slug) ? { kind: "slug", value: slug } : null;
  }
  return customDomain(hostname, root) ? { kind: "domain", value: hostname } : null;
}

// A preview deployment shares its suffix with domains a merchant can verify.
// Only a successful negative directory lookup can promote it to a platform host.
export async function resolveRequestHost(hostname: string, root: string, allowLocal: boolean,
  environment: string | undefined, lookup: (key: RouteKey) => Promise<StoreRoute | null>) {
  const host = classifyHost(hostname, root, allowLocal);
  if (!hostname.endsWith(".vercel.app")) return { host };
  if (environment !== "preview") return { host: host === "platform" ? null : host };
  if (!validDnsName(hostname)) return { host: null };
  const domain: RouteKey = { kind: "domain", value: hostname };
  const registered = await lookup(domain);
  return registered ? { host: domain, registered } : { host: "platform" as const };
}

export function platformOrigin(host: Authority, root: string) {
  if (isLocalHost(host.hostname)) {
    return "http://localhost" + host.authority.slice(host.hostname.length);
  }
  return root === "localhost" ? "http://localhost:3000" : "https://" + root;
}

export function subdomainOrigin(slug: string, platform: string) {
  const url = new URL(platform);
  url.hostname = slug + "." + url.hostname;
  return url.origin;
}

export function publicStoreOrigin(route: StoreRoute, platform: string, root: string) {
  const primary = route.primaryDomain && customDomain(route.primaryDomain, root);
  return primary ? "https://" + primary : subdomainOrigin(route.slug, platform);
}

export function resolveMerchantStorefrontUrl(slug: string, primaryDomain: string | null, requestOrigin: string | null,
  env = process.env) {
  if (!isStoreSlug(slug)) throw new TypeError("Invalid storefront slug");
  const configured = normalizeHost(env.PLATFORM_ROOT_DOMAIN ?? null);
  const root = configured && configured.authority === configured.hostname && !isLocalHost(configured.hostname)
    ? configured.hostname : null;
  const primary = primaryDomain && customDomain(primaryDomain, root ?? "localhost");
  if (primary) return "https://" + primary;
  if (root) return subdomainOrigin(slug, "https://" + root);

  const path = "/s/" + slug;
  const request = requestOrigin && URL.canParse(requestOrigin) ? new URL(requestOrigin) : null;
  const host = request && normalizeHost(request.host);
  if (!request || !host || !["https:", "http:"].includes(request.protocol)) return path;
  if (!isLocalHost(host.hostname)) return request.origin + path;

  // With only a loopback origin on a deployment, let the browser supply its public origin.
  if (env.VERCEL === "1" || env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production" || env.NODE_ENV === "production") {
    return path;
  }
  return subdomainOrigin(slug, platformOrigin(host, "localhost"));
}

export function storefrontUrlLabel(href: string) {
  return href.replace(/^https?:\/\//, "");
}

export async function resolveStoreBinding(host: RouteKey | "platform", aliasSlug: string | undefined,
  fallbackSlug: string | null, lookup: (key: RouteKey) => Promise<StoreRoute | null>, registered?: StoreRoute) {
  if (host === "platform") {
    const slug = aliasSlug ?? fallbackSlug;
    return slug && isStoreSlug(slug) ? lookup({ kind: "slug", value: slug }) : null;
  }
  const route = registered ?? await lookup(host);
  if (!route || (aliasSlug && route.slug !== aliasSlug)) return null;
  return route;
}

// Only storefront routes may appear beneath a path alias. Administrative routes have their own auth guards.
const shopPath = /^\/(?:$|(?:products|cart|checkout|account|orders|auth|contact|support|wishlist|login|register)(?:\/|$)|api\/(?:catalog-search|cart-upsells|abandoned-cart|reverse-geocode|notifications\/(?:back-in-stock|cart-heartbeat|inbox|register)|payments\/paymob\/initiate)(?:\/|$))/;
export function storePath(path: string) {
  if (!/^\/(?:s|store)(?:\/|$)/.test(path)) return null;
  const match = /^\/(s|store)\/([^/]+)(\/.*)?$/.exec(path);
  const slug = match?.[2].toLowerCase();
  const pathname = match?.[3] || "/";
  if (!match || !slug || !isStoreSlug(slug) || !shopPath.test(pathname) ||
      /(?:\\|%2f|%5c)/i.test(pathname) || pathname.includes("//")) return "invalid";
  return { slug, pathname, basePath: "/" + match[1] + "/" + slug };
}

export function platformAuthScreen(platform: boolean, aliased: boolean, path: string) {
  if (!platform || aliased) return null;
  if (path === "/login") return "login";
  if (path === "/register") return "register";
  return path === "/auth/reset-password" ? "reset-password" : null;
}
