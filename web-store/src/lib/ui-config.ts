import type { CSSProperties } from "react";
import { isStorefrontPreset, type StorefrontPreset } from "./storefront-presets.ts";
import {
  templates,
  templateVars,
  isTemplate,
  type TemplateId,
} from "./theme-templates.ts";

export const MOTION_INTENSITIES = [
  "none",
  "subtle",
  "smooth",
  "bouncy",
] as const;
export type MotionIntensity = (typeof MOTION_INTENSITIES)[number];

export const HERO_LAYOUTS = ["split", "full-bleed", "bento"] as const;
export type HeroLayout = (typeof HERO_LAYOUTS)[number];

export const CATEGORY_CARD_STYLES = [
  "pills",
  "rounded-cards",
  "minimal",
] as const;
export type CategoryCardStyle = (typeof CATEGORY_CARD_STYLES)[number];

export const ENTRANCE_ANIMATIONS = [
  "fade-up",
  "zoom-in",
  "slide-rtl",
  "none",
] as const;
export type EntranceAnimation = (typeof ENTRANCE_ANIMATIONS)[number];

export const GRID_COLUMNS = [2, 3, 4, 5] as const;
export type GridColumns = (typeof GRID_COLUMNS)[number];

export const STOREFRONT_FONTS = ["preset", "ibm_plex", "alexandria", "readex"] as const;
export const CARD_RATIOS = ["preset", "3 / 4", "1 / 1", "4 / 5", "5 / 4"] as const;
export type StorefrontFont = (typeof STOREFRONT_FONTS)[number];
export type CardRatio = (typeof CARD_RATIOS)[number];

export const CARD_HOVER_EFFECTS = ["zoom", "lift", "glow", "none"] as const;
export type CardHoverEffect = (typeof CARD_HOVER_EFFECTS)[number];

export const ADD_TO_CART_STYLES = ["solid", "outline", "pill", "soft"] as const;
export type AddToCartStyle = (typeof ADD_TO_CART_STYLES)[number];

export const GALLERY_STYLES = ["thumbnails-bottom", "side-stack"] as const;
export type GalleryStyle = (typeof GALLERY_STYLES)[number];

export const VARIANT_SELECTOR_STYLES = ["pills", "boxed"] as const;
export type VariantSelectorStyle = (typeof VARIANT_SELECTOR_STYLES)[number];

export const STATUS_BADGE_STYLES = ["pill", "rounded", "outline"] as const;
export type StatusBadgeStyle = (typeof STATUS_BADGE_STYLES)[number];

export const CARD_ELEVATIONS = ["flat", "subtle", "elevated"] as const;
export type CardElevation = (typeof CARD_ELEVATIONS)[number];

export const HOME_SECTION_TYPES = [
  "hero_banner",
  "categories_grid",
  "featured_products",
  "promo_banner",
  "trust_features",
] as const;
export type HomeSectionType = (typeof HOME_SECTION_TYPES)[number];

export type HomeSection =
  | {
      id: string;
      type: "hero_banner";
      visible: boolean;
    }
  | {
      id: string;
      type: "categories_grid";
      visible: boolean;
      title: string;
    }
  | {
      id: string;
      type: "featured_products";
      visible: boolean;
      title: string;
      categoryId: string;
      limit: number;
    }
  | {
      id: string;
      type: "promo_banner";
      visible: boolean;
      badge: string;
      headline: string;
      subtext: string;
      ctaLabel: string;
      ctaHref: string;
      accentColor: string;
    }
  | {
      id: string;
      type: "trust_features";
      visible: boolean;
      title: string;
    };

export type GlobalUiTokens = {
  fontPair?: StorefrontFont;
  primaryButtonBg: string;
  primaryButtonText: string;
  pageBg: string;
  cardSurface: string;
  accentBadge: string;
  borderRadius: number;
  motionIntensity: MotionIntensity;
};

export type PromoBannerCampaign = {
  id: string;
  active: boolean;
  badge_ar: string;
  badge_en: string;
  title_ar: string;
  title_en: string;
  subtitle_ar: string;
  subtitle_en: string;
  cta_text_ar: string;
  cta_text_en: string;
  cta_link: string;
  image_url: string | null;
  gradient_start: string;
  gradient_end: string;
};

