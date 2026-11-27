import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminUser, superAdminUser } from "@/lib/access";
import {
  isLocalHost, isStoreSlug, isVercelDeployment, platformAuthScreen, platformOrigin, platformRootDomain, publicStoreOrigin, resolveRequestHost,
  requestAuthority, resolveStoreBinding, storePath,
} from "@/lib/host-routing";
import { isLang, LANG_COOKIE } from "@/lib/i18n";
import { resolveHostRoute } from "@/lib/host-resolver";
import {
  DEFAULT_STORE_SLUG, PLATFORM_ORIGIN_HEADER, STORE_BASE_PATH_HEADER, STORE_CANONICAL_HEADER,
  REQUEST_ORIGIN_HEADER, PLATFORM_SURFACE_HEADER, STANDALONE_AUTH_HEADER, STORE_ID_HEADER, STORE_SLUG_COOKIE, STORE_SLUG_HEADER, storefrontPath, tenantAuthEntry,
  PAGE_LOCALE_HEADER, STUDIO_LOCALE_HEADER, STUDIO_PREVIEW_QUERY, isStudioPreviewPage,
} from "@/lib/tenant-shared";

const privateHeaders = { "Cache-Control": "private, no-store" };
const landingPath = "/platform-landing";
const accessPath = "/platform-access";
const redirectPath = "/platform-redirect";
const PLATFORM_REDIRECT_HEADER = "x-wlc-platform-redirect";
const controlPlane = /^\/(?:admin|super-admin|create-store|api\/admin)(?:\/|$)/;
const tenantApi = /^\/api\/(?:auth\/password-reset(?:\/complete)?|abandoned-cart|catalog-search|cart-upsells|payments\/paymob\/initiate|notifications\/(?:back-in-stock|cart-heartbeat|inbox|register))$/;
const assetPath = /^(?:\/_next\/static\/|\/_next\/(?:image|webpack-hmr)(?:\/|$)|\/(?:favicon\.ico|store-collection\.jpg|firebase-messaging-sw\.js)$)/;

function cleanRoutingHeaders(request: NextRequest) {
  const outgoing = new Headers(request.headers);
  for (const header of [PLATFORM_ORIGIN_HEADER, PLATFORM_REDIRECT_HEADER, REQUEST_ORIGIN_HEADER, STORE_ID_HEADER,
    STORE_BASE_PATH_HEADER, STORE_CANONICAL_HEADER, STORE_SLUG_HEADER, PAGE_LOCALE_HEADER, STUDIO_LOCALE_HEADER,
    PLATFORM_SURFACE_HEADER, STANDALONE_AUTH_HEADER, "x-store-host", "x-store-subdomain", "forwarded"]) outgoing.delete(header);
  return outgoing;
}

