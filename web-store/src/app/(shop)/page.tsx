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
import { StoreCopy } from "@/components/shop/store-copy";
import { Grid } from "@/components/shop/cards";
import { FlashDealsSection } from "@/components/shop/flash-deals-section";
import { filterActiveFlashDeals } from "@/lib/flash-sale";
import { storefrontAppearance } from "@/lib/storefront-appearance";
import { accentContrast } from "@/lib/theme-contrast";
import fashion from "../platform-landing/photos/fashion.webp";
import audio from "../platform-landing/photos/audio.webp";
import fragrance from "../platform-landing/photos/fragrance.webp";
import coffee from "../platform-landing/photos/coffee.webp";
import objects from "../platform-landing/photos/objects.webp";

const art = { fashion_editorial: fashion, tech_precision: audio, beauty_maison: fragrance, gourmet_craft: coffee, commerce_signature: objects };

export default async function Home() {
  const [db, s, c, appearance] = await Promise.all([serverDb(), settings(), categories(), storefrontAppearance()]);
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
  const firstHeroId = s.uiConfig.pages.home.hero_visible
    ? visibleSections.find((sec) => sec.type === "hero_banner")?.id
    : undefined;
  const activeFlashDeals = filterActiveFlashDeals(allProducts);
  const flashDealsNode =
    activeFlashDeals.length > 0 ? (
      <FlashDealsSection
        preset={appearance.preset}
        key="flash-deals-strip"
        products={activeFlashDeals}
        currency={s.currency}
        lang={lang}
        basePath={s.basePath}
      />
    ) : null;

  return (
    <div className="home-sections-stack">
      {!firstHeroId && flashDealsNode}
      {visibleSections.map((sec) => {
        switch (sec.type) {
          case "hero_banner":
            if (!s.uiConfig.pages.home.hero_visible) return null;
            return (
              <div
                key={sec.id}
                className="sf-hero-section"
                data-home-section="hero_banner"
              >
                <Hero
                  preset={appearance.preset}
                  motion={appearance.motionEnabled}
                  artwork={art[appearance.preset].src}
                  collectionHref={firstFeaturedId ? "#latest" : undefined}
                  name={displayName}
                  banners={s.banners}
                  slider={brand.presets.hero === "slider"}
                  layout={s.uiConfig.pages.home.heroLayout}
                  autoSlideMs={s.uiConfig.pages.home.bannerSpeedMs}
                  cms={s.uiConfig.pages.home}
                  basePath={s.basePath}
                />
                {sec.id === firstHeroId && flashDealsNode}
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
                    <h2><StoreCopy text={translateHomeCopy(sec.title, lang)} lang={lang}/></h2>
                  </div>
                </div>
                <nav className="strip category-strip" aria-label={translateHomeCopy(sec.title, lang)}>
                  <Link href={href("/products")} className="category-chip-all">
                    {t(lang, "allProductsChip")}
                  </Link>
                  {c.map((x) => (
                    <Link key={x.id} href={href("/products?category=" + x.id)}>
                      <StoreCopy text={localizedText(lang, x.name, x.name_en)} lang={lang}/>
                    </Link>
                  ))}
                </nav>
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
                    <h2><StoreCopy text={translateHomeCopy(sec.title, lang)} lang={lang}/></h2>
                  </div>
                  <Link href={moreHref} className="section-more-link">
                    <span>{t(lang, "viewAll")}</span>
                    <ArrowIcon size={15} />
                  </Link>
                </div>
                <Grid
                  preset={appearance.preset}
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
                style={{ background: accentContrast(sec.accentColor).background, color: accentContrast(sec.accentColor).foreground }}
              >
                <div className="promo-banner-content">
                  {sec.badge && (
                    <span className="promo-badge">
                      <StoreCopy text={translateHomeCopy(sec.badge, lang)} lang={lang}/>
                    </span>
                  )}
                  <h2><StoreCopy text={translateHomeCopy(sec.headline, lang)} lang={lang}/></h2>
                  {sec.subtext && (
                    <p><StoreCopy text={translateHomeCopy(sec.subtext, lang)} lang={lang}/></p>
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
