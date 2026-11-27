import { TenantAuthShell } from "@/components/shop/tenant-auth-shell";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";
import { storeHref } from "@/lib/tenant-shared";
import { settings } from "@/lib/shop";
import { safeAuthNext } from "@/lib/auth-flow";
import { getServerLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export default async function Register({ searchParams }: PageProps<"/register">) {
  const [query, store] = await Promise.all([searchParams, settings()]);
  const lang = await getServerLang(store.uiConfig.defaultLanguage);
  return <TenantAuthShell><div className="auth-heading"><h1>{t(lang, "registerHeading")}</h1></div>
    <HybridAuthPanel basePath={store.basePath} nextPath={safeAuthNext(query.next, store.basePath, store.slug) || storeHref(store.basePath, "/account")}
      initialSignup initialOtp={query.method === "otp"}
      initialError={typeof query.error === "string" ? query.error : ""} />
  </TenantAuthShell>;
}
