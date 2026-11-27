import { revalidatePath } from "next/cache";
import { authEntry, safeAuthNext, safeStorefrontNext, verifiedEmailUser } from "@/lib/auth-flow";
import { postAuthDestination } from "@/lib/auth-destination";
import { serverDb } from "@/lib/db";
import { storefrontDestination } from "@/lib/storefront-auth";
import { PLATFORM_SURFACE_HEADER, STORE_BASE_PATH_HEADER, STORE_ID_HEADER, STORE_SLUG_HEADER } from "@/lib/tenant-shared";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const base = request.headers.get(STORE_BASE_PATH_HEADER) ?? "";
  const slug = request.headers.get(STORE_SLUG_HEADER) ?? undefined;
  const surface = request.headers.get(PLATFORM_SURFACE_HEADER);
  const storeId = request.headers.get(STORE_ID_HEADER);
  const platform = surface === "platform";
  const next = (platform ? safeAuthNext : safeStorefrontNext)(query.get("next"), base, slug);
  const go = (location: string) => new Response(null, { status: 303,
    headers: { Location: location, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  const fail = (error = "oauth_failed") => {
    const login = authEntry(base, "/login", next);
    return go(login + (login.includes("?") ? "&" : "?") + "error=" + error);
  };
  if (!platform && (surface !== "storefront" || !storeId || !slug)) return fail();
  if (query.has("error")) return fail(query.get("error") === "access_denied" ? "oauth_cancelled" : "oauth_failed");
  const code = query.get("code");
  if (!code || !/^[a-zA-Z0-9_-]{24,256}$/.test(code)) return fail();
  try {
    const db = await serverDb();
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (error || !verifiedEmailUser(data.user) || data.session?.user.id !== data.user.id) return fail();
    const destination = platform ? await postAuthDestination(db, data.user, next, "/account")
      : await storefrontDestination(db, storeId!, base, next);
    revalidatePath("/", "layout");
    return go(destination);
  } catch { return fail(); }
}
