import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminUser, superAdminUser } from "@/lib/access";
import {
  DEFAULT_STORE_SLUG,
  STORE_BASE_PATH_HEADER,
  STORE_HOST_HEADER,
  STORE_SLUG_COOKIE,
  STORE_SLUG_HEADER,
  STORE_SUBDOMAIN_HEADER,
} from "@/lib/tenant";

const SLUG_PATH_RE = /^\/s\/([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)(\/.*)?$/i;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function extractHostTenant(rawHost: string | null): {
  customHost: string;
  subdomain: string;
} {
  if (!rawHost) return { customHost: "", subdomain: "" };
  const host = rawHost.split(":")[0].trim().toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || IPV4_RE.test(host)) {
    return { customHost: "", subdomain: "" };
  }

  // Local subdomain testing: e.g. myshop.localhost:3000
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    if (sub && !sub.includes(".") && sub !== "www") {
      return { customHost: "", subdomain: sub };
    }
    return { customHost: "", subdomain: "" };
  }

  // Deployed preview/root domains: check optional env NEXT_PUBLIC_ROOT_DOMAIN
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];

  if (rootDomain) {
    if (host === rootDomain || host === `www.${rootDomain}`) {
      return { customHost: "", subdomain: "" };
    }
    if (host.endsWith(`.${rootDomain}`)) {
      const sub = host.slice(0, -(rootDomain.length + 1));
      if (sub && !sub.includes(".") && sub !== "www") {
        return { customHost: "", subdomain: sub };
      }
    }
  }

  // Ignore default platform hosting subdomains unless configured as custom domain
  if (host.endsWith(".vercel.app") || host.endsWith(".netlify.app")) {
    return { customHost: "", subdomain: "" };
  }

  // Treat other hosts as custom domain candidates (also pass leftmost label as subdomain candidate if 3+ parts)
  const parts = host.split(".");
  const subdomain = parts.length >= 3 && parts[0] !== "www" ? parts[0] : "";
  return { customHost: host, subdomain };
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);

  // Unconditionally strip spoofable internal tenant routing headers before computing trusted values
  requestHeaders.delete(STORE_HOST_HEADER);
  requestHeaders.delete(STORE_SUBDOMAIN_HEADER);
  requestHeaders.delete(STORE_SLUG_HEADER);
  requestHeaders.delete(STORE_BASE_PATH_HEADER);

  let rewriteUrl: URL | null = null;
  let cookieToSet: { name: string; value: string } | null = null;
  let clearSlugCookie = false;

  const slugMatch = SLUG_PATH_RE.exec(pathname);
  if (slugMatch) {
    const slug = slugMatch[1].toLowerCase();
    const restPath = slugMatch[2] || "/";
    requestHeaders.set(STORE_SLUG_HEADER, slug);
    requestHeaders.set(STORE_BASE_PATH_HEADER, `/s/${slug}`);
    if (restPath !== "/api/catalog-search") cookieToSet = { name: STORE_SLUG_COOKIE, value: slug };

    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = restPath;
  } else {
    const { customHost, subdomain } = extractHostTenant(
      request.headers.get("x-forwarded-host") || request.headers.get("host"),
    );

    if (customHost) {
      requestHeaders.set(STORE_HOST_HEADER, customHost);
    }
    if (subdomain) {
      requestHeaders.set(STORE_SUBDOMAIN_HEADER, subdomain);
    }

    // Bare root storefront route (not /s/*, not /api/*, not /admin/*, not /super-admin/*, not /create-store, not /delivery/*)
    // resets active store back to default Nova Store so localhost:3000/ always loads Nova Store cleanly.
    const isStorefrontRootRoute =
      !pathname.startsWith("/api/") &&
      !pathname.startsWith("/admin") &&
      !pathname.startsWith("/super-admin") &&
      !pathname.startsWith("/create-store") &&
      !pathname.startsWith("/delivery");

    if (!customHost && !subdomain && isStorefrontRootRoute) {
      requestHeaders.set(STORE_SLUG_HEADER, DEFAULT_STORE_SLUG);
      requestHeaders.set(STORE_BASE_PATH_HEADER, "");
      if (
        request.cookies.get(STORE_SLUG_COOKIE)?.value &&
        request.cookies.get(STORE_SLUG_COOKIE)?.value !== DEFAULT_STORE_SLUG
      ) {
        clearSlugCookie = true;
      }
    }
  }

  const makeResponse = () =>
    rewriteUrl
      ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  let response = makeResponse();

  const applyTenantCookies = (res: NextResponse) => {
    if (cookieToSet) {
      res.cookies.set(cookieToSet.name, cookieToSet.value, {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
      });
    } else if (clearSlugCookie) {
      res.cookies.delete(STORE_SLUG_COOKIE);
    }
  };

  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          for (const cookie of values)
            request.cookies.set(cookie.name, cookie.value);
          response = makeResponse();
          for (const { name, value, options } of values)
            response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(headers ?? {}))
            response.headers.set(name, value);
        },
      },
    },
  );

  // Guard /super-admin
  if (pathname === "/super-admin" || pathname.startsWith("/super-admin/")) {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) {
      const login = NextResponse.redirect(
        new URL("/login?next=/super-admin", request.url),
        303,
      );
      for (const cookie of response.cookies.getAll()) login.cookies.set(cookie);
      login.headers.set("Cache-Control", "private, no-store");
      return login;
    }
    if (!(await superAdminUser(db))) {
      const home = NextResponse.redirect(new URL("/", request.url), 303);
      for (const cookie of response.cookies.getAll()) home.cookies.set(cookie);
      home.headers.set("Cache-Control", "private, no-store");
      return home;
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  // Guard /create-store (signed-in users only; redirect guests through /login with return URL)
  if (pathname === "/create-store" || pathname.startsWith("/create-store/")) {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) {
      const login = NextResponse.redirect(
        new URL("/login?next=/create-store", request.url),
        303,
      );
      for (const cookie of response.cookies.getAll()) login.cookies.set(cookie);
      login.headers.set("Cache-Control", "private, no-store");
      return login;
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  // Guard /admin
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!(await adminUser(db))) {
      const login = NextResponse.redirect(
        new URL("/login?next=/admin", request.url),
        303,
      );
      for (const cookie of response.cookies.getAll()) login.cookies.set(cookie);
      login.headers.set("Cache-Control", "private, no-store");
      return login;
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    await db.auth.getUser();
  }
  applyTenantCookies(response);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?|ttf|eot)$).*)",
  ],
};
