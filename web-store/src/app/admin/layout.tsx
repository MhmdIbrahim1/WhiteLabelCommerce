import { LogOut, PanelTop, UserRound, AlertTriangle } from "lucide-react";
import brand from "@/lib/brand";
import { requireAdmin, checked } from "@/lib/db";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { LanguageToggle } from "@/components/language-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { logout } from "../login/actions";
import Navigation from "./nav";
import { AdminStoreSwitcher } from "./store-switcher";
import { AdminGuidedTour, AdminTourTrigger } from "./guided-tour";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [{ db, user, storeId, activeStore, managedStores, isSuperAdmin }, lang] =
    await Promise.all([requireAdmin(), getServerLang()]);
  const isEn = lang === "en";
  const [settingsRes, pendingReturnsRes] = await Promise.all([
    db
      .from("store_settings")
      .select("store_id,store_name")
      .eq("store_id", storeId)
      .single<{ store_id?: string | null; store_name: string }>(),
    db
      .from("return_requests")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "pending"),
  ]);
  const settings = checked(settingsRes);
  const pendingReturnsCount = pendingReturnsRes.error
    ? 0
    : (pendingReturnsRes.count ?? 0);
  const storeTitle =
    localizedText(lang, settings.store_name || activeStore.name_ar, activeStore.name_en) ||
    brand.storeName;

  return (
    <div className="shell">
      <aside>
        <AdminStoreSwitcher
          activeStore={activeStore}
          managedStores={managedStores}
          isSuperAdmin={isSuperAdmin}
        />
        <Navigation
          isSuperAdmin={isSuperAdmin}
          mobileAppUnlocked={activeStore.mobile_app_unlocked !== false}
          pendingReturnsCount={pendingReturnsCount}
        />
        <form action={logout} className="logout">
          <button>
            <LogOut size={18} /> {t(lang, "navLogout")}
          </button>
        </form>
      </aside>
      <div className="workspace">
        <header className="top">
          <span>
            <PanelTop size={17} /> {storeTitle}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", flexWrap: "wrap" }}>
            <AdminTourTrigger storeId={storeId} />
            <NotificationBell storeId={storeId} userId={user.id} scope="admin" />
            <LanguageToggle className="lang-toggle-pill" />
            <span dir="ltr">
              <UserRound size={16} />
              {user.email}
            </span>
          </div>
        </header>
        <AdminGuidedTour storeId={storeId} />
        <main className="content">
          {activeStore.status === "suspended" && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                marginBottom: "1rem",
                borderRadius: "12px",
                border: "1px solid #f59e0b",
                background: "#fffbeb",
                color: "#92400e",
                fontSize: "0.9rem",
                fontWeight: 600,
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span>
                {isEn
                  ? "This store is currently suspended. Its public storefront is offline and customers cannot place orders until reactivated by platform administration."
                  : "هذا المتجر موقوف حالياً. الواجهة العامة للمتجر غير متاحة للعملاء ولا يمكن استقبال طلبات جديدة حتى إعادة التفعيل من إدارة المنصة."}
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
