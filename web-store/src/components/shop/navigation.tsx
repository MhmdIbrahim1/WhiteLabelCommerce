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
} from "lucide-react";
import { money } from "@/lib/brand";
import { localizedText } from "@/lib/i18n";
import {
  getCachedSearchHits,
  searchCatalogCached,
  type SmartSearchHit,
} from "@/lib/smart-search";
import { getInstantSearchHints } from "@/lib/searchSynonyms";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { logout } from "@/app/login/actions";
import { useCart } from "./cart-store";

export function Navigation({
  name,
  storeId,
  admin = false,
  user = null,
}: {
  name: string;
  storeId: string;
  admin?: boolean;
  user?: { id?: string; email: string; name: string } | null;
}) {
  const pathname = usePathname();
  const { lang, t } = useLanguage();
  const ArrowIcon = lang === "en" ? ArrowRight : ArrowLeft;
  const count = useCart().reduce((a, l) => a + l.quantity, 0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SmartSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  // Zero-bloat server-first autocomplete with 0ms client LRU cache + 180ms debounce + AbortController
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2 || getCachedSearchHits(trimmed) !== null) return;

    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { hits: nextHits } = await searchCatalogCached(
          trimmed,
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
  }, [q]);

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
  const showSmartBanner = hits.length > 0 && !hasDirectHit;

  const desktopLinks = [
    { href: "/", label: t("navHome"), match: pathname === "/" },
    {
      href: "/products",
      label: t("navCategories"),
      match: pathname === "/products" || pathname.startsWith("/products/"),
    },
    { href: "/#latest", label: t("navLatest"), match: false },
    { href: "/orders", label: t("navOrders"), match: pathname === "/orders" },
  ];

  const mobileNav = [
    { href: "/", label: t("navHome"), Icon: House },
    { href: "/products", label: t("navCategories"), Icon: Grid2X2 },
    { href: "/cart", label: t("navCart"), Icon: ShoppingBag },
    { href: "/orders", label: t("navOrders"), Icon: ClipboardList },
  ];

  return (
    <>
      <header className="shop-head">
        <div className="bar">
          <div className="bar-start">
            <Link href="/" className="wordmark">
              <span className="wordmark-badge" aria-hidden="true">
                <Store size={17} />
              </span>
              <span>{name}</span>
            </Link>
          </div>

          <nav className="desk" aria-label={t("navHome")}>
            {desktopLinks.map(({ href, label, match }) => (
              <Link
                key={href}
                href={href}
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
                <form action="/products" className="search-pill-form">
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
                      const cached = getCachedSearchHits(trimmed);
                      if (cached !== null) {
                        setHits(cached);
                        setHasSearched(true);
                        setSearching(false);
                      } else {
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
                            href={
                              "/products?q=" + encodeURIComponent(hint.query)
                            }
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
                            href={"/products/" + h.id}
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
                                {(h.match_type === "skeleton" ||
                                  h.match_type === "phonetic" ||
                                  h.match_type === "fuzzy") && (
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
                        href={"/products?q=" + encodeURIComponent(trimmedQuery)}
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

            <LanguageToggle className="lang-toggle-pill" />

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
                      href="/account"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <UserRound size={15} /> {t("navAccount")}
                    </Link>
                    <Link
                      href="/orders"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <ClipboardList size={15} /> {t("navOrders")}
                    </Link>
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
                href="/login"
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
              onClick={() => {
                const next =
                  document.documentElement.dataset.shopTheme === "dark"
                    ? "light"
                    : "dark";
                document.documentElement.dataset.shopTheme = next;
                localStorage.setItem("shop.theme", next);
              }}
            >
              <Sun className="light-icon" size={17} />
              <Moon className="dark-icon" size={17} />
            </button>

            <NotificationBell
              storeId={storeId}
              userId={user?.id ?? null}
              scope="customer"
            />

            <Link
              href="/cart"
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
          </div>
        </div>
      </header>

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
