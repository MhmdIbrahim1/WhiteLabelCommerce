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
  Star,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { DictKey } from "@/lib/i18n";

const sections: {
  url: string;
  key: DictKey;
  icon: typeof LayoutDashboard;
  tourId?: string;
}[] = [
  { url: "/admin", key: "adminOverview", icon: LayoutDashboard },
  { url: "/admin/products", key: "adminProducts", icon: Boxes, tourId: "nav-products" },
  { url: "/admin/orders", key: "adminOrders", icon: ClipboardList, tourId: "nav-orders" },
  { url: "/admin/customers", key: "adminCustomers", icon: Users, tourId: "nav-customers" },
  { url: "/admin/reviews", key: "adminReviews", icon: Star },
  { url: "/admin/coupons", key: "adminCoupons", icon: TicketPercent },
  { url: "/admin/notifications", key: "adminNotifications", icon: BellRing },
  { url: "/admin/tickets", key: "adminTickets", icon: MessagesSquare },
  { url: "/admin/customizer", key: "adminCustomizer", icon: Palette, tourId: "nav-customizer" },
  { url: "/admin/settings", key: "adminSettings", icon: Settings, tourId: "nav-settings" },
];

export default function Navigation({
  isSuperAdmin = false,
}: {
  isSuperAdmin?: boolean;
}) {
  const path = usePathname();
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  return (
    <nav aria-label="Admin navigation">
      {sections.map(({ url, key, icon: Icon, tourId }) => {
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
            {t(key)}
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
