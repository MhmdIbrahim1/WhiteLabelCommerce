import { authEntry, authErrorCode, safeAuthNext, validTokenHash, verifiedEmailUser } from "@/lib/auth-flow";
import { serverDb } from "@/lib/db";
import { STORE_BASE_PATH_HEADER, STORE_SLUG_HEADER, storeHref } from "@/lib/tenant-shared";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const base = request.headers.get(STORE_BASE_PATH_HEADER) ?? "";
  const next = safeAuthNext(query.get("next"), base, request.headers.get(STORE_SLUG_HEADER) ?? undefined);
  const login = authEntry(base, "/login", next);
  const type = query.get("type");
  const token = query.get("token_hash");
  const code = query.get("code");
  const recovery = type === "recovery" || Boolean(code && !type);
  const go = (location: string) => new Response(null, { status: 303,
    headers: { Location: location, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  const failure = (error: string) => {
    const path = recovery ? authEntry(base, "/forgot-password", next) : login;
    return go(path + (path.includes("?") ? "&" : "?") + (recovery ? "error_code=" : "method=otp&error=") + error);
  };
  if (query.has("error") || query.has("error_code")) return failure(query.get("error_code") === "otp_expired" ? "otp_expired" : "invalid_link");
  if (recovery) {
    const params = new URLSearchParams();
    if (validTokenHash(token)) { params.set("type", "recovery"); params.set("token_hash", token); }
    else if (code && /^[a-zA-Z0-9_-]{24,256}$/.test(code)) params.set("code", code);
    else return failure("invalid_link");
    if (next) params.set("next", next);
    // Only an explicit password submission consumes the proof. Email scanners may follow this GET.
    return go(base + "/reset-password?" + params);
  }
  if (!validTokenHash(token) || (type !== "signup" && type !== "magiclink" && type !== "email")) return failure("invalid_link");
  const db = await serverDb();
  const { data, error } = await db.auth.verifyOtp({ token_hash: token, type });
  if (error || !data.session || !verifiedEmailUser(data.user)) return failure(error ? authErrorCode(error, "invalid_link") : "invalid_link");
  return go(next || storeHref(base, "/account"));
}
