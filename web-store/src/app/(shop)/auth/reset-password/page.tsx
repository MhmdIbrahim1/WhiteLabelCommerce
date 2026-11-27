import { TenantAuthShell } from "@/components/shop/tenant-auth-shell";
import { RecoveryPanel } from "@/components/shop/recovery-panel";
import { settings } from "@/lib/shop";
import { getServerLang } from "@/lib/i18n-server";

export const metadata = { referrer: "no-referrer" as const, robots: { index: false, follow: false } };

export default async function Reset({ searchParams }: PageProps<"/auth/reset-password">) {
  const [query, store] = await Promise.all([searchParams, settings()]);
  const en = (await getServerLang(store.uiConfig.defaultLanguage)) === "en";
  return <TenantAuthShell><RecoveryPanel query={query} basePath={store.basePath} en={en} /></TenantAuthShell>;
}
