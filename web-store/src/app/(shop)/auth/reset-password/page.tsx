import { TenantAuthShell } from "@/components/shop/tenant-auth-shell";
import Link from "next/link";
import { authEntry, safeStorefrontNext } from "@/lib/auth-flow";
import { settings } from "@/lib/shop";
import { getServerLang } from "@/lib/i18n-server";

export const metadata = { referrer: "no-referrer" as const, robots: { index: false, follow: false } };

export default async function Reset({ searchParams }: PageProps<"/auth/reset-password">) {
  const [query, store] = await Promise.all([searchParams, settings()]);
  const en = (await getServerLang(store.uiConfig.defaultLanguage)) === "en";
  return <TenantAuthShell><h1>{en ? "Sign in without a password" : "الدخول بدون كلمة مرور"}</h1>
    <p>{en ? "Continue with Google or receive a six-digit code by email to access your account at this store."
      : "للدخول إلى حسابك في هذا المتجر، تابع باستخدام Google أو اطلب رمزاً من ستة أرقام عبر البريد الإلكتروني."}</p>
    <Link className="cta" href={authEntry(store.basePath, "/login", safeStorefrontNext(query.next, store.basePath, store.slug))}>
      {en ? "Go to sign in" : "انتقل إلى تسجيل الدخول"}</Link></TenantAuthShell>;
}
