import Link from "next/link";
import { LogOut, ExternalLink, Plus, AlertTriangle } from "lucide-react";
import { WorkspaceSurface, ModeControl } from "@/components/workspace-surface";
import { PlatformBrand } from "@/components/platform-brand";
import { WorkspaceFrame } from "./workspace-frame";
import brand from "@/lib/brand";
import { requireAdmin, checked } from "@/lib/db";
import { canManageNotifications, canSeeOverview } from "@/lib/team";
import { getStoreBilling } from "@/lib/billing-data";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { merchantStorefrontUrl } from "@/lib/tenant";
import { LanguageToggle } from "@/components/language-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LogoutForm } from "@/components/auth-session";
import Navigation from "./nav";
import { AdminStoreSwitcher } from "./store-switcher";
import { AdminGuidedTour, AdminTourTrigger } from "./guided-tour";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [{ db, user, storeId, activeStore, managedStores, isSuperAdmin, permissions }, lang] =
    await Promise.all([requireAdmin(), getServerLang()]);
  const isEn = lang === "en";
  const [settingsRes, pendingReturnsRes, openAbandonedRes, liveUrl, billing] = await Promise.all([
    db
      .from("store_settings")
      .select("store_id,store_name")
      .eq("store_id", storeId)
      .single<{ store_id?: string | null; store_name: string }>(),
    permissions.manage_orders ? db
      .from("return_requests")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "pending") : null,
    permissions.manage_customers ? db
      .from("abandoned_carts")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "open") : null,
    merchantStorefrontUrl(activeStore.slug),
    permissions.manage_billing ? getStoreBilling(storeId).catch(() => null) : null,
  ]);
  const settings = checked(settingsRes);
  const pendingReturnsCount = pendingReturnsRes?.error
    ? 0
    : (pendingReturnsRes?.count ?? 0);
  const openAbandonedCartsCount = openAbandonedRes?.error
    ? 0
    : (openAbandonedRes?.count ?? 0);
  const storeTitle =
    localizedText(lang, settings.store_name || activeStore.name_ar, activeStore.name_en) ||
    brand.storeName;

  const sidebar = <>
    <Link className="ws-wordmark" href="/admin" aria-label="WhiteLabelCommerce"><PlatformBrand /></Link>
    <Navigation permissions={permissions} isSuperAdmin={isSuperAdmin} mobileAppUnlocked={activeStore.mobile_app_unlocked !== false}
      pendingReturnsCount={pendingReturnsCount} openAbandonedCartsCount={openAbandonedCartsCount} />
    <div className="ws-sidebar-foot">
      {(managedStores.length > 1 || isSuperAdmin) && <Link href="/create-store"><Plus size={16}/>{isEn ? "Create store" : "إنشاء متجر"}</Link>}
      {user.email && <bdi dir="ltr" title={user.email}>{user.email}</bdi>}
      <LogoutForm><LogOut size={16} />{t(lang, "navLogout")}</LogoutForm>
    </div></>;
  return <WorkspaceSurface><WorkspaceFrame sidebar={sidebar} store={<AdminStoreSwitcher title={storeTitle}
    planName={billing ? localizedText(lang, billing.plan.name_ar, billing.plan.name_en) : null} activeStore={activeStore}
    managedStores={managedStores} isSuperAdmin={isSuperAdmin} />} tools={<>
      <Link href={liveUrl} className="ws-view-store" target="_blank" rel="noreferrer" aria-label={isEn ? "View storefront" : "معاينة المتجر"}>
        <ExternalLink size={16} /><span>{isEn ? "View storefront" : "معاينة المتجر"}</span></Link>
      {canSeeOverview(permissions) && <AdminTourTrigger storeId={storeId} />}
      {canManageNotifications(permissions) && <NotificationBell storeId={storeId} userId={user.id} scope="admin" />}
      <ModeControl /><LanguageToggle className="pt-lang" />
    </>}>
      {canSeeOverview(permissions) && <AdminGuidedTour storeId={storeId} />}
      {activeStore.status === "suspended" && <div role="alert" className="ws-suspension"><AlertTriangle size={18} />
        {isEn ? "This store is suspended. Customers can place orders once platform administration reactivates it."
          : "هذا المتجر موقوف. يمكن للعملاء الطلب مجدداً بعد أن تعيد إدارة المنصة تفعيله."}</div>}
      {children}
  </WorkspaceFrame></WorkspaceSurface>;
}
