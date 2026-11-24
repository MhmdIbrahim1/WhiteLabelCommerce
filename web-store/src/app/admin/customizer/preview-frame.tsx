"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Search,
  ShoppingBag,
  Store,
  Package,
  Check,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Truck,
  ShieldCheck,
  Clock3,
  Headphones,
} from "lucide-react";
import {
  uiConfigDataAttrs,
  uiConfigToCssVars,
  type StoreUiConfig,
  type HomeSection,
} from "@/lib/ui-config";
import { money } from "@/lib/brand";
import { localizedText, orderStatusLabel, translateColor, translateHomeCopy } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import "../../(shop)/shop.css";

export type PreviewPageKey =
  | "home"
  | "products"
  | "product_details"
  | "cart_checkout"
  | "orders";

export type PreviewProduct = {
  id: string;
  categoryId?: string;
  name: string;
  name_en?: string | null;
  description: string;
  description_en?: string | null;
  price: number;
  old_price: number | null;
  stock: number;
  sizes: string[];
  colors: string[];
  imageUrl: string | null;
};

export type PreviewCategory = {
  id: string;
  name: string;
  name_en?: string | null;
};

const FALLBACK_PRODUCTS: PreviewProduct[] = [
  {
    id: "p1",
    name: "حقيبة قماشية عملية يومية",
    name_en: "Everyday Heavyweight Canvas Tote",
    description:
      "خامة قطنية متينة وتصميم عصري مناسب للاستخدام اليومي مع مساحة داخلية واسعة.",
    description_en:
      "Durable cotton canvas crafted for everyday essentials with a spacious interior.",
    price: 250,
    old_price: 320,
    stock: 12,
    sizes: ["S", "M", "L"],
    colors: ["Navy", "Beige", "Black"],
    imageUrl: "/store-collection.jpg",
  },
  {
    id: "p2",
    name: "قميص كتان صيفي مريح",
    name_en: "Relaxed Summer Linen Shirt",
    description: "كتان طبيعي خفيف بقصّة أنيقة ومريحة.",
    description_en: "Breathable natural linen tailored in an effortless modern cut.",
    price: 480,
    old_price: null,
    stock: 8,
    sizes: ["M", "L", "XL"],
    colors: ["White", "Sand"],
    imageUrl: null,
  },
  {
    id: "p3",
    name: "محفظة جلدية كلاسيكية",
    name_en: "Classic Genuine Leather Wallet",
    description: "جلد طبيعي بتفاصيل دقيقة وخياطة متينة.",
    description_en: "Full-grain leather with crisp stitching and slim profile.",
    price: 340,
    old_price: 410,
    stock: 15,
    sizes: [],
    colors: ["Brown", "Black"],
    imageUrl: null,
  },
  {
    id: "p4",
    name: "نظارة شمسية بإطار معدني",
    name_en: "Polarized Metal Aviator Sunglasses",
    description: "حماية كاملة من الأشعة فوق البنفسجية وتصميم خفيف الوزن.",
    description_en: "UV400 glare-free polarized lenses in a lightweight metal frame.",
    price: 590,
    old_price: 700,
    stock: 5,
    sizes: [],
    colors: ["Gold", "Silver"],
    imageUrl: null,
  },
];

const FALLBACK_CATEGORIES: PreviewCategory[] = [
  { id: "c1", name: "إكسسوارات", name_en: "Accessories" },
  { id: "c2", name: "أزياء موسمية", name_en: "Men's Fashion" },
  { id: "c3", name: "حقائب", name_en: "Leather Bags" },
  { id: "c4", name: "الأكثر مبيعاً", name_en: "Best Sellers" },
];

