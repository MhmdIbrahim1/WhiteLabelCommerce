"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Loader2,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
  sendEmailOtpAction,
  verifyEmailOtpAction,
  signInWithPasswordAction,
  signUpWithPasswordAction,
  type AuthActionResult,
} from "@/app/login/actions";

type AuthMode = "otp" | "password";
type PasswordSubMode = "signin" | "signup";

function localizedAuthError(
  code: AuthActionResult["errorCode"] | string | undefined,
  isEn: boolean,
): string {
  switch (code) {
    case "invalid_email":
      return isEn
        ? "Please enter a valid email address."
        : "يرجى إدخال بريد إلكتروني صحيح.";
    case "invalid_otp":
      return isEn
        ? "Invalid 6-digit verification code. Please check your inbox and try again."
        : "رمز التحقق غير صحيح. يرجى مراجعة الرمز المكوّن من 6 أرقام وإعادة المحاولة.";
    case "otp_expired":
      return isEn
        ? "This verification code has expired. Request a new code below."
        : "انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد أدناه.";
    case "rate_limit":
      return isEn
        ? "Too many attempts. Please wait 60 seconds before trying again."
        : "تم إرسال محاولات كثيرة. يرجى الانتظار 60 ثانية قبل المحاولة مجدداً.";
    case "unconfirmed":
      return isEn
        ? "Please confirm your email address first, or sign in instantly using the 6-digit Email OTP tab."
        : "يرجى تأكيد بريدك الإلكتروني أولاً، أو تسجيل الدخول فوراً عبر رمز التحقق (6 أرقام).";
    case "name":
      return isEn
        ? "Please enter your full name (at least 2 characters)."
        : "يرجى إدخال الاسم الكامل (حرفين على الأقل).";
    case "phone":
      return isEn
        ? "Please enter a valid Egyptian phone number (e.g. 01012345678)."
        : "يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678).";
    case "password":
      return isEn
        ? "Password must be at least 6 characters."
        : "كلمة المرور يجب أن تكون 6 أحرف على الأقل.";
    case "signup":
      return isEn
        ? "Could not create account. This email may already be registered."
        : "تعذر إنشاء الحساب. قد يكون البريد الإلكتروني مسجلاً بالفعل.";
    case "otp_send_failed":
      return isEn
        ? "Could not send verification code right now. Please try again."
        : "تعذر إرسال رمز التحقق حالياً. يرجى المحاولة مرة أخرى.";
    case "credentials":
    default:
      return isEn
        ? "Incorrect email or password. Please check your credentials and try again."
        : "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق وإعادة المحاولة.";
  }
}

