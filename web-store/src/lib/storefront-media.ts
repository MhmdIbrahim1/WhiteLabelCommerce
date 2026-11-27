import { safeRelativePath } from "./security.ts";

const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const dnsTld = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,58}[a-z0-9])$/;
const privateSuffix = /(?:^|\.)(?:localhost|local|internal|home\.arpa)$/;

function isPublicMediaHost(raw: string): boolean {
  if (!raw || raw.length > 253 || privateSuffix.test(raw)) return false;
  const labels = raw.split(".");
  if (labels.length < 2 || !labels.every(label => dnsLabel.test(label)) || !dnsTld.test(labels[labels.length - 1])) {
    return false;
  }
  try {
    return new URL("https://" + raw).hostname === raw;
  } catch {
    return false;
  }
}

// The browser only loads local files or the same-origin Next image cache.
// Keep the optimizer and URL builder on the same list of public asset origins.
export function storefrontMediaPatterns(storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
  merchantHosts = process.env.NEXT_PUBLIC_STOREFRONT_MEDIA_HOSTS ?? "") {
  const hosts = new Set(["images.unsplash.com"]);
  if (typeof merchantHosts === "string") {
    for (const entry of merchantHosts.split(",")) {
      const host = entry.trim().toLowerCase();
      if (isPublicMediaHost(host)) hosts.add(host);
    }
  }
  const patterns = [...hosts].map(hostname => ({ protocol: "https" as const, hostname, port: "", pathname: "/**" }));
  if (typeof storageUrl === "string" && storageUrl.trim()) {
    try {
      const storage = new URL(storageUrl.trim());
      if (storage.protocol === "https:" && !storage.username && !storage.password) {
        patterns.push({ protocol: "https", hostname: storage.hostname, port: storage.port, pathname: "/storage/v1/object/public/**" });
      }
    } catch { /* Ignore malformed storage URL rather than breaking builds. */ }
  }
  return patterns;
}

const allowed = storefrontMediaPatterns();
export function storefrontImageSrc(src: string | null | undefined, width: 64 | 128 | 384 | 640 | 1080 | 1920) {
  if (!src) return null;
  if (src.startsWith("/")) return safeRelativePath(src) || null;
  try {
    const url = new URL(src);
    const valid = url.protocol === "https:" && !url.username && !url.password && allowed.some(pattern =>
      pattern.hostname === url.hostname && pattern.port === url.port && url.pathname.startsWith(pattern.pathname.slice(0, -2)));
    if (valid) return "/_next/image?" + new URLSearchParams({ url: url.href, w: String(width), q: "75" });
  } catch { /* Missing or retired media uses the storefront's local fallback. */ }
  return null;
}
