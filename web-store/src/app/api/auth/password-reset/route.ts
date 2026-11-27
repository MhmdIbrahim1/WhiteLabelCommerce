import { authErrorCode, recoveryRedirect, validEmail } from "@/lib/auth-flow";
import { REQUEST_ORIGIN_HEADER, STORE_BASE_PATH_HEADER } from "@/lib/tenant-shared";
import { recoveryDb } from "@/lib/recovery-db";
import { serverDb } from "@/lib/db";
import { emailPasswordResetEnabled, matchesRequestOrigin } from "@/lib/password-policy";

export async function POST(req: Request) {
  if (!emailPasswordResetEnabled) return Response.json({ code: "disabled" }, { status: 403 });
  if (!matchesRequestOrigin(req)) return Response.json({code:"origin"},{status:403});
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!validEmail(email)) return Response.json({code:"invalid_email"}, {status:400});
    let redirectTo: string;
    if (body.package_name) {
      const pkg = body.package_name;
      if (typeof pkg !== "string" || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(pkg) || typeof body.store_id !== "string")
        return Response.json({code:"invalid"},{status:400});
      const official = pkg === "com.whitelabel.commerce" && body.store_id === "00000000-0000-0000-0000-000000000001";
      if (!official) {
        const db = await serverDb();
        const { data } = await db.rpc("get_latest_mobile_app_build", {p_store_id:body.store_id,p_package_name:pkg});
        if (data?.[0]?.package_name !== pkg) return Response.json({code:"invalid"},{status:400});
      }
      redirectTo = pkg + "://auth/reset-password";
    } else {
      const target = recoveryRedirect(req.headers.get(REQUEST_ORIGIN_HEADER), req.headers.get(STORE_BASE_PATH_HEADER) ?? "");
      if (!target) return Response.json({code:"server"},{status:503});
      redirectTo = target;
    }
    const {error} = await recoveryDb().auth.resetPasswordForEmail(email,{redirectTo});
    if (error && error.code !== "user_not_found") {
      const code = authErrorCode(error);
      return Response.json({code}, {status: code === "rate_limit" ? 429 : 503});
    }
    return Response.json({ok:true});
  } catch { return Response.json({code:"unavailable"},{status:400}); }
}
