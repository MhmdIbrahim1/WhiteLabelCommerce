import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminUser } from "@/lib/access";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          for (const cookie of values)
            request.cookies.set(cookie.name, cookie.value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values)
            response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(headers ?? {}))
            response.headers.set(name, value);
        },
      },
    },
  );
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    if (request.cookies.getAll().some((c) => c.name.startsWith("sb-")))
      await db.auth.getUser();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (!(await adminUser(db))) {
    const login = NextResponse.redirect(new URL("/login", request.url), 303);
    for (const cookie of response.cookies.getAll()) login.cookies.set(cookie);
    login.headers.set("Cache-Control", "private, no-store");
    return login;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/admin/:path*",
    "/",
    "/products/:path*",
    "/orders",
    "/account",
    "/login",
    "/register",
    "/cart",
    "/checkout",
    "/contact",
  ],
};
