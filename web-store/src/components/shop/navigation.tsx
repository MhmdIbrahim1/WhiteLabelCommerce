"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ShoppingBag,
  House,
  Grid2X2,
  ClipboardList,
  Moon,
  Sun,
  Store,
  X,
  SlidersHorizontal,
  Package,
  ArrowLeft,
  ArrowRight,
  UserRound,
  LogOut,
  LogIn,
  ChevronDown,
  Sparkles,
  Tag,
  ShieldCheck,
  PlusCircle,
  Heart,
  Menu,
  Headphones,
  Zap,
  Check,
} from "lucide-react";
import { money } from "@/lib/brand";
import { localizedText } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import {
  getCachedSearchHits,
  searchCatalogCached,
  type SmartSearchHit,
} from "@/lib/smart-search";
import { getInstantSearchHints } from "@/lib/searchSynonyms";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { logout } from "@/app/login/actions";
import { SearchCorrection } from "./search-correction";
import { useCart } from "./cart-store";
import { useWishlist } from "./wishlist-provider";

export function Navigation({
  name,
  storeId,
  storeSlug,
  basePath = "",
  admin = false,
  superAdmin = false,
  user = null,
}: {
  name: string;
  storeId: string;
  storeSlug: string;
  basePath?: string;
  admin?: boolean;
  superAdmin?: boolean;
  user?: { id?: string; email: string; name: string } | null;
}) {
  const pathname = usePathname();
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const href = (path: string) => storeHref(basePath, path);
  const tenantReturnPath =
    pathname.startsWith("/") && !pathname.startsWith("//")
      ? pathname
      : href("/");
  const loginHref = `/login?next=${encodeURIComponent(tenantReturnPath)}`;
  const ArrowIcon = lang === "en" ? ArrowRight : ArrowLeft;
  const count = useCart().reduce((a, l) => a + l.quantity, 0);
  const { count: wishlistCount, isSignedIn: wishlistSignedIn } = useWishlist();
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SmartSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  const toggleTheme = () => {
    const next =
      document.documentElement.dataset.shopTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.shopTheme = next;
    localStorage.setItem("shop.theme", next);
  };

  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [userMenuOpen]);

  useEffect(() => {
    const theme = localStorage.getItem("shop.theme");
    const active = theme
      ? theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.shopTheme = active ? "dark" : "light";
  }, []);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setHits([]);
        setHasSearched(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
        setHits([]);
        setHasSearched(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [searchOpen]);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2 || getCachedSearchHits(storeId, trimmed) !== null) return;

    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const nextHits = await searchCatalogCached(
          storeId, storeSlug, trimmed,
          ac.signal,
        );
        if (!ac.signal.aborted) {
          setHits(nextHits);
          setHasSearched(true);
        }
      } catch {
        // Ignore aborted or transient errors cleanly
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q, storeId, storeSlug]);

  const trimmedQuery = q.trim();
  const instantHints = useMemo(
    () =>
      searchOpen && trimmedQuery.length >= 2
        ? getInstantSearchHints(trimmedQuery, lang, 3)
        : [],
    [searchOpen, trimmedQuery, lang],
  );

  const showDropdown =
    searchOpen &&
    trimmedQuery.length >= 2 &&
    (searching || hasSearched || instantHints.length > 0);
  const hasDirectHit = hits.some(
    (h) => h.match_type === "exact" || h.match_type === "synonym",
  );
  const hasSpecHit = hits.some((h) => h.match_type === "spec");
  const correction = hits[0]?.was_auto_corrected ? hits[0] : null;
  const showSmartBanner = hits.length > 0 && !correction && !hasDirectHit;
  function exactHref(original: string) {
    const params = new URLSearchParams(pathname.endsWith("/products") ? window.location.search : "");
    params.set("q", original);
    params.set("exact", "1");
    params.delete("page");
    return href(`/products?${params}`);
  }

  const desktopLinks = [
    {
      href: href("/"),
      label: t("navHome"),
      match: pathname === "/" || (Boolean(basePath) && pathname === basePath),
    },
    {
      href: href("/products"),
      label: t("navCategories"),
      match:
        pathname === "/products" ||
        pathname.startsWith("/products/") ||
        (Boolean(basePath) &&
          (pathname === `${basePath}/products` ||
            pathname.startsWith(`${basePath}/products/`))),
    },
    { href: href("/#latest"), label: t("navLatest"), match: false },
    {
      href: href("/orders"),
      label: t("navOrders"),
      match:
        pathname === "/orders" ||
        (Boolean(basePath) && pathname === `${basePath}/orders`),
    },
  ];

  const mobileNav = [
    { href: href("/"), label: t("navHome"), Icon: House },
    { href: href("/products"), label: t("navCategories"), Icon: Grid2X2 },
    { href: href("/cart"), label: t("navCart"), Icon: ShoppingBag },
    { href: href("/orders"), label: t("navOrders"), Icon: ClipboardList },
  ];

  return (
    <>
      <header className="shop-head">
        <div className="bar">
          <div className="bar-start">
            <Link href={href("/")} className="wordmark">
              <span className="wordmark-badge" aria-hidden="true">
                <Store size={17} />
              </span>
              <span>{name}</span>
            </Link>
          </div>

          <nav className="desk" aria-label={t("navHome")}>
            {desktopLinks.map(({ href: linkHref, label, match }) => (
              <Link
                key={linkHref}
                href={linkHref}
                className="nav-link"
                aria-current={match ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="bar-end">
            <div
              ref={searchBoxRef}
              className={`search-pill-wrap ${searchOpen ? "is-open" : ""}`}
            >
              {searchOpen ? (
                <form action={href("/products")} className="search-pill-form">
                  <Search size={16} className="search-pill-icon" />
                  <input
                    ref={searchInputRef}
                    name="q"
                    type="search"
                    aria-label={t("navSearchAria")}
                    placeholder={t("navSearchPlaceholder")}
                    value={q}
                    onChange={(e) => {
                      const next = e.target.value;
                      setQ(next);
                      const trimmed = next.trim();
                      if (trimmed.length < 2) {
                        setHits([]);
                        setHasSearched(false);
                        setSearching(false);
                        return;
                      }
                      const cached = getCachedSearchHits(storeId, trimmed);
                      if (cached !== null) {
                        setHits(cached);
                        setHasSearched(true);
                        setSearching(false);
                      } else {
                        setHits([]);
                        setHasSearched(false);
                        setSearching(true);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="icon-ghost-btn search-close-btn"
                    aria-label={t("navSearchClose")}
                    onClick={() => {
                      setSearchOpen(false);
                      setQ("");
                      setHits([]);
                      setHasSearched(false);
                      setSearching(false);
                    }}
                  >
                    <X size={15} />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="search-trigger-pill"
                  aria-label={t("navSearchAria")}
                  onClick={() => setSearchOpen(true)}
                >
                  <Search size={16} />
                  <span className="search-trigger-label">{t("navSearch")}</span>
                </button>
              )}

              {showDropdown && (
                <div
                  className="suggest"
                  role="listbox"
                  aria-label={t("navSearch")}
                >
                  <div className="suggest-quick-filters">
                    <Link
                      href={href(
                        `/products?q=${encodeURIComponent(trimmedQuery)}&flash=1`,
                      )}
                      className="suggest-hint-chip is-flash"
                      onClick={() => {
                        setSearchOpen(false);
                        setHasSearched(false);
                      }}
                    >
                      <Zap size={11} aria-hidden="true" />
                      <span>{isEn ? "Flash Deals" : "عروض مؤقتة"}</span>
                    </Link>
                    <Link
                      href={href(
                        `/products?q=${encodeURIComponent(trimmedQuery)}&in_stock=1`,
                      )}
                      className="suggest-hint-chip"
                      onClick={() => {
                        setSearchOpen(false);
                        setHasSearched(false);
                      }}
                    >
                      <Check size={11} aria-hidden="true" />
                      <span>{isEn ? "In Stock" : "متوفر فقط"}</span>
                    </Link>
                  </div>
                  {instantHints.length > 0 && (
                    <div
                      className="suggest-hints"
                      aria-label={t("searchInstantHints")}
                    >
                      <span className="suggest-hints-label">
                        <Tag size={12} aria-hidden="true" />
                        {t("searchInstantHints")}
                      </span>
                      <div className="suggest-hints-list">
                        {instantHints.map((hint) => (
                          <Link
                            key={hint.tag}
                            href={href(
                              "/products?q=" + encodeURIComponent(hint.query),
                            )}
                            className="suggest-hint-chip"
                            onClick={() => {
                              setSearchOpen(false);
                              setHasSearched(false);
                            }}
                          >
                            {hint.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {searching && hits.length === 0 ? (
                    <p className="suggest-state">{t("navSearching")}</p>
                  ) : hits.length > 0 ? (
                    <>
                      {correction?.corrected_from && (
                        <SearchCorrection compact effective={correction.effective_query} original={correction.corrected_from}
                          isEn={isEn} exactHref={exactHref(correction.corrected_from)} onNavigate={() => setSearchOpen(false)} />
                      )}
                      {showSmartBanner && (
                        <div className="suggest-banner">
                          <Sparkles size={13} aria-hidden="true" />
                          <span>
                            {hasSpecHit
                              ? t("searchSpecMatches")
                              : t("searchClosestMatches")}{" "}
                            &quot;{trimmedQuery}&quot;
                          </span>
                        </div>
                      )}
                      {hits.map((h) => {
                        const hitName = localizedText(lang, h.name, h.name_en);
                        return (
                          <Link
                            key={h.id}
                            href={href("/products/" + h.id)}
                            className="suggest-item"
                            onClick={() => {
                              setQ("");
                              setHits([]);
                              setHasSearched(false);
                              setSearchOpen(false);
                            }}
                          >
                            <span className="suggest-thumb">
                              {h.image_url ? (
                                <Image
                                  src={h.image_url}
                                  alt={hitName}
                                  width={42}
                                  height={42}
                                  unoptimized
                                />
                              ) : (
                                <Package size={18} strokeWidth={1.3} />
                              )}
                            </span>
                            <span className="suggest-meta">
                              <span className="suggest-title-row">
                                <strong>{hitName}</strong>
                                {h.match_type === "spec" && (
                                  <span className="suggest-match-pill">
                                    {t("searchMatchSpec")}
                                  </span>
                                )}
                                {h.match_type === "fuzzy" && (
                                  <span className="suggest-match-pill is-smart">
                                    {t("searchMatchSmart")}
                                  </span>
                                )}
                              </span>
                              <span className="suggest-price">
                                <b>{money(h.price, h.currency, lang)}</b>
                                {h.old_price !== null &&
                                  h.old_price > h.price && (
                                    <del>
                                      {money(h.old_price, h.currency, lang)}
                                    </del>
                                  )}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                      <Link
                        href={href("/products?q=" + encodeURIComponent(trimmedQuery))}
                        className="suggest-all-link"
                        onClick={() => {
                          setSearchOpen(false);
                          setHasSearched(false);
                        }}
                      >
                        <span>
                          {t("navSearchAll")} &quot;{trimmedQuery}&quot;
                        </span>
                        <ArrowIcon size={14} />
                      </Link>
                    </>
                  ) : hasSearched ? (
                    <p className="suggest-state">
                      {t("navSearchEmpty")} &quot;{trimmedQuery}&quot;.
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="nav-desktop-only">
              <LanguageToggle className="lang-toggle-pill" />

              {superAdmin === true && (
                <Link
                  href="/super-admin"
                  className="admin-subtle-link"
                  title={isEn ? "Super Admin" : "إدارة المنصة"}
                >
                  <ShieldCheck size={15} />
                  <span>{isEn ? "Super Admin" : "إدارة المنصة"}</span>
                </Link>
              )}

              {admin === true && (
                <Link
                  href="/admin"
                  className="admin-subtle-link"
                  title={t("footerAdmin")}
                >
                  <SlidersHorizontal size={15} />
                  <span>{t("navAdmin")}</span>
                </Link>
              )}

              {user ? (
                <div className="user-menu-wrap" ref={userMenuRef}>
                  <button
                    type="button"
                    className="user-menu-trigger"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setUserMenuOpen((v) => !v)}
                  >
                    <UserRound size={15} />
                    <span className="user-menu-name">{user.name}</span>
                    <ChevronDown size={13} />
                  </button>
                  {userMenuOpen && (
                    <div className="user-menu-dropdown" role="menu">
                      <div className="user-menu-head">
                        <strong>{user.name}</strong>
                        <small dir="ltr">{user.email}</small>
                      </div>
                      <Link
                        href={href("/account")}
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <UserRound size={15} /> {t("navAccount")}
                      </Link>
                      <Link
                        href={href("/orders")}
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <ClipboardList size={15} /> {t("navOrders")}
                      </Link>
                      <Link
                        href={href("/wishlist")}
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Heart size={15} /> {t("navWishlist")}
                        {wishlistCount > 0 && (
                          <span className="user-menu-pill-count">
                            {wishlistCount}
                          </span>
                        )}
                      </Link>
                      <Link
                        href="/create-store"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <PlusCircle size={15} />{" "}
                        {isEn ? "Create Store" : "إنشاء متجر جديد"}
                      </Link>
                      {superAdmin === true && (
                        <Link
                          href="/super-admin"
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <ShieldCheck size={15} />{" "}
                          {isEn ? "Super Admin" : "إدارة المنصة"}
                        </Link>
                      )}
                      <form action={logout} className="user-menu-logout">
                        <button type="submit" role="menuitem">
                          <LogOut size={15} /> {t("navLogout")}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href={loginHref}
                  className="login-nav-pill"
                  aria-label={t("navLogin")}
                >
                  <LogIn size={15} />
                  <span>{t("navLogin")}</span>
                </Link>
              )}

              <button
                type="button"
                className="theme-btn icon-ghost-btn"
                aria-label={t("navThemeToggle")}
                onClick={toggleTheme}
              >
                <Sun className="light-icon" size={17} />
                <Moon className="dark-icon" size={17} />
              </button>

              <Link
                href={href("/wishlist")}
                className="wishlist-nav-btn icon-ghost-btn"
                aria-label={
                  wishlistSignedIn && wishlistCount > 0
                    ? `${t("navWishlist")} · ${wishlistCount}`
                    : t("navWishlist")
                }
                title={t("navWishlist")}
              >
                <Heart
                  size={18}
                  fill={wishlistSignedIn && wishlistCount > 0 ? "#E11D48" : "none"}
                  stroke={wishlistSignedIn && wishlistCount > 0 ? "#E11D48" : "currentColor"}
                />
                {wishlistSignedIn && wishlistCount > 0 && (
                  <span className="wishlist-nav-badge">{wishlistCount}</span>
                )}
              </Link>
            </div>

            <span className="header-notification-bell">
              <NotificationBell
                storeId={storeId}
                userId={user?.id ?? null}
                scope="customer"
                basePath={basePath}
              />
            </span>

            <Link
              href={href("/cart")}
              className="cart-nav-btn"
              aria-label={`${t("navCart")} · ${count}`}
            >
              <ShoppingBag size={18} />
              <span
                key={count}
                className={`cart-count-badge ${count > 0 ? "has-items badge-pop" : ""}`}
              >
                {count}
              </span>
            </Link>

            <button
              type="button"
              className="mobile-menu-btn icon-ghost-btn"
              aria-label={isEn ? "Open menu" : "فتح القائمة"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={isEn ? "Store menu" : "قائمة المتجر"}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="mobile-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-drawer-head">
              <div className="mobile-drawer-brand">
                <Store size={17} />
                <strong>{name}</strong>
              </div>
              <button
                type="button"
                className="icon-ghost-btn"
                aria-label={isEn ? "Close menu" : "إغلاق القائمة"}
                onClick={() => setMobileMenuOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {user ? (
              <div className="mobile-drawer-user">
                <strong>{user.name}</strong>
                <small dir="ltr">{user.email}</small>
              </div>
            ) : (
              <Link
                href={loginHref}
                className="mobile-drawer-login-cta"
                onClick={() => setMobileMenuOpen(false)}
              >
                <LogIn size={16} />
                <span>{t("navLogin")}</span>
              </Link>
            )}

            <div className="mobile-drawer-section">
              <Link
                href={href("/products?flash=1")}
                className="mobile-drawer-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Zap size={17} />
                <span>{isEn ? "Flash Deals" : "العروض المؤقتة"}</span>
              </Link>
              <Link
                href={href("/wishlist")}
                className="mobile-drawer-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Heart size={17} />
                <span>{t("navWishlist")}</span>
                {wishlistSignedIn && wishlistCount > 0 && (
                  <span className="user-menu-pill-count">{wishlistCount}</span>
                )}
              </Link>
              {user && (
                <Link
                  href={href("/account")}
                  className="mobile-drawer-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <UserRound size={17} />
                  <span>{t("navAccount")}</span>
                </Link>
              )}
              <Link
                href={href("/orders")}
                className="mobile-drawer-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <ClipboardList size={17} />
                <span>{t("navOrders")}</span>
              </Link>
              <Link
                href={href("/contact")}
                className="mobile-drawer-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Headphones size={17} />
                <span>{t("footerContact")}</span>
              </Link>
              {admin === true && (
                <Link
                  href="/admin"
                  className="mobile-drawer-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <SlidersHorizontal size={17} />
                  <span>{t("footerAdmin")}</span>
                </Link>
              )}
              {superAdmin === true && (
                <Link
                  href="/super-admin"
                  className="mobile-drawer-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <ShieldCheck size={17} />
                  <span>{isEn ? "Super Admin" : "إدارة المنصة"}</span>
                </Link>
              )}
            </div>

            <div className="mobile-drawer-prefs">
              <div className="mobile-drawer-pref-row">
                <span>{isEn ? "Language" : "اللغة"}</span>
                <LanguageToggle className="lang-toggle-pill" />
              </div>
              <div className="mobile-drawer-pref-row">
                <span>{isEn ? "Appearance" : "المظهر"}</span>
                <button
                  type="button"
                  className="theme-btn mobile-drawer-theme-btn"
                  onClick={toggleTheme}
                >
                  <Sun className="light-icon" size={15} />
                  <Moon className="dark-icon" size={15} />
                  <span>{t("navThemeToggle")}</span>
                </button>
              </div>
            </div>

            {user && (
              <form action={logout} className="mobile-drawer-logout">
                <button type="submit">
                  <LogOut size={16} />
                  <span>{t("navLogout")}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <nav className="bottom" aria-label={t("navHome")}>
        {mobileNav.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href !== "/" && pathname.startsWith(href + "/"));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {href === "/cart" && count > 0 && <sup>{count}</sup>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
