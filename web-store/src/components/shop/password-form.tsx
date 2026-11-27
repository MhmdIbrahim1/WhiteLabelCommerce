"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useHydrated } from "@/components/use-hydrated";
import { useRouter } from "next/navigation";
import { useLanguage } from "../language-provider";
import { PasswordField } from "./password-field";
import { authEntry, authMessage, validEmail } from "@/lib/auth-flow";
import { validPassword } from "@/lib/password-policy";
import { validOtp } from "@/lib/email-otp";
import { OtpInput, ResendCode, useResendCooldown } from "./otp-input";

export function PasswordForm({ mode, token, code, basePath = "", nextPath = "", initialError = "" }: {
  mode: "change" | "request" | "recover"; token?: string; code?: string; basePath?: string; nextPath?: string; initialError?: string;
}) {
  const en = useLanguage().lang === "en";
  const router = useRouter();
  const interactive = useHydrated();
  const [step, setStep] = useState<"change" | "request" | "recover" | "otp">(mode);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(initialError);
  const lock = useRef(0);
  const sequence = useRef(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const cooldown = useResendCooldown();

  useEffect(() => {
    if (mode === "change") return;
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (url.searchParams.has("token_hash") || url.searchParams.has("code") || url.hash) {
      for (const param of ["token_hash", "type", "code"]) url.searchParams.delete(param);
      url.hash = "";
      if (fragment.has("error") || fragment.has("error_code")) {
        url.searchParams.set("error_code", fragment.get("error_code") === "otp_expired" ? "otp_expired" : "invalid_link");
        window.location.replace(url.pathname + url.search);
      } else window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
  }, [mode]);

  async function post(action: string, body: Record<string, unknown>, id: number) {
    const response = await fetch((action === "password" ? "" : basePath) + "/api/auth/" + action, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (id !== lock.current) return false;
    if (response.ok) return true;
    const result = await response.json().catch(() => ({}));
    if (id !== lock.current) return false;
    setError(result.code ?? (response.status === 422 ? "weak_password" : "server"));
    if (response.status === 429) cooldown.start();
    return false;
  }
  async function perform(work: (id: number) => Promise<void>) {
    if (!interactive || lock.current) return;
    const id = ++sequence.current;
    lock.current = id; setBusy(true); setError("");
    try { await work(id); } catch { if (lock.current === id) setError("network"); }
    finally { if (lock.current === id) { lock.current = 0; setBusy(false); } }
  }
  function checkEmail() {
    if (validEmail(email.trim()) && !emailRef.current?.validity.typeMismatch) return true;
    setError("invalid_email");
    emailRef.current?.focus();
    return false;
  }
  async function requestCode() {
    if (!checkEmail() || cooldown.seconds) return;
    await perform(async id => {
      if (await post("password-reset", { email }, id)) {
        setOtp(""); setGeneration(n => n + 1); setStep("otp"); cooldown.start();
      }
    });
  }
  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "request") return requestCode();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (!validPassword(password)) { setError("password_length"); return; }
    if (password !== data.get("confirmation")) { setError("password_mismatch"); return; }
    await perform(async id => {
      const proof = step === "otp" ? { email, token: otp } : { token_hash: token, code };
      if (!await post(step === "change" ? "password" : "password-reset/complete", { password, ...proof }, id)) return;
      if (step === "change") { setDone(true); return; }
      const login = authEntry(basePath, "/login", nextPath);
      router.replace(login + (login.includes("?") ? "&" : "?") + "registered=reset");
      router.refresh();
    });
  }
  if (done) return <p role="status">{en ? "Your password has been changed." : "تم تغيير كلمة المرور."}</p>;
  return <form className="password-form" method="post" noValidate={step === "request"} onSubmit={submitPassword}>
    {error && <p id={errorId} role="alert" className="ws-feedback ws-error auth-error">{authMessage(error, en)}</p>}
    {step === "request" ? <>
      <p>{en ? "Enter your account email to receive a recovery code and a reset link." : "أدخل بريد حسابك لنرسل رمز الاستعادة ورابط تغيير كلمة المرور."}</p>
      <label>{en ? "Email address" : "البريد الإلكتروني"}<input ref={emailRef} name="email" value={email} aria-invalid={error === "invalid_email"} aria-describedby={error === "invalid_email" ? errorId : undefined}
        onChange={e => { lock.current = 0; setBusy(false); setError(""); setEmail(e.target.value); }}
        type="email" dir="ltr" autoComplete="email" required maxLength={254} /></label>
    </> : <>
      {step === "otp" && <p role="status">{en ? "If registered, a recovery code was sent to " : "إذا كان الحساب مسجلاً، فقد أُرسل رمز الاستعادة إلى "}
        <bdi dir="ltr">{email.trim()}</bdi></p>}
      <PasswordField en={en} newPassword label={en ? "New password" : "كلمة المرور الجديدة"} minLength={8} maxLength={128} />
      <PasswordField en={en} name="confirmation" newPassword label={en ? "Confirm new password" : "تأكيد كلمة المرور الجديدة"} />
      {step === "otp" && <OtpInput key={generation} en={en} busy={busy} errorId={error ? errorId : undefined} onChange={setOtp} submitRef={submit} />}
    </>}
    <button ref={submit} className="cta" aria-busy={busy} disabled={!interactive || busy || (step === "otp" && !validOtp(otp)) || (step === "request" && cooldown.seconds > 0)}>
      {busy ? (en ? "Please wait…" : "انتظر قليلاً…") : step === "request" ? (en ? "Send recovery email" : "إرسال بريد الاستعادة") : (en ? "Save new password" : "حفظ كلمة المرور الجديدة")}
    </button>
    {step === "request" && <button type="button" className="hybrid-link-btn" disabled={!interactive || busy} onClick={() => {
      if (!checkEmail()) return;
      setError(""); setStep("otp");
    }}>{en ? "I already have a recovery code" : "لديّ رمز استعادة بالفعل"}</button>}
    {step === "otp" && <ResendCode en={en} seconds={cooldown.seconds} busy={busy} onClick={() => void requestCode()} />}
    {(step === "otp" || step === "recover") && <button type="button" className="hybrid-link-btn" disabled={busy}
      onClick={() => { setStep("request"); setOtp(""); setError(""); }}>
      {step === "otp" ? (en ? "Change email" : "تغيير البريد") : (en ? "Request a new code or link" : "طلب رمز أو رابط جديد")}</button>}
  </form>;
}