export type HomePageUiConfig = {
  heroLayout: HeroLayout;
  heroBg: string;
  heroText: string;
  bannerSpeedMs: number;
  categoryCardStyle: CategoryCardStyle;
  entranceAnimation: EntranceAnimation;
  // Phase 8b: Bilingual Hero Banner CMS & Visibility Controls
  hero_visible: boolean;
  hero_badge_visible: boolean;
  hero_badge_ar: string;
  hero_badge_en: string;
  hero_title_ar: string;
  hero_title_en: string;
  hero_subtitle_ar: string;
  hero_subtitle_en: string;
  hero_cta_visible: boolean;
  hero_cta_text_ar: string;
  hero_cta_text_en: string;
  hero_cta_link: string;
  hero_image_url: string | null;
  hero_overlay_opacity: number;
  // Phase 10: Multi-campaign promotional banner carousel list (backward compatible)
  promo_banners: PromoBannerCampaign[];
};

export type HeroBannerCmsConfig = Pick<
  HomePageUiConfig,
  | "hero_visible"
  | "hero_badge_visible"
  | "hero_badge_ar"
  | "hero_badge_en"
  | "hero_title_ar"
  | "hero_title_en"
  | "hero_subtitle_ar"
  | "hero_subtitle_en"
  | "hero_cta_visible"
  | "hero_cta_text_ar"
  | "hero_cta_text_en"
  | "hero_cta_link"
  | "hero_image_url"
  | "hero_overlay_opacity"
  | "promo_banners"
>;

export function defaultHeroBannerCms(): HeroBannerCmsConfig {
  return {
    hero_visible: true,
    hero_badge_visible: true,
    hero_badge_ar: "",
    hero_badge_en: "",
    hero_title_ar: "",
    hero_title_en: "",
    hero_subtitle_ar:
      "قطع منتقاة بعناية تجمع بين الأناقة الهادئة وجودة التفاصيل اليومية.",
    hero_subtitle_en:
      "Curated pieces blending quiet elegance with everyday craftsmanship.",
    hero_cta_visible: true,
    hero_cta_text_ar: "",
    hero_cta_text_en: "",
    hero_cta_link: "/products",
    hero_image_url: null,
    hero_overlay_opacity: 45,
    promo_banners: [],
  };
}

export type ProductsPageUiConfig = {
  cardAspectRatio?: CardRatio;
  gridColumns: GridColumns;
  cardHoverEffect: CardHoverEffect;
  priceBadgeColor: string;
  addToCartStyle: AddToCartStyle;
};

export type ProductDetailsPageUiConfig = {
  galleryStyle: GalleryStyle;
  ctaButtonColor: string;
  variantSelectorStyle: VariantSelectorStyle;
};

export type CartCheckoutPageUiConfig = {
  summaryCardBg: string;
  progressBarAccent: string;
  checkoutButtonColor: string;
};

export type OrdersPageUiConfig = {
  timelineActiveColor: string;
  statusBadgeStyle: StatusBadgeStyle;
  cardElevation: CardElevation;
};

export const SUPPORTED_LANGUAGES = ["ar", "en"] as const;
export type DefaultLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type StoreUiConfig = {
  version: 1;
  baseTemplate: TemplateId;
  storefrontPreset?: StorefrontPreset;
  // Older documents use values equal to the legacy template as inheritance sentinels.
  storefrontStyleVersion?: 1;
  storefrontLogo?: string;
  sticky_cta_enabled?: boolean;
  motion_enabled?: boolean;
  defaultLanguage: DefaultLanguage;
  global: GlobalUiTokens;
  homeSections: HomeSection[];
  pages: {
    home: HomePageUiConfig;
    products: ProductsPageUiConfig;
    product_details: ProductDetailsPageUiConfig;
    cart_checkout: CartCheckoutPageUiConfig;
    orders: OrdersPageUiConfig;
  };
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value.trim());
}