export function PreviewFrame({
  config,
  page,
  viewport,
  animSeed,
  storeName,
  currency,
  shippingFee,
  banners,
  products,
  categories,
  onNavigate,
}: {
  config: StoreUiConfig;
  page: PreviewPageKey;
  viewport: "desktop" | "mobile";
  animSeed: number;
  storeName: string;
  currency: string;
  shippingFee: number;
  banners: string[];
  products: PreviewProduct[];
  categories: PreviewCategory[];
  onNavigate: (next: PreviewPageKey) => void;
}) {
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  const [heroIdx, setHeroIdx] = useState(0);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [selectedSize, setSelectedSize] = useState("M");
  const [selectedColor, setSelectedColor] = useState("");
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "checkout">(
    "checkout",
  );

  const previewBanners =
    banners.length > 0
      ? banners
      : ["/store-collection.jpg", "/store-collection.jpg"];
  const safeHeroIdx = heroIdx % previewBanners.length;

  useEffect(() => {
    const speed = config.pages.home.bannerSpeedMs;
    if (page !== "home" || previewBanners.length <= 1 || speed <= 0) return;
    const timer = setInterval(() => {
      setHeroIdx((i) => (i + 1) % previewBanners.length);
    }, speed);
    return () => clearInterval(timer);
  }, [page, previewBanners.length, config.pages.home.bannerSpeedMs]);

  const items = products.length > 0 ? products : FALLBACK_PRODUCTS;
  const cats = categories.length > 0 ? categories : FALLBACK_CATEGORIES;
  const featured = items[0];
  const featuredSizes = featured.sizes.length ? featured.sizes : ["S", "M", "L"];
  const featuredColors = featured.colors.length
    ? featured.colors
    : isEn
      ? ["Navy", "Beige", "Black"]
      : ["كحلي", "بيج", "أسود"];

  const activeSize = featuredSizes.includes(selectedSize)
    ? selectedSize
    : featuredSizes[0];
  const activeColor = featuredColors.includes(selectedColor)
    ? selectedColor
    : featuredColors[0];

  const cssVars = uiConfigToCssVars(config);
  const dataAttrs = uiConfigDataAttrs(config);
  const galleryViews = [
    "gallery-view--main",
    "gallery-view--zoom",
    "gallery-view--angle",
  ];

  const renderProductCard = (p: PreviewProduct, idx: number) => {
    const pTitle = localizedText(lang, p.name, p.name_en);
    return (
      <article
        className="tile shop-animate"
        style={{ animationDelay: `${idx * 55}ms` }}
        key={p.id}
      >
        <div className="tile-media">
          <div
            role="button"
            tabIndex={0}
            className="tile-photo-link"
            onClick={() => onNavigate("product_details")}
            onKeyDown={(e) => {
              if (e.key === "Enter") onNavigate("product_details");
            }}
            style={{ cursor: "pointer" }}
          >
            <div className="product-photo">
              {p.imageUrl ? (
                <Image fill unoptimized src={p.imageUrl} alt={pTitle} />
              ) : (
                <Package size={38} strokeWidth={1.1} />
              )}
            </div>
          </div>
          {p.old_price && p.old_price > p.price ? (
            <span className="discount">
              -{Math.round(100 * (1 - p.price / p.old_price))}
              {isEn ? "%" : "٪"}
            </span>
          ) : null}
          <div className="tile-quick-add">
            <button
              type="button"
              className="atc-btn quick-add-pill"
              onClick={() => onNavigate("cart_checkout")}
            >
              <ShoppingBag size={14} />
              <span>{t("quickAdd")}</span>
            </button>
          </div>
        </div>
        <div className="tile-body">
          <a
            href="#details"
            className="tile-title-link"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("product_details");
            }}
          >
            <h3>{pTitle}</h3>
          </a>
          <div className="price">
            <strong className="price-badge">
              {money(p.price, currency, lang)}
            </strong>
            {p.old_price && p.old_price > p.price && (
              <del>{money(p.old_price, currency, lang)}</del>
            )}
          </div>
        </div>
      </article>
    );
  };

  const renderHomeSection = (sec: HomeSection) => {
    switch (sec.type) {
      case "hero_banner": {
        const home = config.pages.home;
        if (!home.hero_visible) return null;

        const customImg = home.hero_image_url?.trim() || null;
        const heroImg = customImg || previewBanners[safeHeroIdx];
        const pickLang = (ar: string, en: string) =>
          isEn ? en.trim() || ar.trim() : ar.trim() || en.trim();
        const defaultBadge =
          home.heroLayout === "full-bleed"
            ? t("heroEyebrowNew")
            : home.heroLayout === "bento"
              ? t("heroEyebrowSeason")
              : t("heroEyebrowRefined");
        const badgeText =
          pickLang(home.hero_badge_ar, home.hero_badge_en) || defaultBadge;
        const customTitle = pickLang(home.hero_title_ar, home.hero_title_en);
        const subtitleText = isEn
          ? home.hero_subtitle_en.trim()
          : home.hero_subtitle_ar.trim();
        const defaultCta =
          home.heroLayout === "full-bleed"
            ? t("heroShopCollection")
            : home.heroLayout === "bento"
              ? t("heroShopNow")
              : t("heroShopProducts");
        const ctaText =
          pickLang(home.hero_cta_text_ar, home.hero_cta_text_en) || defaultCta;
        const overlayAlpha =
          Math.min(80, Math.max(0, home.hero_overlay_opacity)) / 100;
        const overlayStyle = {
          background: `linear-gradient(180deg, rgba(10, 15, 28, ${(overlayAlpha * 0.65).toFixed(2)}) 0%, rgba(10, 15, 28, ${overlayAlpha.toFixed(2)}) 100%)`,
        };

        if (home.heroLayout === "full-bleed") {
          return (
            <section
              key={sec.id}
              data-home-section={sec.type}
              className="shop-hero shop-hero--full-bleed shop-animate"
            >
              <div className="hero-bg-media" aria-hidden="true">
                <Image src={heroImg} unoptimized fill alt={storeName} />
                <div
                  className="hero-overlay hero-overlay--editorial"
                  style={overlayStyle}
                />
              </div>
              <div className="hero-copy hero-copy--bottom">
                {home.hero_badge_visible && badgeText && (
                  <span className="hero-eyebrow">
                    <Sparkles size={12} /> {badgeText}
                  </span>
                )}
                <h1>
                  {customTitle ? (
                    customTitle
                  ) : (
                    <>
                      {t("heroDiscover")}
                      <br />
                      {storeName}
                    </>
                  )}
                </h1>
                {subtitleText && (
                  <p className="hero-subtitle">{subtitleText}</p>
                )}
                {home.hero_cta_visible && (
                  <div className="hero-actions">
                    <a
                      href="#products"
                      className="cta hero-cta-pill"
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate("products");
                      }}
                    >
                      {ctaText} <ArrowIcon size={15} />
                    </a>
                  </div>
                )}
              </div>
            </section>
          );
        }
        if (home.heroLayout === "bento") {
          return (
            <section
              key={sec.id}
              data-home-section={sec.type}
              className="shop-hero-bento shop-animate"
            >
              <div className="shop-hero bento-main">
                <div className="hero-bg-media" aria-hidden="true">
                  <Image src={heroImg} unoptimized fill alt={storeName} />
                  <div
                    className="hero-overlay hero-overlay--scrim"
                    style={overlayStyle}
                  />
                </div>
                <div className="hero-copy hero-copy--bottom">
                  {home.hero_badge_visible && badgeText && (
                    <span className="hero-eyebrow">
                      <Sparkles size={12} /> {badgeText}
                    </span>
                  )}
                  <h1>
                    {customTitle ? (
                      customTitle
                    ) : (
                      <>
                        {t("heroDiscover")}
                        <br />
                        {storeName}
                      </>
                    )}
                  </h1>
                  {subtitleText && (
                    <p className="hero-subtitle">{subtitleText}</p>
                  )}
                  {home.hero_cta_visible && (
                    <div className="hero-actions">
                      <a
                        href="#products"
                        className="cta hero-cta-pill"
                        onClick={(e) => {
                          e.preventDefault();
                          onNavigate("products");
                        }}
                      >
                        {ctaText} <ArrowIcon size={15} />
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <div className="bento-side">
                <a
                  href="#products"
                  className="bento-tile bento-tile--media"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate("products");
                  }}
                >
                  <Image
                    src={
                      previewBanners[(safeHeroIdx + 1) % previewBanners.length]
                    }
                    unoptimized
                    fill
                    alt={t("navLatest")}
                  />
                  <div className="bento-scrim" aria-hidden="true" />
                  <div className="bento-caption">
                    <div>
                      <span className="bento-kicker">{t("navLatest")}</span>
                      <strong>{t("heroWeeklyPicks")}</strong>
                    </div>
                    <span className="bento-arrow" aria-hidden="true">
                      <ArrowIcon size={15} />
                    </span>
                  </div>
                </a>
                <div className="bento-trust-strip">
                  <div className="trust-chip">
                    <span className="trust-icon">
                      <Truck size={14} />
                    </span>
                    <div>
                      <strong>{t("trustShipShort")}</strong>
                      <small>{t("trustShipShortSub")}</small>
                    </div>
                  </div>
                  <div className="trust-chip">
                    <span className="trust-icon">
                      <ShieldCheck size={14} />
                    </span>
                    <div>
                      <strong>{t("trustCodShort")}</strong>
                      <small>{t("trustCodShortSub")}</small>
                    </div>
                  </div>
                  <div className="trust-chip">
                    <span className="trust-icon">
                      <Clock3 size={14} />
                    </span>
                    <div>
                      <strong>{t("trustTrackShort")}</strong>
                      <small>{t("trustTrackShortSub")}</small>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        }
        return (
          <section
            key={sec.id}
            data-home-section={sec.type}
            className="shop-hero shop-hero--split shop-animate"
          >
            <div className="hero-copy">
              {home.hero_badge_visible && badgeText && (
                <span className="hero-eyebrow">
                  <Sparkles size={12} /> {badgeText}
                </span>
              )}
              <h1>
                {customTitle ? (
                  customTitle
                ) : (
                  <>
                    {t("heroDiscover")}
                    <br />
                    {storeName}
                  </>
                )}
              </h1>
              {subtitleText && <p className="hero-subtitle">{subtitleText}</p>}
              {home.hero_cta_visible && (
                <a
                  href="#products"
                  className="cta hero-cta-pill"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate("products");
                  }}
                >
                  {ctaText} <ArrowIcon size={15} />
                </a>
              )}
            </div>
            <div className="hero-image">
              <Image src={heroImg} unoptimized fill alt={storeName} />
              {customImg && (
                <div
                  className="hero-overlay"
                  aria-hidden="true"
                  style={overlayStyle}
                />
              )}
            </div>
          </section>
        );
      }

      case "categories_grid":
        return (
          <section
            key={sec.id}
            data-home-section={sec.type}
            className="shop-section shop-animate"
          >
            <div className="split section-head">
              <div>
                <span className="section-kicker">{t("kickerCategories")}</span>
                <h2>{translateHomeCopy(sec.title, lang)}</h2>
              </div>
            </div>
            <div className="strip category-strip">
              <a
                href="#all"
                className="category-chip-all"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("products");
                }}
              >
                {t("allProductsChip")}
              </a>
              {cats.slice(0, 5).map((c) => (
                <a
                  key={c.id}
                  href="#cat"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate("products");
                  }}
                >
                  {localizedText(lang, c.name, c.name_en)}
                </a>
              ))}
            </div>
          </section>
        );

      case "featured_products": {
        const filtered = sec.categoryId
          ? items.filter((p) => p.categoryId === sec.categoryId)
          : items;
        const shown = (filtered.length ? filtered : items).slice(
          0,
          Math.min(sec.limit, 8),
        );
        return (
          <section
            key={sec.id}
            data-home-section={sec.type}
            className="shop-section shop-animate"
          >
            <div className="split section-head">
              <div>
                <span className="section-kicker">{t("kickerFeatured")}</span>
                <h2>{translateHomeCopy(sec.title, lang)}</h2>
              </div>
              <a
                href="#products"
                className="section-more-link"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("products");
                }}
              >
                <span>{t("viewAll")}</span>
                <ArrowIcon size={14} />
              </a>
            </div>
            <div className="product-grid">{shown.map(renderProductCard)}</div>
          </section>
        );
      }

      case "promo_banner":
        return (
          <section
            key={sec.id}
            data-home-section={sec.type}
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
              {sec.subtext && <p>{translateHomeCopy(sec.subtext, lang)}</p>}
            </div>
            <a
              href="#promo"
              className="cta promo-cta-btn"
              onClick={(e) => {
                e.preventDefault();
                onNavigate("products");
              }}
            >
              <span>{translateHomeCopy(sec.ctaLabel, lang)}</span>
              <ArrowIcon size={15} />
            </a>
          </section>
        );

      case "trust_features":
        return (
          <section
            key={sec.id}
            data-home-section={sec.type}
            className="shop-section trust-features-section shop-animate"
          >
            <div className="split section-head">
              <div>
                <span className="section-kicker">{t("kickerTrust")}</span>
                <h2>{translateHomeCopy(sec.title, lang)}</h2>
              </div>
            </div>
            <div className="trust-features-grid">
              <div className="trust-feature-card">
                <span className="trust-icon">
                  <Truck size={18} />
                </span>
                <div>
                  <strong>{t("trustShipTitle")}</strong>
                  <p>{t("trustShipSub")}</p>
                </div>
              </div>
              <div className="trust-feature-card">
                <span className="trust-icon">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <strong>{t("trustCodTitle")}</strong>
                  <p>{t("trustCodSub")}</p>
                </div>
              </div>
              <div className="trust-feature-card">
                <span className="trust-icon">
                  <Headphones size={18} />
                </span>
                <div>
                  <strong>{t("trustSupportTitle")}</strong>
                  <p>{t("trustSupportSub")}</p>
                </div>
              </div>
            </div>
          </section>
        );
    }
  };

  const featuredTitle = localizedText(lang, featured.name, featured.name_en);
  const featuredDesc = localizedText(
    lang,
    featured.description,
    featured.description_en,
  );

  return (
    <div
      className={
        "preview-canvas " +
        (viewport === "mobile" ? "preview-canvas--mobile" : "")
      }
    >
      <div
        className="shop preview-shop"
        style={cssVars}
        {...dataAttrs}
        data-preview="true"
      >
        <header className="shop-head">
          <div className="bar">
            <div className="bar-start">
              <a
                href="#preview-home"
                className="wordmark"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("home");
                }}
              >
                <span className="wordmark-badge" aria-hidden="true">
                  <Store size={15} />
                </span>
                <span>{storeName}</span>
              </a>
            </div>
            <nav className="desk" aria-label={t("navHome")}>
              <a
                href="#home"
                className="nav-link"
                aria-current={page === "home" ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("home");
                }}
              >
                {t("navHome")}
              </a>
              <a
                href="#products"
                className="nav-link"
                aria-current={page === "products" ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("products");
                }}
              >
                {t("navCategories")}
              </a>
              <a
                href="#orders"
                className="nav-link"
                aria-current={page === "orders" ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("orders");
                }}
              >
                {t("navOrders")}
              </a>
            </nav>
            <div className="bar-end">
              <button
                type="button"
                className="search-trigger-pill"
                aria-label={t("navSearch")}
                onClick={() => onNavigate("products")}
              >
                <Search size={14} />
              </button>
              <a
                href="#cart"
                className="cart-nav-btn"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("cart_checkout");
                }}
              >
                <ShoppingBag size={16} />
                <span className="cart-count-badge has-items">2</span>
              </a>
            </div>
          </div>
        </header>

        <main
          className="shop-main"
          key={`${page}-${config.pages.home.entranceAnimation}-${config.global.motionIntensity}-${animSeed}`}
        >
          {page === "home" && (
            <>
              {config.homeSections.filter((s) => s.visible).length > 0 ? (
                config.homeSections
                  .filter((s) => s.visible)
                  .map(renderHomeSection)
              ) : (
                <div
                  className="panel"
                  style={{ textAlign: "center", padding: "2.5rem" }}
                >
                  <p>
                    {isEn
                      ? "All home sections are currently hidden. Enable a section in the Sections tab."
                      : "جميع أقسام الصفحة الرئيسية مخفية حالياً. فعّل قسماً من لوحة الأقسام."}
                  </p>
                </div>
              )}
            </>
          )}

          {page === "products" && (
            <>
              <div className="split section-head">
                <h1 style={{ margin: 0, fontSize: "1.6rem" }}>
                  {t("allProductsChip")}
                </h1>
                <small>
                  {isEn
                    ? `${config.pages.products.gridColumns} columns`
                    : `${config.pages.products.gridColumns} أعمدة`}
                </small>
              </div>
              <div className="filters panel">
                <label>
                  {t("filterSearch")}
                  <input readOnly placeholder={t("filterSearchPlaceholder")} />
                </label>
                <label>
                  {t("filterCategory")}
                  <select defaultValue="">
                    <option value="">{t("filterAllCategories")}</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {localizedText(lang, c.name, c.name_en)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button">{t("filterApply")}</button>
              </div>
              <div className="product-grid">
                {items.slice(0, 4).map(renderProductCard)}
              </div>
            </>
          )}

          {page === "product_details" && (
            <section className="details-grid">
              <div className="product-gallery">
                <div
                  className={
                    "product-photo gallery-stage " + galleryViews[galleryIdx]
                  }
                >
                  {featured.imageUrl ? (
                    <Image
                      fill
                      unoptimized
                      src={featured.imageUrl}
                      alt={featuredTitle}
                    />
                  ) : (
                    <Package size={54} strokeWidth={1.1} />
                  )}
                </div>
                <div className="gallery-thumbs">
                  {galleryViews.map((cls, idx) => (
                    <button
                      key={cls}
                      type="button"
                      className={"gallery-thumb " + cls}
                      data-active={galleryIdx === idx ? "true" : "false"}
                      onClick={() => setGalleryIdx(idx)}
                      aria-label={
                        isEn
                          ? `Preview angle ${idx + 1}`
                          : `معاينة زاوية ${idx + 1}`
                      }
                    >
                      {featured.imageUrl ? (
                        <Image
                          fill
                          unoptimized
                          src={featured.imageUrl}
                          alt={featuredTitle}
                        />
                      ) : (
                        <Package size={18} strokeWidth={1.3} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h1 style={{ fontSize: "1.65rem", marginBottom: "0.5rem" }}>
                  {featuredTitle}
                </h1>
                <div className="price">
                  <strong className="price-badge">
                    {money(featured.price, currency, lang)}
                  </strong>
                  {featured.old_price && (
                    <del>{money(featured.old_price, currency, lang)}</del>
                  )}
                </div>
                <p>{featuredDesc}</p>
                <p>
                  {t("inStockLabel")} · {featured.stock}
                </p>
                <div className="detail-buy">
                  <div className="variant-group">
                    <span className="variant-label">{t("sizeLabel")}</span>
                    <div className="variant-options">
                      {featuredSizes.map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          className="variant-chip"
                          data-selected={activeSize === sz ? "true" : "false"}
                          onClick={() => setSelectedSize(sz)}
                        >
                          {activeSize === sz && <Check size={13} />}
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="variant-group">
                    <span className="variant-label">{t("colorLabel")}</span>
                    <div className="variant-options">
                      {featuredColors.map((cl) => (
                        <button
                          key={cl}
                          type="button"
                          className="variant-chip"
                          data-selected={activeColor === cl ? "true" : "false"}
                          onClick={() => setSelectedColor(cl)}
                        >
                          {activeColor === cl && <Check size={13} />}
                          {translateColor(cl, lang)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="detail-cta"
                    onClick={() => onNavigate("cart_checkout")}
                  >
                    <ShoppingBag size={17} /> {t("addToBag")}
                  </button>
                </div>
              </div>
            </section>
          )}

          {page === "cart_checkout" && (
            <>
              <div className="split section-head">
                <h1 style={{ fontSize: "1.6rem", margin: 0 }}>
                  {checkoutStep === "checkout"
                    ? t("checkoutTitle")
                    : t("cartTitle")}
                </h1>
                <div className="actions">
                  <button
                    type="button"
                    className="search-trigger-pill"
                    onClick={() =>
                      setCheckoutStep((s) =>
                        s === "cart" ? "checkout" : "cart",
                      )
                    }
                  >
                    {checkoutStep === "checkout"
                      ? isEn
                        ? "Preview Bag"
                        : "معاينة السلة"
                      : isEn
                        ? "Preview Checkout"
                        : "معاينة الدفع"}
                  </button>
                </div>
              </div>
              <div className="checkout-progress">
                <div className="checkout-progress-steps">
                  <span data-active="true">{t("stepReviewCart")}</span>
                  <span
                    data-active={checkoutStep === "checkout" ? "true" : "false"}
                  >
                    {t("stepShippingPay")}
                  </span>
                  <span data-active="false">{t("stepConfirm")}</span>
                </div>
                <div className="checkout-progress-track">
                  <div
                    className="checkout-progress-fill"
                    style={{
                      width: checkoutStep === "checkout" ? "68%" : "34%",
                    }}
                  />
                </div>
              </div>
              <div className="details-grid">
                <section className="panel">
                  <h2>{t("cartItemsTitle")}</h2>
                  {items.slice(0, 2).map((item) => (
                    <div className="basket-line" key={item.id}>
                      <strong>
                        {localizedText(lang, item.name, item.name_en)}
                      </strong>
                      <p>
                        {t("qtyLabel")}: 1 · {money(item.price, currency, lang)}
                      </p>
                    </div>
                  ))}
                </section>
                <section className="panel cart-summary-panel">
                  <h2>{t("orderSummaryTitle")}</h2>
                  <p>
                    {t("subtotalLabel")} ·{" "}
                    {money(
                      items.slice(0, 2).reduce((a, b) => a + b.price, 0),
                      currency,
                      lang,
                    )}
                  </p>
                  <p>
                    {t("shippingLabel")} · {money(shippingFee, currency, lang)}
                  </p>
                  <strong>
                    {t("estimatedTotalLabel")} ·{" "}
                    {money(
                      items.slice(0, 2).reduce((a, b) => a + b.price, 0) +
                        shippingFee,
                      currency,
                      lang,
                    )}
                  </strong>
                  <div style={{ marginTop: "1rem" }}>
                    <button type="button" className="checkout-cta">
                      {checkoutStep === "checkout"
                        ? t("confirmOrderBtn")
                        : t("proceedCheckoutBtn")}
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}

          {page === "orders" && (
            <>
              <h1 style={{ fontSize: "1.6rem", marginBottom: "1rem" }}>
                {t("myOrdersTitle")}
              </h1>
              <div className="details-grid">
                <section className="panel order-panel">
                  <h2>{t("guestTrackTitle")}</h2>
                  <div
                    style={{
                      display: "grid",
                      gap: "0.75rem",
                      marginTop: "0.75rem",
                    }}
                  >
                    <label>
                      {t("orderNumberLabel")}
                      <input readOnly dir="ltr" value="ORD-2026-9842" />
                    </label>
                    <label>
                      {t("orderPhoneLabel")}
                      <input readOnly dir="ltr" value="01012345678" />
                    </label>
                    <button type="button">{t("trackOrderSubmit")}</button>
                  </div>
                </section>
                <section className="panel order-panel">
                  <h2>{t("accountRecentOrders")}</h2>
                  <article className="order-summary order-card">
                    <div className="order-card-head">
                      <div>
                        <p dir="ltr" className="order-id">
                          #8F2A91C4
                        </p>
                        <small>{isEn ? "23 Nov 2026" : "٢٣ نوفمبر ٢٠٢٦"}</small>
                      </div>
                      <span className="order-status-badge" data-status="shipped">
                        {orderStatusLabel("shipped", lang)}
                      </span>
                    </div>
                    <ol className="timeline">
                      <li data-done="true">{orderStatusLabel("pending", lang)}</li>
                      <li data-done="true">{orderStatusLabel("confirmed", lang)}</li>
                      <li data-done="true" aria-current="step">
                        {orderStatusLabel("shipped", lang)}
                      </li>
                      <li data-done="false">{orderStatusLabel("delivered", lang)}</li>
                    </ol>
                  </article>
                  <article className="order-summary order-card">
                    <div className="order-card-head">
                      <div>
                        <p dir="ltr" className="order-id">
                          #5D10B7E2
                        </p>
                        <small>{isEn ? "19 Nov 2026" : "١٩ نوفمبر ٢٠٢٦"}</small>
                      </div>
                      <span
                        className="order-status-badge"
                        data-status="delivered"
                      >
                        {orderStatusLabel("delivered", lang)}
                      </span>
                    </div>
                    <ol className="timeline">
                      <li data-done="true">{orderStatusLabel("pending", lang)}</li>
                      <li data-done="true">{orderStatusLabel("confirmed", lang)}</li>
                      <li data-done="true">{orderStatusLabel("shipped", lang)}</li>
                      <li data-done="true" aria-current="step">
                        {orderStatusLabel("delivered", lang)}
                      </li>
                    </ol>
                  </article>
                </section>
              </div>
            </>
          )}
        </main>

        <footer className="shop-footer-wrap">
          <div className="shop-footer">
            <b>{storeName}</b>
            <span>{t("footerContact")}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
