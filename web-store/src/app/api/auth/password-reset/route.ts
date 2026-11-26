import { serverDb } from "@/lib/db";
import { emailPasswordResetEnabled, matchesRequestOrigin } from "@/lib/password-policy";

export async function POST(req: Request) {
  if (!emailPasswordResetEnabled) return Response.json({ code: "disabled" }, { status: 403 });
  if (!matchesRequestOrigin(req)) return Response.json({code:"origin"},{status:403});
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return Response.json({code:"invalid"}, {status:400});
    const db = await serverDb();
    let redirectTo: string;
    if (body.package_name) {
      const pkg = body.package_name;
      if (typeof pkg !== "string" || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(pkg) || typeof body.store_id !== "string")
        return Response.json({code:"invalid"},{status:400});
      const official = pkg === "com.whitelabel.commerce" && body.store_id === "00000000-0000-0000-0000-000000000001";
      if (!official) {
        const { data } = await db.rpc("get_latest_mobile_app_build", {p_store_id:body.store_id,p_package_name:pkg});
        if (data?.[0]?.package_name !== pkg) return Response.json({code:"invalid"},{status:400});
      }
      redirectTo = pkg + "://auth/reset-password";
    } else {
      const origin = new URL(process.env.PASSWORD_RESET_ORIGIN || "");
      if (origin.protocol !== "https:" && origin.hostname !== "localhost") return Response.json({code:"unavailable"},{status:503});
      const store = typeof body.store_slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.store_slug) ? "/s/"+body.store_slug : "";
      redirectTo = new URL(store+"/auth/reset-password",origin.origin).href;
    }
    const {error} = await db.auth.resetPasswordForEmail(email,{redirectTo});
    if (error && (error.status ?? 0) >= 500) return Response.json({code:"unavailable"},{status:503});
    if (error?.status === 429) return Response.json({code:"wait"},{status:429});
    return Response.json({ok:true});
  } catch { return Response.json({code:"unavailable"},{status:400}); }
}
