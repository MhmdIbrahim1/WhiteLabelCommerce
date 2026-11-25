"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  ClipboardList,
  Users,
  TicketPercent,
  MessagesSquare,
  BellRing,
  Palette,
  Settings,
  ShieldCheck,
  Smartphone,
  Lock,
  Star,
  RotateCcw,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { DictKey } from "@/lib/i18n";

const sections: {
  url: string;
  key: DictKey;
  icon: typeof LayoutDashboard;
  tourId?: string;
  isMobileApp?: boolean;
  isReturns?: boolean;
}[] = [
  { url: "/admin", key: "adminOverview", icon: LayoutDashboard },
  { url: "/admin/products", key: "adminProducts", icon: Boxes, tourId: "nav-products" },
  { url: "/admin/orders", key: "adminOrders", icon: ClipboardList, tourId: "nav-orders" },
  { url: "/admin/returns", key: "adminReturns", icon: RotateCcw, isReturns: true },
  { url: "/admin/customers", key: "adminCustomers", icon: Users, tourId: "nav-customers" },
  { url: "/admin/reviews", key: "adminReviews", icon: Star },
  { url: "/admin/coupons", key: "adminCoupons", icon: TicketPercent },
  { url: "/admin/notifications", key: "adminNotifications", icon: BellRing },
  { url: "/admin/tickets", key: "adminTickets", icon: MessagesSquare },
  { url: "/admin/customizer", key: "adminCustomizer", icon: Palette, tourId: "nav-customizer" },
  { url: "/admin/mobile-app", key: "adminMobileApp", icon: Smartphone, isMobileApp: true },
  { url: "/admin/settings", key: "adminSettings", icon: Settings, tourId: "nav-settings" },
];

export default function Navigation({
  isSuperAdmin = false,
  mobileAppUnlocked = true,
  pendingReturnsCount = 0,
}: {
  isSuperAdmin?: boolean;
  mobileAppUnlocked?: boolean;
  pendingReturnsCount?: number;
}) {
  const path = usePathname();
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  return (
    <nav aria-label="Admin navigation">
      {sections.map(({ url, key, icon: Icon, tourId, isMobileApp, isReturns }) => {
        const active =
          path === url || (url !== "/admin" && path.startsWith(url + "/"));
        return (
          <Link
            key={url}
            href={url}
            data-tour={tourId}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} />
            <span style={{ flex: 1 }}>{t(key)}</span>
            {isReturns && pendingReturnsCount > 0 && (
              <span
                aria-label={
                  isEn
                    ? `${pendingReturnsCount} pending returns`
                    : `${pendingReturnsCount} طلبات إرجاع قيد المراجعة`
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "1.35rem",
                  height: "1.35rem",
                  padding: "0 0.4rem",
                  borderRadius: "999px",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  background: "#f59e0b",
                  color: "#111827",
                }}
              >
                {pendingReturnsCount}
              </span>
            )}
            {isMobileApp && !mobileAppUnlocked && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.2rem",
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  padding: "0.12rem 0.42rem",
                  borderRadius: "999px",
                  background: "rgba(251, 191, 36, 0.2)",
                  color: "#fde68a",
                  border: "1px solid rgba(251, 191, 36, 0.38)",
                }}
              >
                <Lock size={10} />
                PRO
              </span>
            )}
          </Link>
        );
      })}
      {isSuperAdmin && (
        <Link
          href="/super-admin"
          aria-current={path.startsWith("/super-admin") ? "page" : undefined}
          style={{
            marginTop: "0.45rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.22)",
            paddingTop: "0.7rem",
            color: "#fde68a",
          }}
        >
          <ShieldCheck size={19} />
          {isEn ? "Super Admin" : "إدارة المنصة"}
        </Link>
      )}
    </nav>
  );
}
