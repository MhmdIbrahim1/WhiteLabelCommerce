import { serverDb } from "@/lib/db";
import { emailPasswordResetEnabled, validPassword, matchesRequestOrigin } from "@/lib/password-policy";

export async function POST(req: Request) {
  if (!emailPasswordResetEnabled) return Response.json({code:"disabled"},{status:403});
  if (!matchesRequestOrigin(req)) return Response.json({code:"origin"},{status:403});
  try {
    const {password,token_hash,code} = await req.json();
    if (!validPassword(password)) return Response.json({code:"invalid"},{status:400});
    const db = await serverDb();
    const proof = typeof token_hash === "string" && /^[a-zA-Z0-9_-]{32,256}$/.test(token_hash)
      ? await db.auth.verifyOtp({token_hash,type:"recovery"})
      : typeof code === "string" && /^[a-zA-Z0-9_-]{24,256}$/.test(code) ? await db.auth.exchangeCodeForSession(code) : null;
    if (!proof?.data.session || proof.error) return Response.json({code:"expired"},{status:400});
    const {error} = await db.auth.updateUser({password});
    return Response.json({ok:!error},{status:error ? 422 : 200});
  } catch { return Response.json({code:"invalid"},{status:400}); }
}
