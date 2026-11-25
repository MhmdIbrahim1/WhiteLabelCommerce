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
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { DictKey } from "@/lib/i18n";

const sections: { url: string; key: DictKey; icon: typeof LayoutDashboard }[] = [
  { url: "/admin", key: "adminOverview", icon: LayoutDashboard },
  { url: "/admin/products", key: "adminProducts", icon: Boxes },
  { url: "/admin/orders", key: "adminOrders", icon: ClipboardList },
  { url: "/admin/customers", key: "adminCustomers", icon: Users },
  { url: "/admin/coupons", key: "adminCoupons", icon: TicketPercent },
  { url: "/admin/notifications", key: "adminNotifications", icon: BellRing },
  { url: "/admin/tickets", key: "adminTickets", icon: MessagesSquare },
  { url: "/admin/customizer", key: "adminCustomizer", icon: Palette },
  { url: "/admin/settings", key: "adminSettings", icon: Settings },
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
      {sections.map(({ url, key, icon: Icon }) => {
        const active =
          path === url || (url !== "/admin" && path.startsWith(url + "/"));
        return (
          <Link key={url} href={url} aria-current={active ? "page" : undefined}>
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
