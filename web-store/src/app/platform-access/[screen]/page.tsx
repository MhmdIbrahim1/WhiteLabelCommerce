import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { AccessShell } from "@/components/access-shell";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";
import { RecoveryPanel } from "@/components/shop/recovery-panel";
import { continueSignedInLogin } from "@/lib/auth-destination";
import { safeAuthNext } from "@/lib/auth-flow";
import { getServerLang } from "@/lib/i18n-server";

export const metadata: Metadata = { title: { absolute: "ShopStage" }, referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function PlatformAccess({ params, searchParams }: {
  params: Promise<{ screen: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ screen }, query, lang] = await Promise.all([params, searchParams, getServerLang()]);
  const en = lang === "en";
  const next = safeAuthNext(query.next, "");
  const returnQuery = next ? "?next=" + encodeURIComponent(next) : "";
  if (screen === "reset-password") return <WorkspaceSurface><AccessShell lang={lang}><RecoveryPanel query={query} basePath="" en={en} /></AccessShell></WorkspaceSurface>;
  if (screen !== "login" && screen !== "register") notFound();
  const signup = screen === "register";
  if (!signup && !query.error && query.registered !== "reset") await continueSignedInLogin(next, "/account");
  return <WorkspaceSurface><AccessShell lang={lang}><h1>{signup ? (en ? "Create your account" : "إنشاء حساب") : (en ? "Welcome back" : "أهلاً بعودتك")}</h1>
    <p>{signup ? (en ? "Use your email to set up your workspace." : "سجّل بريدك لتبدأ إعداد مساحة عملك.") :
      (en ? "Sign in to continue to your workspace." : "سجّل الدخول للمتابعة إلى مساحة عملك.")}</p>
    <HybridAuthPanel key={screen} platform basePath="" nextPath={next}
      initialSignup={signup} initialOtp={query.method === "otp"} initialError={typeof query.error === "string" ? query.error : ""}
      initialRegistered={typeof query.registered === "string" ? query.registered : ""} />
    <div className="access-switch">{signup ? (en ? "Already have an account?" : "لديك حساب؟") : (en ? "New here?" : "ليس لديك حساب؟")}{" "}
      <Link href={(signup ? "/login" : "/register") + returnQuery}>{signup ? (en ? "Sign in" : "تسجيل الدخول") : (en ? "Create an account" : "أنشئ حساباً")}</Link></div>
  </AccessShell></WorkspaceSurface>;
}
