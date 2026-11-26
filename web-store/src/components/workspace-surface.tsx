import { cookies } from "next/headers";
import { cache, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getPublishedTheme } from "@/lib/platform-theme-data";
import { getServerLang } from "@/lib/i18n-server";
import { parseWorkspaceMode, resolveWorkspaceTokens, workspaceModeCookie } from "@/lib/workspace-theme";
import { PlatformBrand } from "./platform-brand";
import { LanguageToggle } from "./language-provider";
import { WorkspaceModeToggle } from "./workspace-mode-toggle";
import "./platform-theme.css";
import "./workspace.css";

const readMode = cache(async () => parseWorkspaceMode((await cookies()).get(workspaceModeCookie)?.value));

export async function WorkspaceSurface({ children }: { children: ReactNode }) {
  const [theme, mode] = await Promise.all([getPublishedTheme(), readMode()]);
  return <div className="pt-shell ws-surface" data-mode={mode} data-motion={theme.motion_enabled ? "on" : "off"}
    style={{ ...resolveWorkspaceTokens(theme, mode), colorScheme: mode } as CSSProperties}>{children}</div>;
}

export async function ModeControl() {
  return <WorkspaceModeToggle mode={await readMode()} />;
}

export async function PlatformModeBar() {
  const en = (await getServerLang()) === "en";
  return <div className="ws-platform-mode"><ShieldCheck size={16} />
    {en ? "Platform Super-Admin Mode" : "وضع إدارة المنصة"}</div>;
}

export function AuthShell({ children, wide = false, account }: { children: ReactNode; wide?: boolean; account?: string }) {
  return <WorkspaceSurface><main className="ws-auth">
    <header className="ws-auth-bar"><Link href="/" aria-label="WhiteLabelCommerce"><PlatformBrand /></Link>
      <div>{account && <bdi dir="ltr">{account}</bdi>}<LanguageToggle className="pt-lang" /></div></header>
    <section className={wide ? "ws-auth-card ws-auth-wide" : "ws-auth-card"}>{children}</section>
  </main></WorkspaceSurface>;
}
