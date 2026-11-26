import Link from "next/link";
import { requireSuperAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { WorkspaceSurface, PlatformModeBar, ModeControl } from "@/components/workspace-surface";
import { PlatformBrand } from "@/components/platform-brand";
import { LanguageToggle } from "@/components/language-provider";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  const en = (await getServerLang()) === "en";
  return <WorkspaceSurface><PlatformModeBar /><header className="ws-super-header">
    <Link href="/super-admin" aria-label={en ? "Platform controls" : "إدارة المنصة"}><PlatformBrand /></Link>
    <div className="ws-tools"><ModeControl /><LanguageToggle className="pt-lang" /></div>
  </header><div className="ws-super-content">{children}</div></WorkspaceSurface>;
}