function pickHex(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.trim().toUpperCase() : fallback;
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

function pickGridCols(value: unknown, fallback: GridColumns, explicit: boolean): GridColumns {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 2 || n === 3 || n === 4 || (explicit && n === 5)) return n;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickText(value: unknown, fallback: string, maxLen = 120): string {
  if (typeof value !== "string") return fallback;
  const clean = value.trim().slice(0, maxLen);
  return clean || fallback;
}

function pickOptionalText(
  value: unknown,
  fallback: string,
  maxLen = 200,
): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLen);
}

function pickHeroImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, 500);
  if (!clean) return null;
  if (clean.startsWith("/") && !clean.startsWith("//")) return clean;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return clean;
    }
  } catch {}
  return null;
}

function pickSafeHref(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const clean = value.trim().slice(0, 240);
  if (clean.startsWith("/") && !clean.startsWith("//")) return clean;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return clean;
    }
  } catch {}
  return fallback;
}

function pickSectionId(value: unknown, index: number): string {
  if (typeof value === "string") {
    const clean = value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (clean) return clean;
  }
  return `sec-${index + 1}`;
}

export function defaultHomeSections(): HomeSection[] {
  return [
    { id: "sec-hero", type: "hero_banner", visible: true },
    {
      id: "sec-categories",
      type: "categories_grid",
      visible: true,
      title: "تسوّق حسب القسم",
    },
    {
      id: "sec-featured",
      type: "featured_products",
      visible: true,
      title: "أحدث المنتجات",
      categoryId: "",
      limit: 8,
    },
    {
      id: "sec-trust",
      type: "trust_features",
      visible: true,
      title: "لماذا تتسوّق معنا؟",
    },
  ];
}

