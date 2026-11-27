import Link from "next/link";
import { continueSignedInLogin } from "@/lib/auth-destination";
import { TenantAuthShell } from "@/components/shop/tenant-auth-shell";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";
import { storeHref } from "@/lib/tenant-shared";
import { settings } from "@/lib/shop";
import { safeAuthNext } from "@/lib/auth-flow";
import { getServerLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const [query, store] = await Promise.all([searchParams, settings()]);
  const account = storeHref(store.basePath, "/account");
  const next = safeAuthNext(query.next, store.basePath, store.slug) || account;
  if (!query.error && query.registered !== "reset") await continueSignedInLogin(next, account);
  const lang = await getServerLang(store.uiConfig.defaultLanguage);
  return <TenantAuthShell><div className="auth-heading"><h1>{t(lang, "authWelcomeBack")}</h1></div>
    <HybridAuthPanel basePath={store.basePath} nextPath={next}
      initialOtp={query.method === "otp"} initialRegistered={typeof query.registered === "string" ? query.registered : ""}
      initialError={typeof query.error === "string" ? query.error : ""} />
    {next === storeHref(store.basePath, "/orders") && <Link className="ws-text-link" href={storeHref(store.basePath, "/orders?guest=1")}>
      {lang === "en" ? "Track a guest order" : "تتبّع طلب زائر"}</Link>}
  </TenantAuthShell>;
}