export function HybridAuthPanel({
  nextPath = "/account",
  storeName,
  initialError = "",
  initialRegistered = "",
}: {
  nextPath?: string;
  storeName: string;
  initialError?: string;
  initialRegistered?: string;
}) {
  const router = useRouter();
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;

  const [mode, setMode] = useState<AuthMode>("otp");
  const [pwMode, setPwMode] = useState<PasswordSubMode>("signin");

  // OTP state
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Password state
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Feedback
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>(
    initialError ? localizedAuthError(initialError, isEn) : "",
  );
  const [infoMsg, setInfoMsg] = useState<string>(
    initialRegistered === "confirm"
      ? isEn
        ? "Account created! Confirm your email or enter a 6-digit OTP code to sign in."
        : "تم إنشاء حسابك بنجاح! أكّد بريدك الإلكتروني أو سجّل الدخول عبر رمز التحقق (6 أرقام)."
      : "",
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || cooldown > 0) return;
    setErrorMsg("");
    setInfoMsg("");
    setBusy(true);
    try {
      const res = await sendEmailOtpAction(otpEmail);
      if (!res.ok) {
        setErrorMsg(localizedAuthError(res.errorCode, isEn));
        if (res.retryAfterSeconds) setCooldown(res.retryAfterSeconds);
        return;
      }
      setOtpSent(true);
      setCooldown(res.retryAfterSeconds ?? 60);
      setInfoMsg(
        isEn
          ? `A 6-digit verification code was sent to ${otpEmail.trim()}.`
          : `تم إرسال رمز تحقق مكوّن من 6 أرقام إلى ${otpEmail.trim()}.`,
      );
    } catch {
      setErrorMsg(localizedAuthError("otp_send_failed", isEn));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMsg("");
    setInfoMsg("");
    setBusy(true);
    try {
      const res = await verifyEmailOtpAction(otpEmail, otpCode, nextPath);
      if (!res.ok) {
        setErrorMsg(localizedAuthError(res.errorCode, isEn));
        return;
      }
      router.push(res.redirectTo || "/account");
      router.refresh();
    } catch {
      setErrorMsg(localizedAuthError("invalid_otp", isEn));
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMsg("");
    setInfoMsg("");
    setBusy(true);
    try {
      if (pwMode === "signin") {
        const res = await signInWithPasswordAction(
          pwEmail,
          pwPassword,
          nextPath,
        );
        if (!res.ok) {
          setErrorMsg(localizedAuthError(res.errorCode, isEn));
          return;
        }
        router.push(res.redirectTo || "/account");
        router.refresh();
      } else {
        const res = await signUpWithPasswordAction({
          fullName,
          phone,
          email: pwEmail,
          password: pwPassword,
          nextPath,
        });
        if (!res.ok) {
          setErrorMsg(localizedAuthError(res.errorCode, isEn));
          return;
        }
        if (res.redirectTo) {
          router.push(res.redirectTo);
          router.refresh();
          return;
        }
        setInfoMsg(
          isEn
            ? "Account created! Check your email for the confirmation link or switch to 6-Digit Email OTP."
            : "تم إنشاء الحساب بنجاح! تحقق من بريدك الإلكتروني للتأكيد أو استخدم رمز التحقق (6 أرقام).",
        );
        setOtpEmail(pwEmail.trim());
        setPwMode("signin");
      }
    } catch {
      setErrorMsg(localizedAuthError("credentials", isEn));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hybrid-auth-root">
      <div
        className="hybrid-auth-tabs"
        role="tablist"
        aria-label={isEn ? "Sign-in method" : "طريقة تسجيل الدخول"}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "otp"}
          className={`hybrid-auth-tab ${mode === "otp" ? "is-active" : ""}`}
          onClick={() => {
            setMode("otp");
            setErrorMsg("");
          }}
        >
          <Mail size={15} aria-hidden="true" />
          <span>{isEn ? "6-Digit Email OTP" : "رمز التحقق (6 أرقام)"}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "password"}
          className={`hybrid-auth-tab ${mode === "password" ? "is-active" : ""}`}
          onClick={() => {
            setMode("password");
            setErrorMsg("");
          }}
        >
          <KeyRound size={15} aria-hidden="true" />
          <span>{isEn ? "Email & Password" : "البريد وكلمة المرور"}</span>
        </button>
      </div>

      {infoMsg && (
        <p className="auth-alert auth-alert--ok" role="status">
          {infoMsg}
        </p>
      )}
      {errorMsg && (
        <p className="auth-alert auth-alert--error" role="alert">
          {errorMsg}
        </p>
      )}

      {mode === "otp" ? (
        !otpSent ? (
          <form onSubmit={handleSendOtp} className="auth-form">
            <label>
              {isEn ? "Email Address" : "البريد الإلكتروني"}
              <input
                type="email"
                dir="ltr"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
            </label>
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={busy || !otpEmail.trim()}
            >
              {busy ? (
                <Loader2 size={17} className="spin-icon" aria-hidden="true" />
              ) : (
                <>
                  <span>
                    {isEn ? "Send 6-Digit Code" : "إرسال رمز التحقق"}
                  </span>
                  <ArrowIcon size={17} />
                </>
              )}
            </button>
            <p className="hybrid-auth-hint">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>
                {isEn
                  ? `Passwordless sign-in or automatic account creation for ${storeName}.`
                  : `تسجيل دخول آمن بدون كلمة مرور أو إنشاء حساب تلقائي في ${storeName}.`}
              </span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="auth-form">
            <div className="hybrid-otp-email-row">
              <span dir="ltr">{otpEmail.trim()}</span>
              <button
                type="button"
                className="hybrid-link-btn"
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                  setErrorMsg("");
                  setInfoMsg("");
                }}
              >
                {isEn ? "Change email" : "تغيير البريد"}
              </button>
            </div>
            <label>
              {isEn ? "6-Digit Verification Code" : "رمز التحقق المكوّن من 6 أرقام"}
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                autoComplete="one-time-code"
                className="otp-code-input"
                value={otpCode}
                onChange={(e) =>
                  setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                maxLength={6}
                required
              />
            </label>
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={busy || otpCode.length !== 6}
            >
              {busy ? (
                <Loader2 size={17} className="spin-icon" aria-hidden="true" />
              ) : (
                <>
                  <span>{isEn ? "Verify & Sign In" : "تأكيد وتسجيل الدخول"}</span>
                  <ArrowIcon size={17} />
                </>
              )}
            </button>
            <div className="hybrid-resend-row">
              <button
                type="button"
                className="hybrid-link-btn"
                disabled={busy || cooldown > 0}
                onClick={() => handleSendOtp()}
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>
                  {cooldown > 0
                    ? isEn
                      ? `Resend code in ${cooldown}s`
                      : `إعادة الإرسال خلال ${cooldown} ثانية`
                    : isEn
                      ? "Resend 6-digit code"
                      : "إعادة إرسال الرمز"}
                </span>
              </button>
            </div>
          </form>
        )
      ) : (
        <div className="hybrid-pw-wrap">
          <div className="auth-sub-toggle">
            <button
              type="button"
              className={pwMode === "signin" ? "is-active" : ""}
              onClick={() => {
                setPwMode("signin");
                setErrorMsg("");
              }}
            >
              {isEn ? "Sign In" : "تسجيل الدخول"}
            </button>
            <button
              type="button"
              className={pwMode === "signup" ? "is-active" : ""}
              onClick={() => {
                setPwMode("signup");
                setErrorMsg("");
              }}
            >
              <UserPlus size={14} aria-hidden="true" />
              <span>{isEn ? "Create Account" : "حساب جديد"}</span>
            </button>
          </div>

          <form onSubmit={handlePasswordSubmit} className="auth-form">
            {pwMode === "signup" && (
              <>
                <label>
                  {isEn ? "Full Name" : "الاسم الكامل"}
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={isEn ? "e.g. Ahmed Mahmoud" : "مثال: أحمد محمود"}
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  {isEn
                    ? "Mobile Phone (links past guest orders)"
                    : "رقم الموبايل (يربط طلباتك السابقة تلقائياً)"}
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01012345678"
                    autoComplete="tel"
                    maxLength={24}
                    required
                  />
                </label>
              </>
            )}

            <label>
              {isEn ? "Email Address" : "البريد الإلكتروني"}
              <input
                type="email"
                dir="ltr"
                value={pwEmail}
                onChange={(e) => setPwEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              {isEn ? "Password" : "كلمة المرور"}
              <input
                type="password"
                dir="ltr"
                value={pwPassword}
                onChange={(e) => setPwPassword(e.target.value)}
                placeholder={isEn ? "At least 6 characters" : "6 أحرف على الأقل"}
                autoComplete={
                  pwMode === "signup" ? "new-password" : "current-password"
                }
                minLength={6}
                required
              />
            </label>
            <button type="submit" className="auth-submit-btn" disabled={busy}>
              {busy ? (
                <Loader2 size={17} className="spin-icon" aria-hidden="true" />
              ) : (
                <>
                  <span>
                    {pwMode === "signup"
                      ? isEn
                        ? "Create Account"
                        : "إنشاء الحساب"
                      : isEn
                        ? "Sign In"
                        : "تسجيل الدخول"}
                  </span>
                  <ArrowIcon size={17} />
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
