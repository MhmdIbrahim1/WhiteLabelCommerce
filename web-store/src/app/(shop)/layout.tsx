import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Store } from "lucide-react";
import { uiConfigDataAttrs, uiConfigToCssVars } from "@/lib/ui-config";
import { settings } from "@/lib/shop";
import { storefrontAppearance } from "@/lib/storefront-appearance";
import { serverDb } from "@/lib/db";
import { adminUser, superAdminUser } from "@/lib/access";
import { storeHref } from "@/lib/tenant";
import { STORE_CANONICAL_HEADER } from "@/lib/tenant-shared";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import brand from "@/lib/brand";
import { Navigation } from "@/components/shop/navigation";
import { SuspendedStoreGate } from "@/components/shop/suspended-store";
import { WishlistProvider } from "@/components/shop/wishlist-provider";
import { StorePixels } from "@/components/shop/store-pixels";
import { CartTenantProvider } from "@/components/shop/cart-store";
import "./shop.css";
import "./storefront.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const s = await settings();
    const lang = await getServerLang(s.uiConfig.defaultLanguage);
    const displayName = localizedText(lang, s.nameAr, s.nameEn) || s.name;
    const tagline =
      (lang === "en"
        ? s.uiConfig.pages.home.hero_subtitle_en
        : s.uiConfig.pages.home.hero_subtitle_ar
      )?.trim() || t(lang, "footerTagline");
    const canonical = (await headers()).get(STORE_CANONICAL_HEADER);
    return {
      title: {
        absolute: displayName,
        template: `%s · ${displayName}`,
      },
      description: tagline,
      ...(canonical ? {
        alternates: { canonical },
        openGraph: { url: canonical, siteName: displayName, title: displayName, description: tagline, locale: lang === "en" ? "en_US" : "ar_EG" },
      } : { robots: { index: false, follow: false } }),
    };
  } catch {
    return {
      title: {
        absolute: brand.storeName,
        template: `%s · ${brand.storeName}`,
      },
    };
  }
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [db, s, authRes, appearance, jar] = await Promise.all([
    serverDb(), settings(), serverDb().then((client) => client.auth.getUser()), storefrontAppearance(), cookies(),
  ]);
  const authUser = authRes.data.user;
  const [admin, superAdmin, wishRows, lang] = await Promise.all([
    adminUser(db, s.storeId, authUser),
    superAdminUser(db, authUser),
    authUser ? db.from("wishlists").select("product_id")
      .eq("store_id", s.storeId).eq("user_id", authUser.id) : null,
    getServerLang(s.uiConfig.defaultLanguage),
  ]);
  const displayName = localizedText(lang, s.nameAr, s.nameEn) || s.name;

  if (s.status === "suspended") {
    return (
      <div className="shop sf-store" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} style={appearance.tokens as CSSProperties}>
        <SuspendedStoreGate
          storeName={displayName}
          lang={lang}
          canManage={Boolean(admin || superAdmin)}
        />
      </div>
    );
  }

  const initialWishlistIds = (wishRows?.data ?? []).map((row) => String(row.product_id));
  const userSummary = authUser
    ? {
        id: authUser.id,
        email: authUser.email ?? "",
        name:
          (typeof authUser.user_metadata?.full_name === "string" &&
            authUser.user_metadata.full_name.trim()) ||
          (authUser.email?.split("@")[0] ?? t(lang, "navAccount")),
      }
    : null;
  const style: CSSProperties = {
    ...uiConfigToCssVars(s.uiConfig),
    ...appearance.tokens,
  } as CSSProperties;
  const dataAttrs = uiConfigDataAttrs(s.uiConfig);
  const href = (path: string) => storeHref(s.basePath, path);
  const savedMode = jar.get("shop_theme")?.value;
  // First visit after the cookie was introduced: restore the old preference before painting the merchant surface.
  const restoreMode = `(() => {
    try {
      const mode = localStorage.getItem("shop.theme");
      if (mode === "dark" || (!mode && matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.currentScript.parentElement.dataset.shopTheme = "dark";
      }
    } catch {}
  })()`;
  return (
    <div data-storefront-mode="" data-shop-theme={savedMode === "dark" ? "dark" : "light"} suppressHydrationWarning>
    {!savedMode && <script dangerouslySetInnerHTML={{ __html: restoreMode }} />}
    <CartTenantProvider storeId={s.storeId} defaultMaxOrderQty={s.defaultMaxOrderQty}>
      <WishlistProvider
        storeId={s.storeId}
        initialProductIds={initialWishlistIds}
        isSignedIn={Boolean(authUser)}
      >
        <div
          className="shop sf-store"
          lang={lang}
          dir={lang === "ar" ? "rtl" : "ltr"}
          {...dataAttrs}
          data-storefront-preset={appearance.preset}
          data-motion-enabled={appearance.motionEnabled}
          data-entrance={appearance.motionEnabled ? dataAttrs["data-entrance"] : "none"}
          data-card-hover={appearance.motionEnabled ? dataAttrs["data-card-hover"] : "none"}
          data-sticky-cta={appearance.stickyCtaEnabled}
          data-card={brand.presets.productCard}
          style={style}
        >
        <StorePixels
          storeId={s.storeId}
          metaPixelId={s.pixels.metaPixelId}
          tiktokPixelId={s.pixels.tiktokPixelId}
          ga4MeasurementId={s.pixels.ga4MeasurementId}
        />
        <Navigation
          name={displayName}
          logo={s.uiConfig.storefrontLogo}
          currency={s.currency}
          hasFeatured={s.uiConfig.homeSections.some(section => section.visible && section.type === "featured_products")}
          storeId={s.storeId}
          storeSlug={s.slug}
          basePath={s.basePath}
          admin={Boolean(admin)}
          superAdmin={Boolean(superAdmin)}
          user={userSummary}
        />
        <main id="store-content" className="shop-main" tabIndex={-1}>{children}</main>
        <footer className="shop-footer-wrap">
          <div className="shop-footer">
            <div className="footer-brand">
              <span className="footer-mark" aria-hidden="true">
                <Store size={17} />
              </span>
              <div>
                <b>{displayName}</b>
                <p>{t(lang, "footerTagline")}</p>
              </div>
            </div>
            <nav className="footer-links" aria-label={lang === "en" ? "Footer navigation" : "روابط التذييل"}>
              <Link href={href("/products")}>{t(lang, "footerAllProducts")}</Link>
              <Link href={href("/wishlist")}>{t(lang, "navWishlist")}</Link>
              <Link href={href("/orders")}>{t(lang, "footerTrackOrders")}</Link>
              <Link href={href("/contact")}>{t(lang, "footerContact")}</Link>
              {admin && <Link href="/admin">{t(lang, "footerAdmin")}</Link>}
              {superAdmin && (
                <Link href="/super-admin">
                  {lang === "en" ? "Super Admin" : "إدارة المنصة"}
                </Link>
              )}
            </nav>
          </div>
        </footer>
        <div data-storefront-overlays="" />
        </div>
      </WishlistProvider>
    </CartTenantProvider>
    </div>
  );
}