export function createHomeSection(
  type: HomeSectionType,
  accentColor: string,
): HomeSection {
  const uid = `sec-${type.slice(0, 5)}-${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case "hero_banner":
      return { id: uid, type: "hero_banner", visible: true };
    case "categories_grid":
      return {
        id: uid,
        type: "categories_grid",
        visible: true,
        title: "أقسام مختارة",
      };
    case "featured_products":
      return {
        id: uid,
        type: "featured_products",
        visible: true,
        title: "الأكثر مبيعاً",
        categoryId: "",
        limit: 4,
      };
    case "promo_banner":
      return {
        id: uid,
        type: "promo_banner",
        visible: true,
        badge: "عرض لفترة محدودة",
        headline: "خصومات تصل إلى 30٪ على التشكيلة الجديدة",
        subtext: "شحن سريع لجميع المحافظات مع إمكانية الدفع عند الاستلام.",
        ctaLabel: "تسوّق العرض الآن",
        ctaHref: "/products",
        accentColor: isHexColor(accentColor) ? accentColor : "#164E63",
      };
    case "trust_features":
      return {
        id: uid,
        type: "trust_features",
        visible: true,
        title: "مميزات التسوّق معنا",
      };
  }
}

function normalizeHomeSections(
  raw: unknown,
  defaultAccent: string,
): HomeSection[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultHomeSections();
  }
  const seen = new Set<string>();
  const out: HomeSection[] = [];
  for (let i = 0; i < Math.min(raw.length, 15); i++) {
    const item = raw[i];
    if (!isRecord(item)) continue;
    const type = pickEnum(item.type, HOME_SECTION_TYPES, "featured_products");
    if (typeof item.type !== "string" || !(HOME_SECTION_TYPES as readonly string[]).includes(item.type)) {
      continue;
    }
    let id = pickSectionId(item.id, i);
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const visible = typeof item.visible === "boolean" ? item.visible : true;

    switch (type) {
      case "hero_banner":
        out.push({ id, type, visible });
        break;
      case "categories_grid":
        out.push({
          id,
          type,
          visible,
          title: pickText(item.title, "تسوّق حسب القسم", 80),
        });
        break;
      case "featured_products": {
        const rawCat = typeof item.categoryId === "string" ? item.categoryId.trim() : "";
        const categoryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCat)
          ? rawCat
          : "";
        out.push({
          id,
          type,
          visible,
          title: pickText(item.title, "أحدث المنتجات", 80),
          categoryId,
          limit: pickNumber(item.limit, 2, 12, 8),
        });
        break;
      }
      case "promo_banner":
        out.push({
          id,
          type,
          visible,
          badge: pickText(item.badge, "عرض خاص", 50),
          headline: pickText(
            item.headline,
            "خصومات حصرية على التشكيلة الجديدة",
            120,
          ),
          subtext: pickText(
            item.subtext,
            "توصيل سريع ودفع آمن عند الاستلام.",
            180,
          ),
          ctaLabel: pickText(item.ctaLabel, "تسوّق الآن", 40),
          ctaHref: pickSafeHref(item.ctaHref, "/products"),
          accentColor: pickHex(item.accentColor, defaultAccent),
        });
        break;
      case "trust_features":
        out.push({
          id,
          type,
          visible,
          title: pickText(item.title, "لماذا تتسوّق معنا؟", 80),
        });
        break;
    }
  }
  return out.length > 0 ? out : defaultHomeSections();
}

/**
 * Builds a complete StoreUiConfig starter preset from one of Codex's 4 base templates.
 */
export function uiConfigFromTemplate(id: TemplateId): StoreUiConfig {
  const t = templates[id];
  switch (id) {
    case "luxury-boutique":
      return {
        version: 1,
        baseTemplate: id,
        defaultLanguage: "ar",
        homeSections: defaultHomeSections(),
        global: {
          primaryButtonBg: t.primary,
          primaryButtonText: "#FFFDFA",
          pageBg: t.background,
          cardSurface: t.surface,
          accentBadge: t.accent,
          borderRadius: t.radius,
          motionIntensity: "subtle",
        },
        pages: {
          home: {
            ...defaultHeroBannerCms(),
            heroLayout: "full-bleed",
            heroBg: t.primary,
            heroText: "#FFFDFA",
            bannerSpeedMs: 7000,
            categoryCardStyle: "minimal",
            entranceAnimation: "fade-up",
          },
          products: {
            gridColumns: 3,
            cardHoverEffect: "lift",
            priceBadgeColor: t.accent,
            addToCartStyle: "outline",
          },
          product_details: {
            galleryStyle: "side-stack",
            ctaButtonColor: t.primary,
            variantSelectorStyle: "boxed",
          },
          cart_checkout: {
            summaryCardBg: t.surface,
            progressBarAccent: t.accent,
            checkoutButtonColor: t.primary,
          },
          orders: {
            timelineActiveColor: t.accent,
            statusBadgeStyle: "outline",
            cardElevation: "flat",
          },
        },
      };
    case "vibrant-pop":
      return {
        version: 1,
        baseTemplate: id,
        defaultLanguage: "ar",
        homeSections: defaultHomeSections(),
        global: {
          primaryButtonBg: t.primary,
          primaryButtonText: "#FFFFFF",
          pageBg: t.background,
          cardSurface: t.surface,
          accentBadge: t.accent,
          borderRadius: t.radius,
          motionIntensity: "bouncy",
        },
        pages: {
          home: {
            ...defaultHeroBannerCms(),
            heroLayout: "bento",
            heroBg: t.primary,
            heroText: "#FFFFFF",
            bannerSpeedMs: 4000,
            categoryCardStyle: "rounded-cards",
            entranceAnimation: "zoom-in",
          },
          products: {
            gridColumns: 3,
            cardHoverEffect: "glow",
            priceBadgeColor: t.accent,
            addToCartStyle: "pill",
          },
          product_details: {
            galleryStyle: "thumbnails-bottom",
            ctaButtonColor: t.accent,
            variantSelectorStyle: "pills",
          },
          cart_checkout: {
            summaryCardBg: "#FFF7FE",
            progressBarAccent: t.accent,
            checkoutButtonColor: t.primary,
          },
          orders: {
            timelineActiveColor: t.primary,
            statusBadgeStyle: "pill",
            cardElevation: "elevated",
          },
        },
      };
    case "tech-grid":
      return {
        version: 1,
        baseTemplate: id,
        defaultLanguage: "ar",
        homeSections: defaultHomeSections(),
        global: {
          primaryButtonBg: t.primary,
          primaryButtonText: "#FFFFFF",
          pageBg: t.background,
          cardSurface: t.surface,
          accentBadge: t.accent,
          borderRadius: t.radius,
          motionIntensity: "smooth",
        },
        pages: {
          home: {
            ...defaultHeroBannerCms(),
            heroLayout: "bento",
            heroBg: t.primary,
            heroText: "#FFFFFF",
            bannerSpeedMs: 5000,
            categoryCardStyle: "rounded-cards",
            entranceAnimation: "slide-rtl",
          },
          products: {
            gridColumns: 4,
            cardHoverEffect: "lift",
            priceBadgeColor: t.accent,
            addToCartStyle: "soft",
          },
          product_details: {
            galleryStyle: "side-stack",
            ctaButtonColor: t.primary,
            variantSelectorStyle: "boxed",
          },
          cart_checkout: {
            summaryCardBg: "#F3F6FC",
            progressBarAccent: t.accent,
            checkoutButtonColor: t.primary,
          },
          orders: {
            timelineActiveColor: t.primary,
            statusBadgeStyle: "rounded",
            cardElevation: "subtle",
          },
        },
      };
    case "modern-minimal":
    default:
      return {
        version: 1,
        baseTemplate: "modern-minimal",
        defaultLanguage: "ar",
        homeSections: defaultHomeSections(),
        global: {
          primaryButtonBg: t.primary,
          primaryButtonText: "#FFFFFF",
          pageBg: t.background,
          cardSurface: t.surface,
          accentBadge: t.accent,
          borderRadius: t.radius,
          motionIntensity: "smooth",
        },
        pages: {
          home: {
            ...defaultHeroBannerCms(),
            heroLayout: "split",
            heroBg: t.primary,
            heroText: "#FFFFFF",
            bannerSpeedMs: 5000,
            categoryCardStyle: "pills",
            entranceAnimation: "fade-up",
          },
          products: {
            gridColumns: 4,
            cardHoverEffect: "zoom",
            priceBadgeColor: t.primary,
            addToCartStyle: "solid",
          },
          product_details: {
            galleryStyle: "thumbnails-bottom",
            ctaButtonColor: t.primary,
            variantSelectorStyle: "pills",
          },
          cart_checkout: {
            summaryCardBg: t.surface,
            progressBarAccent: t.accent,
            checkoutButtonColor: t.primary,
          },
          orders: {
            timelineActiveColor: t.primary,
            statusBadgeStyle: "pill",
            cardElevation: "subtle",
          },
        },
      };
  }
}

export type LegacyStoreFallback = {
  template?: unknown;
  primary?: unknown;
  accent?: unknown;
  surface?: unknown;
  radius?: unknown;
};

/**
 * Safely normalizes arbitrary JSONB (store_settings.ui_config) into a complete,
 * validated StoreUiConfig, falling back gracefully to legacy columns and base templates.
 */
export function resolveUiConfig(
  raw: unknown,
  fallback: LegacyStoreFallback = {},
): StoreUiConfig {
  const input = isRecord(raw) ? raw : {};
  const templateId: TemplateId = isTemplate(input.baseTemplate)
    ? input.baseTemplate
    : isTemplate(fallback.template)
      ? fallback.template
      : "modern-minimal";

  const base = uiConfigFromTemplate(templateId);
  const rawGlobal = isRecord(input.global) ? input.global : {};
  const rawPages = isRecord(input.pages) ? input.pages : {};
  const rawHome = isRecord(rawPages.home) ? rawPages.home : {};
  const rawProducts = isRecord(rawPages.products) ? rawPages.products : {};
  const rawDetails = isRecord(rawPages.product_details)
    ? rawPages.product_details
    : {};
  const rawCart = isRecord(rawPages.cart_checkout)
    ? rawPages.cart_checkout
    : {};
  const rawOrders = isRecord(rawPages.orders) ? rawPages.orders : {};

  const fallbackPrimary = pickHex(fallback.primary, base.global.primaryButtonBg);
  const fallbackAccent = pickHex(fallback.accent, base.global.accentBadge);
  const fallbackSurface = pickHex(fallback.surface, base.global.cardSurface);
  const fallbackRadius = pickNumber(
    fallback.radius,
    0,
    24,
    base.global.borderRadius,
  );

  const primaryButtonBg = pickHex(rawGlobal.primaryButtonBg, fallbackPrimary);
  const accentBadge = pickHex(rawGlobal.accentBadge, fallbackAccent);
  const cardSurface = pickHex(rawGlobal.cardSurface, fallbackSurface);
  const sector = isStorefrontPreset(input.storefrontPreset) ? input.storefrontPreset : fallback.template;
  const logo = pickHeroImageUrl(input.storefrontLogo);

  return {
    version: 1,
    baseTemplate: templateId,
    ...(isStorefrontPreset(sector) && { storefrontPreset: sector }),
    ...(input.storefrontStyleVersion === 1 && { storefrontStyleVersion: 1 }),
    ...(logo && { storefrontLogo: logo }),
    ...(typeof input.sticky_cta_enabled === "boolean" && { sticky_cta_enabled: input.sticky_cta_enabled }),
    ...(typeof input.motion_enabled === "boolean" && { motion_enabled: input.motion_enabled }),
    defaultLanguage: pickEnum(
      input.defaultLanguage,
      SUPPORTED_LANGUAGES,
      base.defaultLanguage,
    ),
    homeSections: normalizeHomeSections(input.homeSections, accentBadge),
    global: {
      ...(input.storefrontStyleVersion === 1 && { fontPair: pickEnum(rawGlobal.fontPair, STOREFRONT_FONTS, "preset") }),
      primaryButtonBg,
      primaryButtonText: pickHex(
        rawGlobal.primaryButtonText,
        base.global.primaryButtonText,
      ),
      pageBg: pickHex(rawGlobal.pageBg, base.global.pageBg),
      cardSurface,
      accentBadge,
      borderRadius: pickNumber(rawGlobal.borderRadius, 0, 24, fallbackRadius),
      motionIntensity: pickEnum(
        rawGlobal.motionIntensity,
        MOTION_INTENSITIES,
        base.global.motionIntensity,
      ),
    },
    pages: {
      home: {
        heroLayout: pickEnum(
          rawHome.heroLayout,
          HERO_LAYOUTS,
          base.pages.home.heroLayout,
        ),
        heroBg: pickHex(
          rawHome.heroBg,
          isRecord(rawPages.home) ? base.pages.home.heroBg : primaryButtonBg,
        ),
        heroText: pickHex(rawHome.heroText, base.pages.home.heroText),
        bannerSpeedMs: pickNumber(
          rawHome.bannerSpeedMs !== undefined
            ? rawHome.bannerSpeedMs
            : typeof rawHome.banner_autoplay_seconds === "number"
              ? Math.round(rawHome.banner_autoplay_seconds * 1000)
              : undefined,
          0,
          15000,
          base.pages.home.bannerSpeedMs,
        ),
        categoryCardStyle: pickEnum(
          rawHome.categoryCardStyle,
          CATEGORY_CARD_STYLES,
          base.pages.home.categoryCardStyle,
        ),
        entranceAnimation: pickEnum(
          rawHome.entranceAnimation,
          ENTRANCE_ANIMATIONS,
          base.pages.home.entranceAnimation,
        ),
        hero_visible:
          typeof rawHome.hero_visible === "boolean"
            ? rawHome.hero_visible
            : true,
        hero_badge_visible:
          typeof rawHome.hero_badge_visible === "boolean"
            ? rawHome.hero_badge_visible
            : true,
        hero_badge_ar: pickOptionalText(rawHome.hero_badge_ar, "", 80),
        hero_badge_en: pickOptionalText(rawHome.hero_badge_en, "", 80),
        hero_title_ar: pickOptionalText(rawHome.hero_title_ar, "", 120),
        hero_title_en: pickOptionalText(rawHome.hero_title_en, "", 120),
        hero_subtitle_ar: pickOptionalText(
          rawHome.hero_subtitle_ar,
          base.pages.home.hero_subtitle_ar,
          260,
        ),
        hero_subtitle_en: pickOptionalText(
          rawHome.hero_subtitle_en,
          base.pages.home.hero_subtitle_en,
          260,
        ),
        hero_cta_visible:
          typeof rawHome.hero_cta_visible === "boolean"
            ? rawHome.hero_cta_visible
            : true,
        hero_cta_text_ar: pickOptionalText(rawHome.hero_cta_text_ar, "", 60),
        hero_cta_text_en: pickOptionalText(rawHome.hero_cta_text_en, "", 60),
        hero_cta_link: pickSafeHref(rawHome.hero_cta_link, "/products"),
        hero_image_url: pickHeroImageUrl(rawHome.hero_image_url),
        hero_overlay_opacity: pickNumber(
          rawHome.hero_overlay_opacity,
          0,
          80,
          45,
        ),
        promo_banners: Array.isArray(rawHome.promo_banners)
          ? rawHome.promo_banners
              .filter(isRecord)
              .slice(0, 12)
              .map((item, idx): PromoBannerCampaign => ({
                id: pickOptionalText(item.id, `promo-${idx + 1}`, 60) || `promo-${idx + 1}`,
                active: typeof item.active === "boolean" ? item.active : true,
                badge_ar: pickOptionalText(item.badge_ar, "", 60),
                badge_en: pickOptionalText(item.badge_en, "", 60),
                title_ar: pickOptionalText(item.title_ar, "", 120),
                title_en: pickOptionalText(item.title_en, "", 120),
                subtitle_ar: pickOptionalText(item.subtitle_ar, "", 240),
                subtitle_en: pickOptionalText(item.subtitle_en, "", 240),
                cta_text_ar: pickOptionalText(item.cta_text_ar, "", 60),
                cta_text_en: pickOptionalText(item.cta_text_en, "", 60),
                cta_link: pickSafeHref(item.cta_link, "/products"),
                image_url: pickHeroImageUrl(item.image_url),
                gradient_start: pickHex(item.gradient_start, primaryButtonBg),
                gradient_end: pickHex(item.gradient_end, accentBadge),
              }))
          : [],
      },
      products: {
        ...(input.storefrontStyleVersion === 1 && { cardAspectRatio: pickEnum(rawProducts.cardAspectRatio, CARD_RATIOS, "preset") }),
        gridColumns: pickGridCols(
          rawProducts.gridColumns,
          base.pages.products.gridColumns,
          input.storefrontStyleVersion === 1,
        ),
        cardHoverEffect: pickEnum(
          rawProducts.cardHoverEffect,
          CARD_HOVER_EFFECTS,
          base.pages.products.cardHoverEffect,
        ),
        priceBadgeColor: pickHex(
          rawProducts.priceBadgeColor,
          isRecord(rawPages.products)
            ? base.pages.products.priceBadgeColor
            : primaryButtonBg,
        ),
        addToCartStyle: pickEnum(
          rawProducts.addToCartStyle,
          ADD_TO_CART_STYLES,
          base.pages.products.addToCartStyle,
        ),
      },
      product_details: {
        galleryStyle: pickEnum(
          rawDetails.galleryStyle,
          GALLERY_STYLES,
          base.pages.product_details.galleryStyle,
        ),
        ctaButtonColor: pickHex(
          rawDetails.ctaButtonColor,
          isRecord(rawPages.product_details)
            ? base.pages.product_details.ctaButtonColor
            : primaryButtonBg,
        ),
        variantSelectorStyle: pickEnum(
          rawDetails.variantSelectorStyle,
          VARIANT_SELECTOR_STYLES,
          base.pages.product_details.variantSelectorStyle,
        ),
      },
      cart_checkout: {
        summaryCardBg: pickHex(
          rawCart.summaryCardBg,
          isRecord(rawPages.cart_checkout)
            ? base.pages.cart_checkout.summaryCardBg
            : cardSurface,
        ),
        progressBarAccent: pickHex(
          rawCart.progressBarAccent,
          isRecord(rawPages.cart_checkout)
            ? base.pages.cart_checkout.progressBarAccent
            : accentBadge,
        ),
        checkoutButtonColor: pickHex(
          rawCart.checkoutButtonColor,
          isRecord(rawPages.cart_checkout)
            ? base.pages.cart_checkout.checkoutButtonColor
            : primaryButtonBg,
        ),
      },
      orders: {
        timelineActiveColor: pickHex(
          rawOrders.timelineActiveColor,
          isRecord(rawPages.orders)
            ? base.pages.orders.timelineActiveColor
            : primaryButtonBg,
        ),
        statusBadgeStyle: pickEnum(
          rawOrders.statusBadgeStyle,
          STATUS_BADGE_STYLES,
          base.pages.orders.statusBadgeStyle,
        ),
        cardElevation: pickEnum(
          rawOrders.cardElevation,
          CARD_ELEVATIONS,
          base.pages.orders.cardElevation,
        ),
      },
    },
  };
}

const MOTION_TOKENS: Record<
  MotionIntensity,
  { duration: string; ease: string; entranceDuration: string }
> = {
  none: {
    duration: "0ms",
    ease: "linear",
    entranceDuration: "0ms",
  },
  subtle: {
    duration: "180ms",
    ease: "ease-out",
    entranceDuration: "280ms",
  },
  smooth: {
    duration: "300ms",
    ease: "cubic-bezier(0.22, 1, 0.36, 1)",
    entranceDuration: "460ms",
  },
  bouncy: {
    duration: "420ms",
    ease: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    entranceDuration: "580ms",
  },
};

export function uiConfigToCssVars(config: StoreUiConfig): CSSProperties {
  const motion = MOTION_TOKENS[config.global.motionIntensity];
  return {
    ...templateVars(config.baseTemplate),
    "--primary": config.global.primaryButtonBg,
    "--primary-ink": config.global.primaryButtonText,
    "--secondary": config.global.accentBadge,
    "--paper": config.global.cardSurface,
    "--template-bg": config.global.pageBg,
    "--radius": `${config.global.borderRadius}px`,
    "--motion-duration": motion.duration,
    "--motion-ease": motion.ease,
    "--entrance-duration": motion.entranceDuration,
    "--hero-bg": config.pages.home.heroBg,
    "--hero-text": config.pages.home.heroText,
    "--products-cols": String(config.pages.products.gridColumns),
    "--price-badge": config.pages.products.priceBadgeColor,
    "--detail-cta-bg": config.pages.product_details.ctaButtonColor,
    "--cart-summary-bg": config.pages.cart_checkout.summaryCardBg,
    "--cart-progress-accent": config.pages.cart_checkout.progressBarAccent,
    "--checkout-btn-bg": config.pages.cart_checkout.checkoutButtonColor,
    "--order-timeline-active": config.pages.orders.timelineActiveColor,
  } as CSSProperties;
}

export function uiConfigDataAttrs(config: StoreUiConfig) {
  return {
    "data-template": config.baseTemplate,
    "data-motion": config.global.motionIntensity,
    "data-hero-layout": config.pages.home.heroLayout,
    "data-cat-style": config.pages.home.categoryCardStyle,
    "data-entrance":
      config.global.motionIntensity === "none"
        ? "none"
        : config.pages.home.entranceAnimation,
    "data-grid-cols": String(config.pages.products.gridColumns),
    "data-card-hover":
      config.global.motionIntensity === "none"
        ? "none"
        : config.pages.products.cardHoverEffect,
    "data-atc-style": config.pages.products.addToCartStyle,
    "data-gallery-style": config.pages.product_details.galleryStyle,
    "data-variant-style": config.pages.product_details.variantSelectorStyle,
    "data-badge-style": config.pages.orders.statusBadgeStyle,
    "data-order-elevation": config.pages.orders.cardElevation,
  } as const;
}

export { templates, isTemplate, type TemplateId };