function routingError(status: 404 | 503 = 404) {
  const en = status === 404 ? "Store not found" : "Store temporarily unavailable";
  const ar = status === 404 ? "المتجر غير موجود" : "المتجر غير متاح مؤقتاً";
  return new NextResponse(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${ar} · ${en}</title><main style="max-width:32rem;margin:18vh auto;padding:1.5rem;text-align:center;color:#233e38;font:1.15rem system-ui"><small>${status}</small><h1>${ar}</h1><p lang="en" dir="ltr">${en}</p></main></html>`, {
    status, headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}

// Path-based tabs share a cookie jar. Prefer the same-origin page making the legacy bare API call.
function apiStoreSlug(request: NextRequest, origin: string) {
  const referrer = request.headers.get("referer");
  if (referrer) {
    try {
      const url = new URL(referrer);
      if (url.origin === new URL(origin).origin) {
        const alias = storePath(url.pathname);
        if (alias === "invalid") return null;
        return alias?.slug ?? DEFAULT_STORE_SLUG;
      }
    } catch { /* Older clients may omit a usable referrer. */ }
  }
  const slug = request.cookies.get(STORE_SLUG_COOKIE)?.value || DEFAULT_STORE_SLUG;
  return isStoreSlug(slug) ? slug : null;
}

export async function proxy(request: NextRequest) {
  // Next's /_next/image optimizer fetches public files internally via a headerless MockedRequest
  // (base-server fills x-forwarded-host while leaving host unset).
  if (request.method === "GET" && !request.headers.get("host") &&
      /^\/(?:favicon\.ico|store-collection\.jpg)$/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const host = requestAuthority(request.headers.get("host"), request.headers.get("x-forwarded-host"));
  if (!host) return routingError();
  const externalPath = request.nextUrl.pathname;
  const assetRead = (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
  if (assetRead && externalPath.startsWith("/_next/static/")) {
    // Next and the ingress must agree on the asset namespace, including after decoding.
    if (/(?:%2[ef]|%5c|%25|\\|\/\/)/i.test(externalPath)) return routingError();
    return NextResponse.next({ request: { headers: cleanRoutingHeaders(request) } });
  }
  let root: string;
  try { root = platformRootDomain(); } catch { return routingError(503); }
  let resolvedHost;
  try {
    resolvedHost = await resolveRequestHost(host.hostname, root, !isVercelDeployment() && process.env.NODE_ENV !== "production",
      process.env.VERCEL_ENV, resolveHostRoute);
  } catch { return routingError(503); }
  const { host: classification, registered } = resolvedHost;
  if (!classification) return routingError();

  const alias = storePath(externalPath);
  if (alias === "invalid") return routingError();
  const path = alias?.pathname ?? externalPath;
  if (path === landingPath || path.startsWith(landingPath + "/") || path === accessPath || path.startsWith(accessPath + "/") ||
      path === redirectPath || path.startsWith(redirectPath + "/")) return routingError();
  const platform = classification === "platform";
  const billingProviderRoute = /^\/api\/billing\/paymob\/(initiate|callback|webhook)$/.exec(path)?.[1];
  if (billingProviderRoute && (!platform || alias)) return routingError();
  const previewLang = platform && alias && isStudioPreviewPage(path)
    ? request.nextUrl.searchParams.get(STUDIO_PREVIEW_QUERY) : null;
  const studioPreview = previewLang === "ar" || previewLang === "en";
  if (studioPreview && request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse(null, { status: 405, headers: { ...privateHeaders, Allow: "GET, HEAD" } });
  }
  const landing = platform && !alias && path === "/";
  const legal = path === "/privacy" || path === "/terms";
  if (legal && !platform) return routingError();
  const asset = assetRead && assetPath.test(path);
  const invite = /^\/invite(?:\/|$)/.test(path);
  const admin = controlPlane.test(path) || invite;
  const api = path.startsWith("/api/");
  const platformUrl = platformOrigin(host, root, classification);
  if (platform && !platformUrl) return routingError(503);
  const scheme = isLocalHost(host.hostname) ? "http" : "https";
  const publicAuthority = scheme === "http" ? host.authority : host.hostname;
  const origin = scheme + "://" + publicAuthority;
  const outgoing = cleanRoutingHeaders(request);
  outgoing.set(PLATFORM_SURFACE_HEADER, platform && !alias ? "platform" : "storefront");
  if (studioPreview) outgoing.set(STUDIO_LOCALE_HEADER, previewLang);
  if (platformUrl) outgoing.set(PLATFORM_ORIGIN_HEADER, platformUrl);
  outgoing.set(REQUEST_ORIGIN_HEADER, new URL(origin).origin);
  outgoing.set("host", publicAuthority);
  outgoing.set("x-forwarded-host", publicAuthority);
  outgoing.set("x-forwarded-proto", scheme);

  const storefront = !landing && !legal && !asset && !admin && !path.startsWith("/delivery/") && (!api || tenantApi.test(path));
  let cookieSlug: string | undefined;
  if (!platform || alias || storefront) {
    const fallback = api && platform && !alias ? apiStoreSlug(request, origin) : DEFAULT_STORE_SLUG;
    let route;
    try { route = await resolveStoreBinding(classification, alias?.slug, fallback, resolveHostRoute, registered); }
    catch { return routingError(503); }
    if (!route) return routingError();
    const entryPage = path === "/login" || path === "/register";
    const authPage = entryPage || path.startsWith("/auth/") || path === "/forgot-password" || path === "/reset-password";
    const basePath = platform ? alias?.basePath ?? (authPage || api ? "" : storefrontPath(route.slug)) : "";
    outgoing.set(STORE_ID_HEADER, route.id);
    outgoing.set(STORE_SLUG_HEADER, route.slug);
    outgoing.set(STORE_BASE_PATH_HEADER, basePath);
    if (!studioPreview && (path === "/" || /^\/(?:products|contact)(?:\/|$)/.test(path))) {
      const storeOrigin = platformUrl ? publicStoreOrigin(route, platformUrl, root) : origin;
      outgoing.set(STORE_CANONICAL_HEADER, storeOrigin + path);
    }
    if (!studioPreview && platform && storefront && !api && !authPage && !request.headers.has("next-router-prefetch") &&
        request.headers.get("purpose") !== "prefetch") cookieSlug = route.slug;
    if (platform && !alias && entryPage && request.method === "GET") {
      const entry = tenantAuthEntry("", path, request.nextUrl.searchParams.get("next") || "");
      if (entry) return NextResponse.redirect(new URL(entry, origin), { status: 303, headers: privateHeaders });
    }
  }
  if (!platform && admin) {
    if ((request.method !== "GET" && request.method !== "HEAD") || api) return routingError();
    if (!platformUrl) return routingError(503);
    outgoing.set(PLATFORM_REDIRECT_HEADER, new URL(path + request.nextUrl.search, platformUrl).toString());
    const target = request.nextUrl.clone();
    target.pathname = redirectPath;
    target.search = "";
    return NextResponse.rewrite(target, { request: { headers: outgoing } });
  }
  if (asset) return NextResponse.next({ request: { headers: outgoing } });

  // Keep rewrites internal to the Next server, even when a trusted ingress terminates TLS.
  const destination = request.nextUrl.clone();
  const access = platformAuthScreen(platform, Boolean(alias), path);
  const urlLang = request.nextUrl.searchParams.get(LANG_COOKIE);
  if (!api && isLang(urlLang)) {
    outgoing.set(PAGE_LOCALE_HEADER, urlLang);
  } else if (access && !isLang(request.cookies.get(LANG_COOKIE)?.value)) {
    // Apex auth has a store binding for sign-in, but its interface uses the platform default.
    outgoing.set(PAGE_LOCALE_HEADER, "ar");
  }
  const recoveryPath = path === "/forgot-password" || path === "/reset-password" ? "/auth/reset-password" : path;
  if (recoveryPath === "/auth/reset-password" || path === "/welcome") outgoing.set(STANDALONE_AUTH_HEADER, "1");
  destination.pathname = access ? accessPath + "/" + access : landing ? landingPath : recoveryPath;
  const forward = () => destination.pathname !== externalPath
    ? NextResponse.rewrite(destination, { request: { headers: outgoing } })
    : NextResponse.next({ request: { headers: outgoing } });
  let response = forward();
  if (billingProviderRoute === "webhook" || billingProviderRoute === "callback") {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        outgoing.set("cookie", request.cookies.toString());
        response = forward();
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
      },
    },
  });

  if (admin && !api && !invite) {
    const { data: { user } } = await db.auth.getUser();
    const login = "/login?next=" + encodeURIComponent(path + request.nextUrl.search);
    let redirectTo = !user ? login : "";
    if (user && /^\/super-admin(?:\/|$)/.test(path) && !(await superAdminUser(db, user))) redirectTo = "/";
    if (user && /^\/admin(?:\/|$)/.test(path) && !(await adminUser(db, undefined, user))) redirectTo = "/account?notice=customer_only";
    if (redirectTo) {
      const redirect = NextResponse.redirect(new URL(redirectTo, origin), { status: 303, headers: privateHeaders });
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    }
  } else if (request.cookies.getAll().some(c => c.name.startsWith("sb-"))) {
    await db.auth.getUser();
  }
  if (path.startsWith("/auth/") || path === "/reset-password" || path === "/forgot-password" || path === "/orders/return" || invite || request.nextUrl.searchParams.get("next")?.startsWith("/invite/")) response.headers.set("Referrer-Policy", "no-referrer");
  if (cookieSlug && request.cookies.get(STORE_SLUG_COOKIE)?.value !== cookieSlug) {
    response.cookies.set(STORE_SLUG_COOKIE, cookieSlug, { path: "/", sameSite: "lax", httpOnly: true, secure: scheme === "https" });
  }
  response.headers.set("Cache-Control", "private, no-store");
  if (studioPreview) response.headers.set("Content-Security-Policy", "frame-ancestors 'self'; form-action 'none'");
  return response;
}

export const config = { matcher: "/:path*" };
