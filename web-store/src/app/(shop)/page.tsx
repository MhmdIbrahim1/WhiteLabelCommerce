import Link from "next/link";
import { ArrowLeft, ArrowRight, Truck, ShieldCheck, Headphones } from "lucide-react";
import brand from "@/lib/brand";
import { serverDb, checked } from "@/lib/db";
import {
  settings,
  categories,
  productFields,
  type Product,
} from "@/lib/shop";
import { storeHref } from "@/lib/tenant";
import { localizedText, t, translateHomeCopy } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { Hero } from "@/components/shop/hero";
import { Grid } from "@/components/shop/cards";
import { FlashDealsSection } from "@/components/shop/flash-deals-section";
import { filterActiveFlashDeals } from "@/lib/flash-sale";

export default async function Home() {
  const [db, s, c] = await Promise.all([serverDb(), settings(), categories()]);
  const result = await db
    .from("products")
    .select(productFields)
    .eq("store_id", s.storeId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(48);
  const lang = await getServerLang(s.uiConfig.defaultLanguage);
  const ArrowIcon = lang === "en" ? ArrowRight : ArrowLeft;
  const allProducts = (
    result.error?.code === "42703"
      ? checked(
          await db
            .from("products")
            .select(productFields)
            .eq("store_id", s.storeId)
            .eq("is_active", true)
            .order("name")
            .limit(48),
        )
      : checked(result)
  ) as Product[];
  const displayName = localizedText(lang, s.nameAr, s.nameEn) || s.name;
  const href = (path: string) => storeHref(s.basePath, path);

  const visibleSections = s.uiConfig.homeSections.filter((sec) => sec.visible);
  const firstFeaturedId = visibleSections.find(
    (sec) => sec.type === "featured_products",
  )?.id;
  const hasVisibleHero =
    s.uiConfig.pages.home.hero_visible &&
    visibleSections.some((sec) => sec.type === "hero_banner");
  const activeFlashDeals = filterActiveFlashDeals(allProducts);
  const flashDealsNode =
    activeFlashDeals.length > 0 ? (
      <FlashDealsSection
        key="flash-deals-strip"
        products={activeFlashDeals}
        currency={s.currency}
        lang={lang}
        basePath={s.basePath}
      />
    ) : null;

  return (
    <div className="home-sections-stack flex flex-col gap-6">
      {!hasVisibleHero && flashDealsNode}
      {visibleSections.map((sec) => {
        switch (sec.type) {
          case "hero_banner":
            if (!s.uiConfig.pages.home.hero_visible) return null;
            return (
              <div
                key={sec.id}
                className="flex flex-col gap-6"
                data-home-section="hero_banner"
              >
                <Hero
                  name={displayName}
                  banners={s.banners}
                  slider={brand.presets.hero === "slider"}
                  layout={s.uiConfig.pages.home.heroLayout}
                  autoSlideMs={s.uiConfig.pages.home.bannerSpeedMs}
                  cms={s.uiConfig.pages.home}
                  basePath={s.basePath}
                />
                {flashDealsNode}
              </div>
            );

          case "categories_grid":
            return (
              <section
                key={sec.id}
                data-home-section="categories_grid"
                className="shop-section shop-animate"
              >
                <div className="split section-head">
                  <div>
                    <span className="section-kicker">
                      {t(lang, "kickerCategories")}
                    </span>
                    <h2>{translateHomeCopy(sec.title, lang)}</h2>
                  </div>
                </div>
                <div className="strip category-strip">
                  <Link href={href("/products")} className="category-chip-all">
                    {t(lang, "allProductsChip")}
                  </Link>
                  {c.map((x) => (
                    <Link key={x.id} href={href("/products?category=" + x.id)}>
                      {localizedText(lang, x.name, x.name_en)}
                    </Link>
                  ))}
                </div>
              </section>
            );

          case "featured_products": {
            const anchorId = sec.id === firstFeaturedId ? "latest" : undefined;
            const filtered = sec.categoryId
              ? allProducts.filter((p) => p.category_id === sec.categoryId)
              : allProducts;
            const slice = filtered.slice(0, sec.limit);
            const moreHref = href(
              sec.categoryId
                ? "/products?category=" + encodeURIComponent(sec.categoryId)
                : "/products",
            );
            return (
              <section
                key={sec.id}
                id={anchorId}
                data-home-section="featured_products"
                className="shop-section shop-animate"
              >
                <div className="split section-head">
                  <div>
                    <span className="section-kicker">
                      {t(lang, "kickerFeatured")}
                    </span>
                    <h2>{translateHomeCopy(sec.title, lang)}</h2>
                  </div>
                  <Link href={moreHref} className="section-more-link">
                    <span>{t(lang, "viewAll")}</span>
                    <ArrowIcon size={15} />
                  </Link>
                </div>
                <Grid
                  rows={slice}
                  currency={s.currency}
                  lang={lang}
                  basePath={s.basePath}
                />
              </section>
            );
          }

          case "promo_banner": {
            const isExternal =
              sec.ctaHref.startsWith("http://") ||
              sec.ctaHref.startsWith("https://");
            return (
              <section
                key={sec.id}
                data-home-section="promo_banner"
                className="shop-section promo-banner-section shop-animate"
                style={{ background: sec.accentColor }}
              >
                <div className="promo-banner-content">
                  {sec.badge && (
                    <span className="promo-badge">
                      {translateHomeCopy(sec.badge, lang)}
                    </span>
                  )}
                  <h2>{translateHomeCopy(sec.headline, lang)}</h2>
                  {sec.subtext && (
                    <p>{translateHomeCopy(sec.subtext, lang)}</p>
                  )}
                </div>
                {isExternal ? (
                  <a
                    href={sec.ctaHref}
                    target="_blank"
                    rel="noreferrer"
                    className="cta promo-cta-btn"
                  >
                    <span>{translateHomeCopy(sec.ctaLabel, lang)}</span>
                    <ArrowIcon size={16} />
                  </a>
                ) : (
                  <Link href={href(sec.ctaHref)} className="cta promo-cta-btn">
                    <span>{translateHomeCopy(sec.ctaLabel, lang)}</span>
                    <ArrowIcon size={16} />
                  </Link>
                )}
              </section>
            );
          }

          case "trust_features":
            return (
              <section
                key={sec.id}
                data-home-section="trust_features"
                className="shop-section trust-features-section shop-animate"
              >
                <div className="split section-head">
                  <div>
                    <span className="section-kicker">
                      {t(lang, "kickerTrust")}
                    </span>
                    <h2>{translateHomeCopy(sec.title, lang)}</h2>
                  </div>
                </div>
                <div className="trust-features-grid">
                  <div className="trust-feature-card">
                    <span className="trust-icon">
                      <Truck size={18} />
                    </span>
                    <div>
                      <strong>{t(lang, "trustShipTitle")}</strong>
                      <p>{t(lang, "trustShipSub")}</p>
                    </div>
                  </div>
                  <div className="trust-feature-card">
                    <span className="trust-icon">
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>{t(lang, "trustCodTitle")}</strong>
                      <p>{t(lang, "trustCodSub")}</p>
                    </div>
                  </div>
                  <div className="trust-feature-card">
                    <span className="trust-icon">
                      <Headphones size={18} />
                    </span>
                    <div>
                      <strong>{t(lang, "trustSupportTitle")}</strong>
                      <p>{t(lang, "trustSupportSub")}</p>
                    </div>
                  </div>
                </div>
              </section>
            );
        }
      })}
    </div>
  );
}
