import { Store, LogOut, PanelTop, UserRound } from "lucide-react";
import brand from "@/lib/brand";
import { requireAdmin, checked } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { LanguageToggle } from "@/components/language-provider";
import { logout } from "../login/actions";
import Navigation from "./nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [{ db, user }, lang] = await Promise.all([
    requireAdmin(),
    getServerLang(),
  ]);
  const settings = checked(
    await db
      .from("store_settings")
      .select("store_name")
      .eq("id", true)
      .single<{ store_name: string }>(),
  );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="mark">
            <Store />
          </span>
          <b dir="auto">{brand.storeName}</b>
        </div>
        <Navigation />
        <form action={logout} className="logout">
          <button>
            <LogOut size={18} /> {t(lang, "navLogout")}
          </button>
        </form>
      </aside>
      <div className="workspace">
        <header className="top">
          <span>
            <PanelTop size={17} /> {settings.store_name || brand.storeName}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
            <LanguageToggle className="lang-toggle-pill" />
            <span dir="ltr">
              <UserRound size={16} />
              {user.email}
            </span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
