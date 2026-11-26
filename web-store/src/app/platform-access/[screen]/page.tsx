import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/workspace-surface";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";
import { PasswordForm } from "@/components/shop/password-form";
import { emailPasswordResetEnabled } from "@/lib/password-policy";
import { getServerLang } from "@/lib/i18n-server";
import { settings } from "@/lib/shop";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function PlatformAccess({ params, searchParams }: {
  params: Promise<{ screen: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ screen }, query, store] = await Promise.all([params, searchParams, settings()]);
  const en = (await getServerLang(store.uiConfig.defaultLanguage)) === "en";
  const next = typeof query.next === "string" ? query.next : "";
  const returnQuery = next ? "?next=" + encodeURIComponent(next) : "";
  if (screen === "reset-password") {
    const token = query.type === "recovery" && typeof query.token_hash === "string" ? query.token_hash : undefined;
    const code = typeof query.code === "string" ? query.code : undefined;
    return <AuthShell><h1>{en ? "Reset your password" : "استعادة كلمة المرور"}</h1>
      {emailPasswordResetEnabled ? <>
        <p>{token || code ? (en ? "Choose a new password for your account." : "اختر كلمة مرور جديدة لحسابك.") :
          (en ? "Enter your email to receive a reset link." : "أدخل بريدك لنرسل إليك رابط استعادة كلمة المرور.")}</p>
        <PasswordForm inlineFeedback mode={token || code ? "recover" : "request"} token={token} code={code} />
      </> : <p role="status">{en ? "Email recovery is currently unavailable. You can sign in with an email code." : "استعادة كلمة المرور بالبريد غير متاحة حالياً. يمكنك الدخول برمز يُرسل إلى بريدك."}</p>}
      <Link className="ws-text-link" href={"/login" + returnQuery}>{en ? "Back to sign in" : "العودة إلى تسجيل الدخول"}</Link>
    </AuthShell>;
  }
  if (screen !== "login" && screen !== "register") notFound();
  const signup = screen === "register";
  return <AuthShell><h1>{signup ? (en ? "Create your account" : "إنشاء حساب") : (en ? "Welcome back" : "أهلاً بعودتك")}</h1>
    <p>{signup ? (en ? "Use your email to set up your workspace." : "سجّل بريدك لتبدأ إعداد مساحة عملك.") :
      (en ? "Sign in to continue to your workspace." : "سجّل الدخول للمتابعة إلى مساحة عملك.")}</p>
    <HybridAuthPanel key={screen} platform basePath="" storeName="WhiteLabelCommerce" nextPath={next}
      initialSignup={signup} initialOtp={query.method === "otp"} initialError={typeof query.error === "string" ? query.error : ""}
      initialRegistered={typeof query.registered === "string" ? query.registered : ""} />
    <div className="ws-auth-switch">{signup ? (en ? "Already have an account?" : "لديك حساب؟") : (en ? "New to WhiteLabelCommerce?" : "ليس لديك حساب؟")}{" "}
      <Link href={(signup ? "/login" : "/register") + returnQuery}>{signup ? (en ? "Sign in" : "تسجيل الدخول") : (en ? "Create an account" : "أنشئ حساباً")}</Link></div>
  </AuthShell>;
}
