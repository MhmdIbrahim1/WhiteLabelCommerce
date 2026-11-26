"use client";

import { emailPasswordResetEnabled } from "@/lib/password-policy";
import { ToastFeedback } from "@/components/floating-toast";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { normalizeDigits } from "@/lib/phone";
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
const subscribeToHydration = () => () => {};

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
        ? "Invalid verification code. Please check your inbox and try again."
        : "رمز التحقق غير صحيح. يرجى مراجعة الرمز وإعادة المحاولة.";
    case "otp_expired":
      return isEn
        ? "This verification code has expired. Request a new code below."
        : "انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد أدناه.";
    case "rate_limit":
      return isEn
        ? "Too many attempts. Please wait a little before trying again."
        : "تم إرسال محاولات كثيرة. يرجى الانتظار قليلاً قبل المحاولة مجدداً.";
    case "unconfirmed":
      return isEn
        ? "Please confirm your email using the code in your inbox."
        : "يرجى تأكيد بريدك الإلكتروني باستخدام الرمز المرسل إليك.";
    case "name":
      return isEn
        ? "Please enter your full name (2–100 characters)."
        : "يرجى إدخال الاسم الكامل (من حرفين إلى 100 حرف).";
    case "phone":
      return isEn
        ? "Please enter a valid Egyptian phone number (e.g. 01012345678)."
        : "يرجى إدخال رقم هاتف مصري صحيح (مثال: 01012345678).";
    case "password":
      return isEn
        ? "Password must be at least 6 characters."
        : "كلمة المرور يجب أن تكون 6 أحرف على الأقل.";
    case "duplicate_email":
      return isEn ? "This email is already registered. Sign in with your password." : "هذا البريد الإلكتروني مسجّل بالفعل. سجّل الدخول بكلمة المرور.";
    case "weak_password":
      return isEn ? "Choose a stronger password and try again." : "اختر كلمة مرور أقوى ثم أعد المحاولة.";
    case "signup_disabled":
      return isEn ? "Registration is currently unavailable." : "التسجيل غير متاح حالياً.";
    case "network":
      return isEn ? "Check your connection and try again." : "تحقق من اتصالك بالإنترنت ثم أعد المحاولة.";
    case "server":
    default:
      return isEn
        ? "The account service is temporarily unavailable. Please try again."
        : "خدمة الحسابات غير متاحة مؤقتاً. يرجى المحاولة مرة أخرى.";
    case "otp_send_failed":
      return isEn
        ? "Email delivery is unavailable. Use email and password to continue."
        : "تعذّر إرسال البريد حالياً. استخدم البريد وكلمة المرور للمتابعة.";
    case "credentials":
      return isEn
        ? "Incorrect email or password. Please check your credentials and try again."
        : "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق وإعادة المحاولة.";
  }
}

