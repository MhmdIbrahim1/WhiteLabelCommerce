import { emailPasswordResetEnabled, validPassword, matchesRequestOrigin } from "@/lib/password-policy";
import { authErrorCode, validEmail, validTokenHash } from "@/lib/auth-flow";
import { normalizeOtp, validOtp } from "@/lib/email-otp";
import { legacyRecoveryDb, recoveryDb } from "@/lib/recovery-db";

export async function POST(req: Request) {
  if (!emailPasswordResetEnabled || !matchesRequestOrigin(req)) return Response.json({ code: "disabled" }, { status: 403 });
  try {
    const body = await req.json();
    if (!validPassword(body.password)) return Response.json({ code: "password_length" }, { status: 400 });
    const legacy = !body.token_hash && body.token === undefined && typeof body.code === "string" && /^[a-zA-Z0-9_-]{24,256}$/.test(body.code);
    const db = legacy ? await legacyRecoveryDb() : recoveryDb();
    let proof;
    if (validTokenHash(body.token_hash)) {
      proof = await db.auth.verifyOtp({ type: "recovery", token_hash: body.token_hash });
    } else if (typeof body.email === "string" && validEmail(body.email) && typeof body.token === "string" && validOtp(body.token)) {
      proof = await db.auth.verifyOtp({ type: "recovery", email: body.email.trim().toLowerCase(), token: normalizeOtp(body.token) });
    } else if (legacy) {
      const exchanged = await db.auth.exchangeCodeForSession(body.code);
      if (!("redirectType" in exchanged.data) || exchanged.data.redirectType !== "recovery") {
        return Response.json({ code: "invalid_link" }, { status: 400 });
      }
      proof = exchanged;
    } else {
      return Response.json({ code: body.token !== undefined ? "invalid_otp" : "invalid_link" }, { status: 400 });
    }
    if (proof.error || !proof.data.session) {
      const fallback = body.token !== undefined ? "invalid_otp" : "invalid_link";
      const code = proof.error ? authErrorCode(proof.error, fallback) : fallback;
      return Response.json({ code }, { status: code === "rate_limit" ? 429 : 400 });
    }
    const { error } = await db.auth.updateUser({ password: body.password });
    if (error) return Response.json({ code: authErrorCode(error, "weak_password") }, { status: 422 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ code: "server" }, { status: 503 });
  }
}
