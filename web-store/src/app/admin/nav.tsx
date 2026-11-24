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
  Palette,
  Settings,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { DictKey } from "@/lib/i18n";

const sections: { url: string; key: DictKey; icon: typeof LayoutDashboard }[] = [
  { url: "/admin", key: "adminOverview", icon: LayoutDashboard },
  { url: "/admin/products", key: "adminProducts", icon: Boxes },
  { url: "/admin/orders", key: "adminOrders", icon: ClipboardList },
  { url: "/admin/customers", key: "adminCustomers", icon: Users },
  { url: "/admin/coupons", key: "adminCoupons", icon: TicketPercent },
  { url: "/admin/tickets", key: "adminTickets", icon: MessagesSquare },
  { url: "/admin/customizer", key: "adminCustomizer", icon: Palette },
  { url: "/admin/settings", key: "adminSettings", icon: Settings },
];

export default function Navigation() {
  const path = usePathname();
  const { t } = useLanguage();
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
    </nav>
  );
}
