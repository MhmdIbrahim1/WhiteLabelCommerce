"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, Boxes, ClipboardList, CreditCard, Globe, LayoutDashboard, Lock, Megaphone, MessagesSquare, Palette,
  RotateCcw, Settings, ShieldCheck, ShoppingCart, Smartphone, Star, TicketPercent, Users, UsersRound } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { canOpenAdmin, type Permissions } from "@/lib/team";
import type { DictKey } from "@/lib/i18n";

type Entry = { url: string; key: DictKey; icon: typeof Boxes; tour?: string };
const groups: { en: string; ar: string; items: Entry[] }[] = [
  { en: "Overview", ar: "نظرة عامة", items: [
    { url: "/admin", key: "adminOverview", icon: LayoutDashboard },
  ] },
  { en: "Catalog & orders", ar: "الكتالوج والطلبات", items: [
    { url: "/admin/products", key: "adminProducts", icon: Boxes, tour: "nav-products" },
    { url: "/admin/orders", key: "adminOrders", icon: ClipboardList, tour: "nav-orders" },
    { url: "/admin/returns", key: "adminReturns", icon: RotateCcw },
    { url: "/admin/abandoned-carts", key: "adminAbandonedCarts", icon: ShoppingCart },
    { url: "/admin/customers", key: "adminCustomers", icon: Users, tour: "nav-customers" },
    { url: "/admin/reviews", key: "adminReviews", icon: Star },
    { url: "/admin/coupons", key: "adminCoupons", icon: TicketPercent },
    { url: "/admin/tickets", key: "adminTickets", icon: MessagesSquare },
  ] },
  { en: "Storefront & app", ar: "الواجهة والتطبيق", items: [
    { url: "/admin/customizer", key: "adminCustomizer", icon: Palette, tour: "nav-customizer" },
    { url: "/admin/mobile-app", key: "adminMobileApp", icon: Smartphone },
    { url: "/admin/settings/domains", key: "adminDomains", icon: Globe },
    { url: "/admin/marketing", key: "adminMarketing", icon: Megaphone },
    { url: "/admin/notifications", key: "adminNotifications", icon: BellRing },
  ] },
  { en: "Organization & billing", ar: "الإدارة والفوترة", items: [
    { url: "/admin/team", key: "adminTeam", icon: UsersRound },
    { url: "/admin/billing", key: "adminBilling", icon: CreditCard },
    { url: "/admin/settings", key: "adminSettings", icon: Settings, tour: "nav-settings" },
  ] },
];

function matches(path: string, url: string) {
  return path === url || (url !== "/admin" && url !== "/admin/settings" && path.startsWith(url + "/"));
}

export function AdminPageTitle() {
  const path = usePathname();
  const { lang, t } = useLanguage();
  const item = groups.flatMap(g => g.items).find(i => matches(path, i.url));
  if (path.startsWith("/admin/orders/")) return lang === "en" ? "Order details" : "تفاصيل الطلب";
  if (path === "/admin/restricted") return lang === "en" ? "Access restricted" : "الصلاحيات";
  return item ? t(item.key) : lang === "en" ? "Workspace" : "لوحة المتجر";
}

export default function Navigation({ permissions, isSuperAdmin, mobileAppUnlocked, pendingReturnsCount, openAbandonedCartsCount }: {
  permissions: Permissions; isSuperAdmin: boolean; mobileAppUnlocked: boolean; pendingReturnsCount: number; openAbandonedCartsCount: number;
}) {
  const path = usePathname();
  const { lang, t } = useLanguage();
  const en = lang === "en";
  return <nav className="ws-nav" aria-label={en ? "Workspace navigation" : "التنقّل في لوحة المتجر"}>
    {groups.map(group => {
      const visible = group.items.filter(item => canOpenAdmin(item.url, permissions));
      if (!visible.length) return null;
      return <section key={group.en}><h2>{group[lang]}</h2>
        {visible.map(({ url, key, icon: Icon, tour }) => {
          const count = url === "/admin/returns" ? pendingReturnsCount : url === "/admin/abandoned-carts" ? openAbandonedCartsCount : 0;
          return <Link key={url} href={url} data-tour={tour} aria-current={matches(path, url) ? "page" : undefined}>
            <Icon size={17} /><span>{t(key)}</span>
            {count > 0 && <bdi dir="ltr" className="ws-count">{count.toLocaleString(en ? "en" : "ar-EG")}</bdi>}
            {url === "/admin/mobile-app" && !mobileAppUnlocked && <small><Lock size={11} />{en ? "Paused" : "متوقف"}</small>}
          </Link>;
        })}
      </section>;
    })}
    {isSuperAdmin && <Link className="ws-platform-link" href="/super-admin"><ShieldCheck size={17} />{en ? "Platform controls" : "إدارة المنصة"}</Link>}
  </nav>;
}
