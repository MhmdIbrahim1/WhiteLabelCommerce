"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { useHydrated } from "@/components/use-hydrated";
import { announceSessionChange } from "@/components/auth-session";
import { useLanguage } from "@/components/language-provider";
import { authEntry, authMessage, validEmail } from "@/lib/auth-flow";
import { validOtp } from "@/lib/email-otp";
import { emailPasswordResetEnabled } from "@/lib/password-policy";
import { sendEmailOtpAction, verifyEmailOtpAction, signInWithPasswordAction, signUpWithPasswordAction, signUpWithCodeAction,
  type AuthActionResult } from "@/app/login/actions";
import { OtpInput, ResendCode, useResendCooldown } from "./otp-input";
import { sendStorefrontEmailOtpAction, verifyStorefrontEmailOtpAction } from "@/app/login/storefront-actions";
import { GoogleAuthButton, beginGoogleAuth } from "./google-auth-button";
import { PasswordField } from "./password-field";

export function HybridAuthPanel({ platform = false, nextPath = "", initialOtp = false, basePath,
  initialSignup: registration = false, initialError = "", initialRegistered = "" }: {
  platform?: boolean; nextPath?: string; initialOtp?: boolean; basePath: string;
  initialSignup?: boolean; initialError?: string; initialRegistered?: string;
}) {
  const en = useLanguage().lang === "en";
  const interactive = useHydrated();
  const initialSignup = platform && registration;
  const [method, setMethod] = useState<"password" | "code">(!platform || initialOtp ? "code" : "password");
  const [purpose, setPurpose] = useState<"signin" | "signup">(initialSignup ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const active = useRef(0);
  const sequence = useRef(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const cooldown = useResendCooldown();

  function invalidate() {
    active.current = 0;
    setBusy(false);
    setError("");
  }
  function chooseMethod(value: "password" | "code") {
    invalidate();
    setMethod(value);
    setPurpose(initialSignup ? "signup" : "signin");
    setVerifying(false);
    setCode("");
  }
  function checkEmail() {
    if (validEmail(email.trim()) && !emailRef.current?.validity.typeMismatch) return true;
    invalidate();
    setError("invalid_email");
    emailRef.current?.focus();
    return false;
  }
  async function request(work: () => Promise<AuthActionResult>, onResult: (result: AuthActionResult) => void) {
    if (!interactive || active.current) return;
    const id = ++sequence.current;
    active.current = id;
    setBusy(true);
    setError("");
    try {
      const result = await work();
      if (active.current !== id) return;
      if (result.retryAfterSeconds) cooldown.start(result.retryAfterSeconds);
      onResult(result);
    } catch {
      if (active.current === id) setError("network");
    } finally {
      if (active.current === id) { active.current = 0; setBusy(false); }
    }
  }
  function enterCode() {
    setCode("");
    setGeneration(n => n + 1);
    setVerifying(true);
  }
  function finish(result: AuthActionResult) {
    if (platform && (result.needsConfirmation || result.errorCode === "unconfirmed")) {
      setPurpose("signup");
      enterCode();
    } else if (result.ok && result.redirectTo) {
      announceSessionChange();
      window.location.replace(result.redirectTo);
    } else setError(result.errorCode ?? "server");
  }
  function send() {
    if (!checkEmail() || cooldown.seconds) return;
    void request(() => platform ? sendEmailOtpAction(email, purpose) : sendStorefrontEmailOtpAction(email), result => {
      if (result.ok) enterCode();
      else setError(result.errorCode ?? "server");
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkEmail()) return;
    if (method === "code" && !initialSignup) return send();
    if (event.currentTarget.reportValidity && !event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (initialSignup) {
      const profile = { email, nextPath, fullName: String(form.get("full_name") ?? ""), phone: String(form.get("phone") ?? "") };
      if (method === "code" && cooldown.seconds) return;
      void request(() => method === "code" ? signUpWithCodeAction(profile) : signUpWithPasswordAction({ ...profile, password }), finish);
    } else void request(() => signInWithPasswordAction(email, password, nextPath), finish);
  }
  function verify(event: FormEvent) {
    event.preventDefault();
    if (validOtp(code)) void request(() => platform ? verifyEmailOtpAction(email, code, nextPath, purpose)
      : verifyStorefrontEmailOtpAction(email, code, nextPath), finish);
  }
  const emailError = error === "invalid_email";
  const credentialsPending = busy && (method === "password" || verifying);
  const otpSend = method === "code" && !verifying;
  const label = otpSend ? (en ? "Send verification code" : "إرسال رمز التحقق")
    : initialSignup ? (en ? "Create account" : "إنشاء حساب") : (en ? "Sign in" : "تسجيل الدخول");
  return <div className="hybrid-auth-root">
    {!verifying && <><GoogleAuthButton en={en} busy={busy} interactive={interactive} onClick={() =>
      void request(() => beginGoogleAuth(platform, basePath, nextPath), result => { if (!result.ok) setError("oauth_failed"); })} />
      <div className="auth-divider">{en ? "or" : "أو"}</div></>}
    {platform && !verifying && <div className="hybrid-auth-tabs" role="group" aria-label={en ? "Authentication method" : "طريقة التحقق"}>
      {(["password", "code"] as const).map(value => <button key={value} type="button" aria-pressed={method === value}
        className={"hybrid-auth-tab" + (method === value ? " is-active" : "")} disabled={!interactive || credentialsPending} onClick={() => chooseMethod(value)}>
        {value === "password" ? (en ? "Password" : "كلمة المرور") : (en ? "Verification code" : "رمز التحقق")}
      </button>)}
    </div>}
    {platform && initialRegistered === "reset" && <p role="status">{en ? "Password updated. Sign in with your new password." : "تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة."}</p>}
    {initialRegistered === "confirm" && !verifying && <p role="status">{en ? "Check your inbox for your confirmation code." : "تحقق من بريدك للعثور على رمز التأكيد."}</p>}
    {error && !emailError && <p id={errorId} role="alert" className="auth-error">{authMessage(error, en)}</p>}
    {verifying ? <form className="auth-form" onSubmit={verify}>
      <p role="status">{!platform ? (en ? "Enter the six-digit code sent to " : "أدخل الرمز المكوّن من ستة أرقام المرسل إلى ") : purpose === "signup"
        ? (en ? "If this address can be registered, enter the confirmation code sent to " : "إذا كان التسجيل متاحاً لهذا البريد، فأدخل رمز التأكيد المرسل إلى ")
        : (en ? "If you have an account, enter the sign-in code sent to " : "إذا كان لديك حساب، فأدخل رمز الدخول المرسل إلى ")}
        <bdi dir="ltr">{email.trim()}</bdi></p>
      {purpose === "signup" && <p>{en ? "Already registered? " : "لديك حساب بالفعل؟ "}<Link href={authEntry(basePath, "/login", nextPath)} onClick={() => chooseMethod("password")}>
        {en ? "Sign in" : "سجّل الدخول"}</Link></p>}
      <OtpInput key={generation} en={en} busy={busy} errorId={error ? errorId : undefined} onChange={setCode} submitRef={submitRef} />
      <button ref={submitRef} className="auth-submit-btn" aria-busy={busy} disabled={busy || !validOtp(code)}>
        {purpose === "signup" ? (en ? "Confirm email" : "تأكيد البريد") : (en ? "Sign in" : "تسجيل الدخول")}</button>
      <div className="hybrid-resend-row"><ResendCode en={en} busy={busy} seconds={cooldown.seconds} onClick={send} />
        <button type="button" className="hybrid-link-btn" disabled={busy} onClick={() => chooseMethod(method)}>
          {en ? "Change email" : "تغيير البريد"}</button></div>
    </form> : <form className="auth-form" method="post" noValidate onSubmit={submit}>
      {initialSignup && <div className="auth-name-phone">
        <label>{en ? "Full name" : "الاسم الكامل"}<input name="full_name" dir="auto" autoComplete="name" required minLength={2} maxLength={100} /></label>
        <label>{en ? "Mobile phone" : "رقم الموبايل"}<input name="phone" type="tel" dir="ltr" autoComplete="tel" required maxLength={24} /></label>
      </div>}
      <label>{en ? "Email address" : "البريد الإلكتروني"}
        <input ref={emailRef} name="email" type="email" dir="ltr" autoComplete="email" required maxLength={254} value={email}
          readOnly={credentialsPending} aria-invalid={emailError} aria-describedby={emailError ? errorId : undefined}
          onChange={e => { invalidate(); setEmail(e.target.value); }} />
      </label>
      {emailError && <p id={errorId} role="alert" className="auth-error">{authMessage(error, en)}</p>}
      {!platform && <p className="auth-code-hint">{en ? "We’ll email you a six-digit sign-in code." : "سنرسل إلى بريدك رمز دخول من ستة أرقام."}</p>}
      {method === "password" && <PasswordField en={en} label={en ? "Password" : "كلمة المرور"} newPassword={initialSignup}
        minLength={initialSignup ? 6 : undefined} extra={emailPasswordResetEnabled && !initialSignup &&
          <Link href={authEntry(basePath, "/forgot-password", nextPath)}>{en ? "Forgot password?" : "نسيت كلمة المرور؟"}</Link>} />}
      <button className="auth-submit-btn" aria-busy={busy} disabled={!interactive || busy || (otpSend && cooldown.seconds > 0)}>
        {busy ? (en ? "Please wait…" : "انتظر قليلاً…") : otpSend && cooldown.seconds
          ? <>{en ? "Try again in " : "أعد المحاولة خلال "}<bdi dir="ltr">{cooldown.seconds}</bdi>{en ? "s" : " ثانية"}</> : label}</button>
    </form>}
  </div>;
}