export function HybridAuthPanel({
  nextPath = "",
  basePath,
  initialSignup = false,
  storeName,
  initialError = "",
  initialRegistered = "",
}: {
  nextPath?: string;
  basePath: string;
  initialSignup?: boolean;
  storeName: string;
  initialError?: string;
  initialRegistered?: string;
}) {
  const router = useRouter();
  // The server renders the fields before React can handle a submission.
  const interactive = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;

  const [mode, setMode] = useState<AuthMode>("password");
  const [pwMode, setPwMode] = useState<PasswordSubMode>(initialSignup ? "signup" : "signin");

  // OTP state
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Feedback
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState(initialError);
  const [infoMsg, setInfoMsg] = useState<string>(
    initialRegistered === "confirm"
      ? isEn
        ? "Check your inbox for your confirmation code."
        : "تحقق من بريدك الإلكتروني للعثور على رمز التأكيد."
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
    if (submitting.current || cooldown > 0) return;
    setErrorCode("");
    setInfoMsg("");
    submitting.current = true;
    setBusy(true);
    try {
      const res = await sendEmailOtpAction(otpEmail);
      if (!res.ok) {
        setErrorCode(res.errorCode ?? "server");
        if (res.retryAfterSeconds) setCooldown(res.retryAfterSeconds);
        return;
      }
      setOtpSent(true);
      setCooldown(res.retryAfterSeconds ?? 60);
      setInfoMsg(
        isEn
          ? `A verification code was sent to ${otpEmail.trim()}.`
          : `تم إرسال رمز تحقق إلى ${otpEmail.trim()}.`,
      );
    } catch {
      setErrorCode("network");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setErrorCode("");
    setInfoMsg("");
    submitting.current = true;
    setBusy(true);
    try {
      const res = await verifyEmailOtpAction(otpEmail, otpCode, nextPath);
      if (!res.ok) {
        setErrorCode(res.errorCode ?? "server");
        return;
      }
      router.push(res.redirectTo || "/account");
      router.refresh();
    } catch {
      setErrorCode("network");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting.current) return;
    const form = new FormData(e.currentTarget);
    const pwEmail = String(form.get("email") ?? "");
    const pwPassword = String(form.get("password") ?? "");
    setErrorCode("");
    setInfoMsg("");
    submitting.current = true;
    setBusy(true);
    try {
      if (pwMode === "signin") {
        const res = await signInWithPasswordAction(
          pwEmail,
          pwPassword,
          nextPath,
        );
        if (!res.ok) {
          setErrorCode(res.errorCode ?? "server");
          return;
        }
        router.push(res.redirectTo || "/account");
        router.refresh();
      } else {
        const res = await signUpWithPasswordAction({
          fullName: String(form.get("full_name") ?? ""),
          phone: String(form.get("phone") ?? ""),
          email: pwEmail,
          password: pwPassword,
          nextPath,
        });
        if (!res.ok) {
          setErrorCode(res.errorCode ?? "server");
          return;
        }
        if (res.redirectTo) {
          router.push(res.redirectTo);
          router.refresh();
          return;
        }
        setInfoMsg(
          isEn
            ? "Check your inbox and enter the confirmation code."
            : "تحقق من بريدك الإلكتروني وأدخل رمز التأكيد.",
        );
        setMode("otp");
        setOtpSent(true);
        setOtpCode("");
        setCooldown(60);
        setOtpEmail(pwEmail.trim());
        setPwMode("signin");
      }
    } catch {
      setErrorCode("network");
    } finally {
      submitting.current = false;
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
            setErrorCode("");
          }}
        >
          <Mail size={15} aria-hidden="true" />
          <span>{isEn ? "Email OTP" : "رمز التحقق"}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "password"}
          className={`hybrid-auth-tab ${mode === "password" ? "is-active" : ""}`}
          onClick={() => {
            setMode("password");
            setErrorCode("");
          }}
        >
          <KeyRound size={15} aria-hidden="true" />
          <span>{isEn ? "Email & Password" : "البريد وكلمة المرور"}</span>
        </button>
      </div>

      {infoMsg && <ToastFeedback kind="info" message={infoMsg} />}
      {errorCode && <ToastFeedback kind="error" message={localizedAuthError(errorCode, isEn)} />}

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
                    {isEn ? "Send Code" : "إرسال رمز التحقق"}
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
                  setErrorCode("");
                  setInfoMsg("");
                }}
              >
                {isEn ? "Change email" : "تغيير البريد"}
              </button>
            </div>
            <label>
              {isEn ? "Verification Code" : "رمز التحقق"}
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                autoComplete="one-time-code"
                className="otp-code-input"
                value={otpCode}
                onChange={(e) =>
                  setOtpCode(normalizeDigits(e.target.value).replace(/\D/g, "").slice(0, 10))
                }
                placeholder="00000000"
                maxLength={10}
                required
              />
            </label>
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={busy || otpCode.length < 6}
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
                      ? "Resend code"
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
                setErrorCode("");
              }}
            >
              {isEn ? "Sign In" : "تسجيل الدخول"}
            </button>
            <button
              type="button"
              className={pwMode === "signup" ? "is-active" : ""}
              onClick={() => {
                setPwMode("signup");
                setErrorCode("");
              }}
            >
              <UserPlus size={14} aria-hidden="true" />
              <span>{isEn ? "Create Account" : "حساب جديد"}</span>
            </button>
          </div>

          <form onSubmit={handlePasswordSubmit} method="post" noValidate className="auth-form">
            {pwMode === "signup" && (
              <>
                <label>
                  {isEn ? "Full Name" : "الاسم الكامل"}
                  <input
                    type="text"
                    name="full_name"
                    placeholder={isEn ? "e.g. Ahmed Mahmoud" : "مثال: أحمد محمود"}
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  {isEn
                    ? "Mobile phone"
                    : "رقم الموبايل"}
                  <input
                    type="tel"
                    dir="ltr"
                    name="phone"
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
                name="email"
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
                name="password"
                placeholder={isEn ? "At least 6 characters" : "6 أحرف على الأقل"}
                autoComplete={
                  pwMode === "signup" ? "new-password" : "current-password"
                }
                minLength={6}
                required
              />
            </label>
            <button type="submit" className="auth-submit-btn" disabled={!interactive || busy}>
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
          {emailPasswordResetEnabled && pwMode === "signin" && <a className="section-more-link"
            href={basePath + "/auth/reset-password"}>{isEn ? "Forgot password?" : "نسيت كلمة المرور؟"}</a>}
        </div>
      )}
    </div>
  );
}
