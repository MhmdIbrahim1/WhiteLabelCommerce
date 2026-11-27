import Link from "next/link";
import { redirect } from "next/navigation";
import { requestUser, serverDb } from "@/lib/db";
import { storefrontDestination } from "@/lib/storefront-auth";
import { TenantAuthShell } from "@/components/shop/tenant-auth-shell";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";
import { storeHref } from "@/lib/tenant-shared";
import { settings } from "@/lib/shop";
import { safeStorefrontNext, verifiedEmailUser } from "@/lib/auth-flow";
import { getServerLang } from "@/lib/i18n-server";
import { localizedText } from "@/lib/i18n";

export async function generateMetadata() {
  const store = await settings();
  const lang = await getServerLang(store.uiConfig.defaultLanguage);
  const name = localizedText(lang, store.nameAr, store.nameEn) || store.name;
  return {
    title: { absolute: (lang === "en" ? "Sign in · " : "تسجيل الدخول · ") + name },
    referrer: "no-referrer" as const, robots: { index: false, follow: false },
  };
}

export default async function Login({ searchParams }: PageProps<"/login">) {
  const [query, store] = await Promise.all([searchParams, settings()]);
  const next = safeStorefrontNext(query.next, store.basePath, store.slug);
  const user = await requestUser();
  if (!query.error && verifiedEmailUser(user)) redirect(await storefrontDestination(await serverDb(), store.storeId, store.basePath, next));
  const lang = await getServerLang(store.uiConfig.defaultLanguage);
  return <TenantAuthShell><div className="auth-heading"><h1>{lang === "en" ? "Sign in to your account" : "سجّل الدخول إلى حسابك"}</h1></div>
    <HybridAuthPanel basePath={store.basePath} nextPath={next}
      initialError={typeof query.error === "string" ? query.error : ""} />
    {next === storeHref(store.basePath, "/orders") && <Link className="ws-text-link" href={storeHref(store.basePath, "/orders?guest=1")}>
      {lang === "en" ? "Track a guest order" : "تتبّع طلب زائر"}</Link>}
  </TenantAuthShell>;
}
