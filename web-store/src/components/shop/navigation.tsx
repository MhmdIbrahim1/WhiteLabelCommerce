"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowRight, Bell, ClipboardList, Grid2X2, Headphones, Heart, House, LogIn, LogOut,
  Menu, Moon, PlusCircle, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Sun, UserRound, Zap,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { storeHref } from "@/lib/tenant-shared";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { useCart } from "./cart-store";
import { CartDrawerContents } from "./cart-drawer";
import { ShopDrawer } from "./shop-drawer";
import { StoreSearch } from "./store-search";
import { useWishlist } from "./wishlist-provider";

type Props = {
  preview?: boolean;
  name: string; logo?: string; storeId: string; storeSlug: string; basePath: string; currency: string; hasFeatured: boolean;
  admin: boolean; superAdmin: boolean; user: { id: string; email: string; name: string } | null;
};
type Drawer = "menu" | "search" | "cart";

export function Navigation(props: Props) {
  const pathname = usePathname();
  return <StoreHeader key={props.storeId + pathname} {...props} pathname={pathname}/>;
}

function StoreHeader({ name, logo, storeId, storeSlug, basePath, currency, user, admin, superAdmin, hasFeatured, pathname, preview }: Props & { pathname: string }) {
  const { lang, t } = useLanguage();
  const en = lang === "en";
  const href = (path: string) => storeHref(basePath, path);
  const count = useCart().reduce((total, line) => total + line.quantity, 0);
  const wishlist = useWishlist();
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open = (kind: Drawer, button: HTMLButtonElement) => { trigger.current = button; setDrawer(kind); };
  const close = () => setDrawer(null);
  const loginHref = basePath + "/login?next=" + encodeURIComponent(href(pathname));
  const menu = en ? "Store menu" : "قائمة المتجر";
  const mark = storefrontImageSrc(logo, 128);
  const sections = [
    { path: "/", label: t("navHome"), icon: House },
    { path: "/products", label: t("footerAllProducts"), icon: Grid2X2 },
    { path: "/products?flash=1", label: en ? "Flash deals" : "العروض المؤقتة", icon: Zap },
    { path: "/wishlist", label: t("navWishlist"), icon: Heart },
    { path: "/orders", label: t("navOrders"), icon: ClipboardList },
    { path: "/contact", label: t("footerContact"), icon: Headphones },
  ];
  const desktop = [
    { path: "/products", label: t("footerAllProducts") },
    ...(hasFeatured ? [{ path: "/#latest", label: t("navLatest") }] : []),
    { path: "/orders", label: t("navOrders") },
  ];
  return <>
    <a className="sf-skip" href="#store-content">{en ? "Skip to content" : "انتقل إلى المحتوى"}</a>
    <header className="shop-head sf-head"><div className="sf-bar">
      <Link href={href("/")} className="sf-wordmark">
        {mark ? <Image src={mark} width={36} height={36} unoptimized alt=""/> :
          <span className="sf-monogram" aria-hidden="true">{Array.from(name.trim())[0]}</span>}
        <span dir="auto">{name}</span>
      </Link>
      <nav className="sf-desktop-nav" aria-label={en ? "Store navigation" : "التنقّل في المتجر"}>
        {desktop.map(item => <Link key={item.path} href={href(item.path)}
          aria-current={pathname === href(item.path) ? "page" : undefined}>{item.label}</Link>)}
      </nav>
      <div className="sf-nav-tools">
        <button type="button" className="sf-icon" aria-label={t("navSearchAria")} aria-haspopup="dialog" onClick={e => open("search", e.currentTarget)}><Search size={20}/></button>
        <LanguageToggle className="sf-language sf-header-lang"/>
        {preview ? <button type="button" className="notif-bell-btn" disabled aria-label={t("notifTitle")}><Bell size={18}/></button>
          : <NotificationBell storeId={storeId} userId={user?.id ?? null} scope="customer" basePath={basePath}/>}
        <button type="button" className="sf-cart-trigger" aria-label={t("navCart") + " · " + count} aria-haspopup="dialog"
          aria-expanded={drawer === "cart"} onClick={e => open("cart", e.currentTarget)}>
          <ShoppingBag size={19}/><bdi dir="ltr" aria-live="polite" aria-atomic="true">{count.toLocaleString(lang)}</bdi>
        </button>
        <button type="button" className="sf-icon" aria-label={menu} aria-haspopup="dialog" aria-expanded={drawer === "menu"} onClick={e => open("menu", e.currentTarget)}><Menu size={21}/></button>
      </div>
    </div></header>
    {drawer && <ShopDrawer key={drawer} title={drawer === "cart" ? t("navCart") : drawer === "search" ? t("navSearch") : menu}
      triggerRef={trigger} close={close}>
      {drawer === "search" && <StoreSearch storeId={storeId} storeSlug={storeSlug} basePath={basePath} close={close}/>}
      {drawer === "cart" && <CartDrawerContents currency={currency} basePath={basePath} close={close}/>}
      {drawer === "menu" && <div className="sf-drawer-scroll sf-menu">
        <nav aria-label={menu}>{sections.map(({ path, label, icon: Icon }) =>
          <Link key={path} href={href(path)} onClick={close}><Icon size={18}/>{label}
            {path === "/wishlist" && wishlist.count > 0 && <bdi dir="ltr">{wishlist.count.toLocaleString(lang)}</bdi>}
          </Link>)}</nav>
        <nav aria-label={t("navAccount")}>
          {user ? <Link href={href("/account")} onClick={close}><UserRound size={18}/><span>{user.name}<small><bdi dir="ltr">{user.email}</bdi></small></span></Link>
            : <Link href={loginHref} onClick={close}><LogIn size={18}/>{t("navLogin")}<ArrowRight className="sf-forward" size={16}/></Link>}
          {user && <Link href="/create-store" onClick={close}><PlusCircle size={18}/>{en ? "Create store" : "إنشاء متجر"}</Link>}
          {admin && <Link href="/admin" onClick={close}><SlidersHorizontal size={18}/>{t("footerAdmin")}</Link>}
          {superAdmin && <Link href="/super-admin" onClick={close}><ShieldCheck size={18}/>{en ? "Platform administration" : "إدارة المنصة"}</Link>}
          {user && <form action={logout}><button type="submit"><LogOut size={18}/>{t("navLogout")}</button></form>}
        </nav>
        <div className="sf-menu-prefs"><LanguageToggle className="sf-language"/>
          <button type="button" className="theme-btn" onClick={event => {
            const root = event.currentTarget.closest<HTMLElement>("[data-storefront-mode]");
            if (!root) return;
            const mode = root.dataset.shopTheme === "dark" ? "light" : "dark";
            root.dataset.shopTheme = mode;
            document.cookie = "shop_theme=" + mode + "; path=/; max-age=31536000; SameSite=Lax";
            try { localStorage.setItem("shop.theme", mode); } catch {}
          }}><Sun className="light-icon" size={16}/><Moon className="dark-icon" size={16}/>{t("navThemeToggle")}</button>
        </div>
      </div>}
    </ShopDrawer>}
  </>;
}
