import Link from "next/link";
import { authEntry, safeAuthNext, validTokenHash } from "@/lib/auth-flow";
import { emailPasswordResetEnabled } from "@/lib/password-policy";
import { PasswordForm } from "./password-form";

export function RecoveryPanel({ query, basePath, en }: {
  query: Record<string, string | string[] | undefined>; basePath: string; en: boolean;
}) {
  const next = safeAuthNext(query.next, basePath);
  const token = query.type === "recovery" && validTokenHash(query.token_hash) ? query.token_hash : undefined;
  const code = typeof query.code === "string" && /^[a-zA-Z0-9_-]{24,256}$/.test(query.code) ? query.code : undefined;
  const error = query.error_code === "otp_expired" ? "otp_expired" :
    query.error || query.error_code || (!token && !code && (query.token_hash !== undefined || query.code !== undefined || query.type !== undefined))
      ? "invalid_link" : "";
  return <><h1>{en ? "Reset your password" : "استعادة كلمة المرور"}</h1>
    {emailPasswordResetEnabled ? <PasswordForm key={token || code || "request"} mode={!error && (token || code) ? "recover" : "request"}
      token={token} code={code} basePath={basePath} nextPath={next} initialError={error} />
      : <p role="status">{en ? "Email recovery is unavailable. You can sign in with an email code." : "استعادة كلمة المرور غير متاحة حالياً. يمكنك الدخول برمز عبر البريد."}</p>}
    <Link className="ws-text-link" href={authEntry(basePath, "/login", next) + (!emailPasswordResetEnabled ? (next ? "&" : "?") + "method=otp" : "")}>
      {en ? "Back to sign in" : "العودة إلى تسجيل الدخول"}</Link>
  </>;
}
