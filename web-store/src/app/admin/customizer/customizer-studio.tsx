"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Palette,
  Monitor,
  Smartphone,
  Sparkles,
  Home,
  LayoutGrid,
  Package,
  ShoppingCart,
  Truck,
  Check,
  RotateCcw,
  Save,
  ExternalLink,
  Play,
  Layers,
  ListOrdered,
  Upload,
  Trash2,
  ImageIcon,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Images,
} from "lucide-react";
import {
  templates,
  uiConfigFromTemplate,
  isHexColor,
  type StoreUiConfig,
  type HomeSection,
  type TemplateId,
  type MotionIntensity,
  type HeroLayout,
  type CategoryCardStyle,
  type EntranceAnimation,
  type GridColumns,
  type CardHoverEffect,
  type AddToCartStyle,
  type GalleryStyle,
  type VariantSelectorStyle,
  type StatusBadgeStyle,
  type CardElevation,
  type DefaultLanguage,
} from "@/lib/ui-config";
import { useLanguage } from "@/components/language-provider";
import { saveUiConfig, uploadHeroBannerImage } from "../mutations";
import { markOnboardingStepDone } from "../onboarding-store";
import {
  PreviewFrame,
  type PreviewPageKey,
  type PreviewProduct,
  type PreviewCategory,
} from "./preview-frame";
import { SectionsBuilder } from "./sections-builder";
import { PromoBannersEditor } from "./promo-banners-editor";
import "./customizer.css";

type StudioTab = "theme" | "banners" | "page";
type ActivePageMode = PreviewPageKey | "sections";

const STUDIO_TABS: {
  key: StudioTab;
  label_ar: string;
  label_en: string;
  icon: typeof Palette;
}[] = [
  { key: "theme", label_ar: "المظهر والقوالب", label_en: "Theme & Presets", icon: Palette },
  { key: "banners", label_ar: "البانرات والعروض", label_en: "Banners & Carousel", icon: Images },
  { key: "page", label_ar: "تخصيص الصفحة", label_en: "Page Settings", icon: SlidersHorizontal },
];

const PAGE_SWITCHER_ITEMS: {
  key: ActivePageMode;
  previewKey: PreviewPageKey;
  url: string;
  label_ar: string;
  label_en: string;
  badge_ar: string;
  badge_en: string;
  icon: typeof Home;
}[] = [
  {
    key: "home",
    previewKey: "home",
    url: "/",
    label_ar: "الرئيسية",
    label_en: "Home",
    badge_ar: "الصفحة الرئيسية",
    badge_en: "Home Page",
    icon: Home,
  },
  {
    key: "sections",
    previewKey: "home",
    url: "/#sections",
    label_ar: "الأقسام",
    label_en: "Sections",
    badge_ar: "أقسام الرئيسية",
    badge_en: "Home Sections",
    icon: ListOrdered,
  },
  {
    key: "products",
    previewKey: "products",
    url: "/products",
    label_ar: "المنتجات",
    label_en: "Products",
    badge_ar: "صفحة المنتجات",
    badge_en: "Products Page",
    icon: LayoutGrid,
  },
  {
    key: "product_details",
    previewKey: "product_details",
    url: "/products/preview",
    label_ar: "التفاصيل",
    label_en: "Details",
    badge_ar: "تفاصيل المنتج",
    badge_en: "Product Details",
    icon: Package,
  },
  {
    key: "cart_checkout",
    previewKey: "cart_checkout",
    url: "/checkout",
    label_ar: "السلة",
    label_en: "Bag",
    badge_ar: "السلة والدفع",
    badge_en: "Cart & Checkout",
    icon: ShoppingCart,
  },
  {
    key: "orders",
    previewKey: "orders",
    url: "/orders",
    label_ar: "الطلبات",
    label_en: "Orders",
    badge_ar: "تتبع الطلبات",
    badge_en: "Order Tracking",
    icon: Truck,
  },
];

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = (draft ?? value).toUpperCase();

  return (
    <label className="color-picker-box">
      <span>{label}</span>
      <div className="color-picker-input-row">
        <input
          type="color"
          aria-label={label}
          value={isHexColor(value) ? value : "#164E63"}
          onChange={(e) => {
            const next = e.target.value.toUpperCase();
            setDraft(null);
            onChange(next);
          }}
        />
        <input
          type="text"
          dir="ltr"
          maxLength={7}
          aria-label={label + " (Hex)"}
          value={shown}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (isHexColor(raw)) {
              setDraft(null);
              onChange(raw.toUpperCase());
            } else {
              setDraft(raw);
            }
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
    </label>
  );
}

export function CustomizerStudio({
  storeId,
  initialConfig,
  storeName,
  currency,
  shippingFee,
  banners,
  products,
  categories,
}: {
  storeId: string;
  initialConfig: StoreUiConfig;
  storeName: string;
  currency: string;
  shippingFee: number;
  banners: string[];
  products: PreviewProduct[];
  categories: PreviewCategory[];
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const [config, setConfig] = useState<StoreUiConfig>(initialConfig);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(initialConfig),
  );
  const [studioTab, setStudioTab] = useState<StudioTab>("theme");
  const [activePage, setActivePage] = useState<ActivePageMode>("home");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [layoutCardOpen, setLayoutCardOpen] = useState(true);
  const [fallbackHeroOpen, setFallbackHeroOpen] = useState(
    () => (initialConfig.pages.home.promo_banners ?? []).filter((b) => b.active).length === 0,
  );
  const [animSeed, setAnimSeed] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const [uploadingHeroImg, setUploadingHeroImg] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty = JSON.stringify(config) !== savedSnapshot;
  const activePageMeta =
    PAGE_SWITCHER_ITEMS.find((p) => p.key === activePage) ??
    PAGE_SWITCHER_ITEMS[0];
  const previewPage: PreviewPageKey = activePageMeta.previewKey;
  const ActivePageIcon = activePageMeta.icon;

  const updateGlobal = <K extends keyof StoreUiConfig["global"]>(
    key: K,
    value: StoreUiConfig["global"][K],
  ) => {
    setConfig((prev) => ({
      ...prev,
      global: { ...prev.global, [key]: value },
    }));
    setFeedback(null);
  };

  const updateHome = <K extends keyof StoreUiConfig["pages"]["home"]>(
    key: K,
    value: StoreUiConfig["pages"]["home"][K],
  ) => {
    setConfig((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        home: { ...prev.pages.home, [key]: value },
      },
    }));
    setFeedback(null);
  };

  const updateProducts = <K extends keyof StoreUiConfig["pages"]["products"]>(
    key: K,
    value: StoreUiConfig["pages"]["products"][K],
  ) => {
    setConfig((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        products: { ...prev.pages.products, [key]: value },
      },
    }));
    setFeedback(null);
  };

  const updateDetails = <
    K extends keyof StoreUiConfig["pages"]["product_details"],
  >(
    key: K,
    value: StoreUiConfig["pages"]["product_details"][K],
  ) => {
    setConfig((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        product_details: { ...prev.pages.product_details, [key]: value },
      },
    }));
    setFeedback(null);
  };

  const updateCart = <K extends keyof StoreUiConfig["pages"]["cart_checkout"]>(
    key: K,
    value: StoreUiConfig["pages"]["cart_checkout"][K],
  ) => {
    setConfig((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        cart_checkout: { ...prev.pages.cart_checkout, [key]: value },
      },
    }));
    setFeedback(null);
  };

  const updateOrders = <K extends keyof StoreUiConfig["pages"]["orders"]>(
    key: K,
    value: StoreUiConfig["pages"]["orders"][K],
  ) => {
    setConfig((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        orders: { ...prev.pages.orders, [key]: value },
      },
    }));
    setFeedback(null);
  };

  const updateHomeSections = (homeSections: HomeSection[]) => {
    setConfig((prev) => ({
      ...prev,
      homeSections,
    }));
    setFeedback(null);
  };

  const handleLoadPreset = (id: TemplateId) => {
    setConfig((prev) => {
      const next = uiConfigFromTemplate(id);
      const prevHome = prev.pages.home;
      return {
        ...next,
        defaultLanguage: prev.defaultLanguage,
        homeSections: prev.homeSections,
        pages: {
          ...next.pages,
          home: {
            ...next.pages.home,
            hero_visible: prevHome.hero_visible,
            hero_badge_visible: prevHome.hero_badge_visible,
            hero_badge_ar: prevHome.hero_badge_ar,
            hero_badge_en: prevHome.hero_badge_en,
            hero_title_ar: prevHome.hero_title_ar,
            hero_title_en: prevHome.hero_title_en,
            hero_subtitle_ar: prevHome.hero_subtitle_ar,
            hero_subtitle_en: prevHome.hero_subtitle_en,
            hero_cta_visible: prevHome.hero_cta_visible,
            hero_cta_text_ar: prevHome.hero_cta_text_ar,
            hero_cta_text_en: prevHome.hero_cta_text_en,
            hero_cta_link: prevHome.hero_cta_link,
            hero_image_url: prevHome.hero_image_url,
            hero_overlay_opacity: prevHome.hero_overlay_opacity,
            promo_banners: prevHome.promo_banners,
          },
        },
      };
    });
    setAnimSeed((s) => s + 1);
    setFeedback(null);
  };

  const toggleHeroVisible = (visible: boolean) => {
    setConfig((prev) => ({
      ...prev,
      homeSections: prev.homeSections.map((sec) =>
        sec.type === "hero_banner" ? { ...sec, visible } : sec,
      ),
      pages: {
        ...prev.pages,
        home: { ...prev.pages.home, hero_visible: visible },
      },
    }));
    setFeedback(null);
  };

  const handleHeroImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingHeroImg(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadHeroBannerImage(fd);
      if (res.ok) {
        updateHome("hero_image_url", res.url);
      } else {
        setFeedback({
          type: "error",
          text: isEn
            ? "Could not upload banner image (PNG, JPG, or WEBP up to 5 MB)."
            : "تعذر رفع صورة البانر (يجب أن تكون PNG أو JPG أو WEBP بحد أقصى 5 م.ب).",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: isEn
          ? "Banner upload failed. Please try again."
          : "حدث خطأ أثناء رفع صورة البانر. حاول مرة أخرى.",
      });
    } finally {
      setUploadingHeroImg(false);
    }
  };

  const handleSelectStudioTab = (tab: StudioTab) => {
    setStudioTab(tab);
    if (tab === "banners" && previewPage !== "home") {
      setActivePage("home");
    }
  };

  const handleSelectPreviewPage = (next: ActivePageMode) => {
    setActivePage(next);
    setStudioTab("page");
  };

  const handlePublish = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveUiConfig(config);
      if (res.ok) {
        markOnboardingStepDone(storeId, "customizerDone", true);
        setConfig(res.config);
        setSavedSnapshot(JSON.stringify(res.config));
        setFeedback({
          type: "ok",
          text: isEn
            ? "Changes saved and published to the live storefront and Android app."
            : "تم حفظ ونشر التعديلات بنجاح وتحديث المتجر وتطبيق الأندرويد.",
        });
      } else {
        setFeedback({ type: "error", text: isEn ? "Could not publish your changes. Please try again." : "تعذر نشر التغييرات. حاول مرة أخرى." });
      }
    });
  };

  return (
    <div className="customizer-studio">
      {/* Compact Top Studio Action Bar */}
      <header className="customizer-topbar">
        <div className="customizer-topbar-title">
          <div className="customizer-title-row">
            <h1>
              <Sparkles size={20} />{" "}
              {isEn ? "Theme & Storefront Studio" : "استوديو تخصيص المتجر"}
            </h1>
            <span
              className={
                "customizer-status-pill " +
                (isDirty
                  ? "customizer-status-pill--dirty"
                  : "customizer-status-pill--synced")
              }
            >
              {isDirty
                ? isEn
                  ? "Unsaved"
                  : "غير محفوظ"
                : isEn
                  ? "Published"
                  : "منشور ومتزامن"}
            </span>
          </div>
          <small>
            {isEn
              ? "Customize theme, hero carousel slides, and per-page styling with instant Web & Android sync."
              : "عدّل القالب وبانرات الكاروسيل وإعدادات كل صفحة مع معاينة فورية وتزامن مباشر للموقع والتطبيق."}
          </small>
        </div>

        <div className="customizer-topbar-actions">
          <button
            type="button"
            className="customizer-btn-secondary"
            aria-pressed={expandedPreview}
            onClick={() => setExpandedPreview((prev) => !prev)}
          >
            {expandedPreview ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>
              {expandedPreview
                ? isEn
                  ? "Show Controls"
                  : "إظهار الأدوات"
                : isEn
                  ? "Expand Preview"
                  : "توسيع المعاينة"}
            </span>
          </button>

          <button
            type="button"
            className="customizer-btn-secondary"
            onClick={() => handleLoadPreset(config.baseTemplate)}
            title={isEn ? "Reset current preset" : "إعادة ضبط إعدادات القالب الحالي"}
          >
            <RotateCcw size={15} /> {isEn ? "Reset" : "إعادة ضبط"}
          </button>

          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            className="customizer-btn-secondary"
          >
            <ExternalLink size={15} /> {isEn ? "Live Store" : "المتجر الحي"}
          </Link>

          <button
            type="button"
            className="customizer-btn-publish"
            onClick={handlePublish}
            disabled={isPending}
          >
            <Save size={16} />
            {isPending
              ? isEn
                ? "Publishing…"
                : "جارٍ الحفظ…"
              : isEn
                ? "Save & Publish"
                : "حفظ ونشر التعديلات"}
          </button>
        </div>
      </header>

      {feedback && (
        <div
          role="status"
          className={
            "customizer-banner " +
            (feedback.type === "ok"
              ? "customizer-banner--ok"
              : "customizer-banner--error")
          }
        >
          <span>{feedback.text}</span>
          {feedback.type === "ok" && (
            <Link href="/" target="_blank" rel="noreferrer">
              {isEn ? "Open Live Store ↗" : "افتح المتجر للمعاينة ↗"}
            </Link>
          )}
        </div>
      )}

      {/* Streamlined Split-Screen Workspace */}
      <div
        className={
          "customizer-split " +
          (expandedPreview ? "customizer-split--expanded" : "")
        }
      >
        {!expandedPreview && (
          <section
            className="customizer-controls"
            aria-label={isEn ? "Theme customization controls" : "أدوات تخصيص التصميم"}
          >
            {/* Pinned 3 Top-Level Studio Tabs */}
            <div className="studio-tabs-sticky">
              <div
                className="studio-top-tabs"
                role="tablist"
                aria-label={isEn ? "Studio panels" : "أقسام التخصيص الرئيسية"}
              >
                {STUDIO_TABS.map(({ key, label_ar, label_en, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={studioTab === key}
                    className="studio-top-tab"
                    onClick={() => handleSelectStudioTab(key)}
                  >
                    <Icon size={15} />
                    <span>{isEn ? label_en : label_ar}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="customizer-controls-body">
              {/* TAB 1: THEME & PRESETS */}
              {studioTab === "theme" && (
                <div className="control-stack">
                  <div>
                    <div className="customizer-section-head">
                      <h2>
                        <Layers size={15} />{" "}
                        {isEn ? "Quick-Start Templates" : "قوالب البدء السريع"}
                      </h2>
                      <small>{isEn ? "4 ready presets" : "4 قوالب جاهزة"}</small>
                    </div>
                    <div className="preset-grid">
                      {(Object.keys(templates) as TemplateId[]).map((id) => {
                        const tpl = templates[id];
                        const active = config.baseTemplate === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            className="preset-card"
                            aria-pressed={active}
                            onClick={() => handleLoadPreset(id)}
                          >
                            <span className="preset-card-top">
                              <span>{isEn ? tpl.title_en : tpl.title}</span>
                              {active && <Check size={14} />}
                            </span>
                            <span className="preset-swatches" aria-hidden="true">
                              <i style={{ background: tpl.primary }} />
                              <i style={{ background: tpl.accent }} />
                              <i style={{ background: tpl.background }} />
                              <i style={{ background: tpl.surface }} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="control-field">
                    <div className="control-label-row">
                      <span>
                        {isEn
                          ? "Default Storefront Language"
                          : "اللغة الافتراضية للمتجر"}
                      </span>
                    </div>
                    <div className="choice-row">
                      {(
                        [
                          ["ar", isEn ? "Arabic (RTL)" : "العربية (RTL)"],
                          ["en", isEn ? "English (LTR)" : "الإنجليزية (LTR)"],
                        ] as [DefaultLanguage, string][]
                      ).map(([val, lbl]) => (
                        <button
                          key={val}
                          type="button"
                          className="choice-pill"
                          aria-pressed={config.defaultLanguage === val}
                          onClick={() => {
                            setConfig((prev) => ({
                              ...prev,
                              defaultLanguage: val,
                            }));
                            setFeedback(null);
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="color-grid">
                    <ColorControl
                      label={isEn ? "Primary Button Color" : "لون الزر الأساسي"}
                      value={config.global.primaryButtonBg}
                      onChange={(v) => updateGlobal("primaryButtonBg", v)}
                    />
                    <ColorControl
                      label={isEn ? "Primary Button Text" : "لون نص الزر الأساسي"}
                      value={config.global.primaryButtonText}
                      onChange={(v) => updateGlobal("primaryButtonText", v)}
                    />
                    <ColorControl
                      label={isEn ? "Page Background" : "خلفية الصفحة"}
                      value={config.global.pageBg}
                      onChange={(v) => updateGlobal("pageBg", v)}
                    />
                    <ColorControl
                      label={isEn ? "Card Surface" : "خلفية البطاقات"}
                      value={config.global.cardSurface}
                      onChange={(v) => updateGlobal("cardSurface", v)}
                    />
                    <ColorControl
                      label={isEn ? "Accent Badge Color" : "لون الشارات المميزة"}
                      value={config.global.accentBadge}
                      onChange={(v) => updateGlobal("accentBadge", v)}
                    />
                  </div>

                  <div className="control-field">
                    <div className="control-label-row">
                      <label htmlFor="radius-slider">
                        {isEn ? "Corner Border Radius" : "استدارة الحواف"}
                      </label>
                      <output htmlFor="radius-slider">
                        {config.global.borderRadius}px
                      </output>
                    </div>
                    <input
                      id="radius-slider"
                      type="range"
                      className="range-input"
                      min={0}
                      max={24}
                      step={1}
                      value={config.global.borderRadius}
                      onChange={(e) =>
                        updateGlobal("borderRadius", Number(e.target.value))
                      }
                    />
                  </div>

                  <div className="control-field">
                    <div className="control-label-row">
                      <span>
                        {isEn ? "Global Motion Intensity" : "شدة الحركة العامة"}
                      </span>
                    </div>
                    <div className="choice-row">
                      {(
                        [
                          ["none", isEn ? "None" : "بدون"],
                          ["subtle", isEn ? "Subtle" : "هادئة"],
                          ["smooth", isEn ? "Smooth" : "سلسة"],
                          ["bouncy", isEn ? "Bouncy" : "مرنة"],
                        ] as [MotionIntensity, string][]
                      ).map(([val, lbl]) => (
                        <button
                          key={val}
                          type="button"
                          className="choice-pill"
                          aria-pressed={config.global.motionIntensity === val}
                          onClick={() => updateGlobal("motionIntensity", val)}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="theme-reset-footer">
                    <button
                      type="button"
                      className="customizer-btn-secondary"
                      onClick={() => handleLoadPreset(config.baseTemplate)}
                    >
                      <RotateCcw size={14} />
                      <span>
                        {isEn
                          ? "Reset Theme Defaults"
                          : "استعادة افتراضيات القالب"}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: BANNERS & CAROUSEL */}
              {studioTab === "banners" && (
                <div className="control-stack">
                  {/* Right at the top: Promotional Banner Carousel Manager */}
                  <PromoBannersEditor
                    banners={config.pages.home.promo_banners}
                    categories={categories}
                    isEn={isEn}
                    onChange={(nextBanners) =>
                      updateHome("promo_banners", nextBanners)
                    }
                    onError={(msg) => setFeedback({ type: "error", text: msg })}
                  />

                  {/* Expandable Sub-Card: Hero Layout, Colors & Auto-Play Speed */}
                  <div className="collapsible-subcard">
                    <button
                      type="button"
                      className="collapsible-subcard-trigger"
                      aria-expanded={layoutCardOpen}
                      onClick={() => setLayoutCardOpen((o) => !o)}
                    >
                      <span>
                        <strong>
                          {isEn
                            ? "Hero Layout, Colors & Auto-Play"
                            : "تخطيط البانر والألوان وسرعة التبديل"}
                        </strong>
                        <small>
                          {isEn
                            ? "Speed, scrim darkness, layout & visibility"
                            : "السرعة والتعتيم والتخطيط وإظهار/إخفاء البانر"}
                        </small>
                      </span>
                      {layoutCardOpen ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>

                    {layoutCardOpen && (
                      <div className="collapsible-subcard-body">
                        <button
                          type="button"
                          className={`hero-master-toggle ${config.pages.home.hero_visible ? "is-on" : ""}`}
                          aria-pressed={config.pages.home.hero_visible}
                          onClick={() =>
                            toggleHeroVisible(!config.pages.home.hero_visible)
                          }
                        >
                          {config.pages.home.hero_visible ? (
                            <Eye size={14} />
                          ) : (
                            <EyeOff size={14} />
                          )}
                          <span>
                            {isEn
                              ? "Show Hero / Carousel on Storefront"
                              : "إظهار البانر والكاروسيل في المتجر"}
                          </span>
                        </button>

                        <div className="control-field">
                          <div className="control-label-row">
                            <label htmlFor="banner-speed">
                              {isEn
                                ? "Banner Auto-Play Speed"
                                : "سرعة التبديل التلقائي للبانر"}
                            </label>
                            <output htmlFor="banner-speed">
                              {config.pages.home.bannerSpeedMs === 0
                                ? isEn
                                  ? "Off"
                                  : "متوقف"
                                : `${(config.pages.home.bannerSpeedMs / 1000).toFixed(1)} ${isEn ? "s" : "ث"}`}
                            </output>
                          </div>
                          <input
                            id="banner-speed"
                            type="range"
                            className="range-input"
                            min={0}
                            max={10000}
                            step={500}
                            value={config.pages.home.bannerSpeedMs}
                            onChange={(e) =>
                              updateHome("bannerSpeedMs", Number(e.target.value))
                            }
                          />
                        </div>

                        <div className="control-field">
                          <div className="control-label-row">
                            <label htmlFor="hero-overlay-opacity">
                              {isEn
                                ? "Image Scrim Darkness"
                                : "درجة تعتيم خلفية الصور"}
                            </label>
                            <output htmlFor="hero-overlay-opacity">
                              {config.pages.home.hero_overlay_opacity}%
                            </output>
                          </div>
                          <input
                            id="hero-overlay-opacity"
                            type="range"
                            className="range-input"
                            min={0}
                            max={80}
                            step={5}
                            value={config.pages.home.hero_overlay_opacity}
                            onChange={(e) =>
                              updateHome(
                                "hero_overlay_opacity",
                                Number(e.target.value),
                              )
                            }
                          />
                        </div>

                        <div className="control-field">
                          <div className="control-label-row">
                            <span>
                              {isEn ? "Hero Banner Layout" : "تخطيط البانر الرئيسي"}
                            </span>
                          </div>
                          <div className="choice-row">
                            {(
                              [
                                ["split", isEn ? "Split" : "مقسّم"],
                                ["full-bleed", isEn ? "Full Bleed" : "عرض كامل"],
                                ["bento", isEn ? "Bento Grid" : "شبكة متعددة"],
                              ] as [HeroLayout, string][]
                            ).map(([val, lbl]) => (
                              <button
                                key={val}
                                type="button"
                                className="choice-pill"
                                aria-pressed={config.pages.home.heroLayout === val}
                                onClick={() => updateHome("heroLayout", val)}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="color-grid">
                          <ColorControl
                            label={
                              isEn ? "Hero Background" : "لون خلفية البانر"
                            }
                            value={config.pages.home.heroBg}
                            onChange={(v) => updateHome("heroBg", v)}
                          />
                          <ColorControl
                            label={isEn ? "Hero Text Color" : "لون نص البانر"}
                            value={config.pages.home.heroText}
                            onChange={(v) => updateHome("heroText", v)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Collapsible Sub-Card: Fallback Single Hero Banner Content (100% backward compatible) */}
                  <div className="collapsible-subcard">
                    <button
                      type="button"
                      className="collapsible-subcard-trigger"
                      aria-expanded={fallbackHeroOpen}
                      onClick={() => setFallbackHeroOpen((o) => !o)}
                    >
                      <span>
                        <strong>
                          {isEn
                            ? "Fallback Single Hero Banner"
                            : "محتوى البانر المفرد الاحتياطي"}
                        </strong>
                        <small>
                          {isEn
                            ? "Used automatically if all carousel slides are hidden or deleted"
                            : "يُعرض تلقائياً عند إخفاء أو حذف جميع شرائح الكاروسيل"}
                        </small>
                      </span>
                      {fallbackHeroOpen ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>

                    {fallbackHeroOpen && (
                      <div className="collapsible-subcard-body">
                        <div className="hero-cms-group" style={{ borderTop: 0, paddingTop: 0 }}>
                          <label className="hero-cms-check">
                            <input
                              type="checkbox"
                              checked={config.pages.home.hero_badge_visible}
                              onChange={(e) =>
                                updateHome("hero_badge_visible", e.target.checked)
                              }
                            />
                            <span>
                              {isEn ? "Show Promo Badge" : "إظهار شارة العرض"}
                            </span>
                          </label>
                          {config.pages.home.hero_badge_visible && (
                            <div className="hero-cms-pair promo-pair-cols">
                              <label className="hero-cms-field">
                                <span>
                                  {isEn ? "Promo Badge (AR)" : "شارة العرض (عربي)"}
                                </span>
                                <input
                                  type="text"
                                  value={config.pages.home.hero_badge_ar}
                                  onChange={(e) =>
                                    updateHome("hero_badge_ar", e.target.value)
                                  }
                                  placeholder={
                                    isEn
                                      ? "Default seasonal badge"
                                      : "الشارة الموسمية الافتراضية"
                                  }
                                />
                              </label>
                              <label className="hero-cms-field">
                                <span>
                                  {isEn
                                    ? "Promo Badge (EN)"
                                    : "شارة العرض (إنجليزي)"}
                                </span>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={config.pages.home.hero_badge_en}
                                  onChange={(e) =>
                                    updateHome("hero_badge_en", e.target.value)
                                  }
                                  placeholder={
                                    isEn ? "Season Collection" : "مثال: تشكيلة الموسم"
                                  }
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <div className="hero-cms-group">
                          <div className="hero-cms-pair promo-pair-cols">
                            <label className="hero-cms-field">
                              <span>
                                {isEn
                                  ? "Main Headline (AR)"
                                  : "العنوان الرئيسي (عربي)"}
                              </span>
                              <input
                                type="text"
                                value={config.pages.home.hero_title_ar}
                                onChange={(e) =>
                                  updateHome("hero_title_ar", e.target.value)
                                }
                                placeholder={
                                  isEn
                                    ? "Default Arabic headline"
                                    : "اكتشف مجموعة المتجر"
                                }
                              />
                            </label>
                            <label className="hero-cms-field">
                              <span>
                                {isEn
                                  ? "Main Headline (EN)"
                                  : "العنوان الرئيسي (إنجليزي)"}
                              </span>
                              <input
                                type="text"
                                dir="ltr"
                                value={config.pages.home.hero_title_en}
                                onChange={(e) =>
                                  updateHome("hero_title_en", e.target.value)
                                }
                                placeholder={
                                  isEn
                                    ? "Discover our collection"
                                    : "عنوان البانر بالإنجليزية"
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <div className="hero-cms-group">
                          <div className="hero-cms-pair">
                            <label className="hero-cms-field">
                              <span>
                                {isEn
                                  ? "Subtitle (AR · leave empty to hide)"
                                  : "الوصف الفرعي (عربي · اتركه فارغاً للإخفاء)"}
                              </span>
                              <textarea
                                rows={2}
                                value={config.pages.home.hero_subtitle_ar}
                                onChange={(e) =>
                                  updateHome("hero_subtitle_ar", e.target.value)
                                }
                              />
                            </label>
                            <label className="hero-cms-field">
                              <span>
                                {isEn
                                  ? "Subtitle (EN · leave empty to hide)"
                                  : "الوصف الفرعي (إنجليزي · اتركه فارغاً للإخفاء)"}
                              </span>
                              <textarea
                                rows={2}
                                dir="ltr"
                                value={config.pages.home.hero_subtitle_en}
                                onChange={(e) =>
                                  updateHome("hero_subtitle_en", e.target.value)
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <div className="hero-cms-group">
                          <label className="hero-cms-check">
                            <input
                              type="checkbox"
                              checked={config.pages.home.hero_cta_visible}
                              onChange={(e) =>
                                updateHome("hero_cta_visible", e.target.checked)
                              }
                            />
                            <span>
                              {isEn
                                ? "Show CTA Button"
                                : "إظهار زر الدعوة للتسوّق"}
                            </span>
                          </label>
                          {config.pages.home.hero_cta_visible && (
                            <>
                              <div className="hero-cms-pair promo-pair-cols">
                                <label className="hero-cms-field">
                                  <span>
                                    {isEn
                                      ? "CTA Button Text (AR)"
                                      : "نص الزر (عربي)"}
                                  </span>
                                  <input
                                    type="text"
                                    value={config.pages.home.hero_cta_text_ar}
                                    onChange={(e) =>
                                      updateHome(
                                        "hero_cta_text_ar",
                                        e.target.value,
                                      )
                                    }
                                    placeholder={
                                      isEn ? "Default Arabic CTA" : "تسوّق الآن"
                                    }
                                  />
                                </label>
                                <label className="hero-cms-field">
                                  <span>
                                    {isEn
                                      ? "CTA Button Text (EN)"
                                      : "نص الزر (إنجليزي)"}
                                  </span>
                                  <input
                                    type="text"
                                    dir="ltr"
                                    value={config.pages.home.hero_cta_text_en}
                                    onChange={(e) =>
                                      updateHome(
                                        "hero_cta_text_en",
                                        e.target.value,
                                      )
                                    }
                                    placeholder={
                                      isEn ? "Shop Now" : "نص الزر بالإنجليزية"
                                    }
                                  />
                                </label>
                              </div>
                              <label className="hero-cms-field">
                                <span>
                                  {isEn ? "CTA Destination Link" : "رابط زر البانر"}
                                </span>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={config.pages.home.hero_cta_link}
                                  onChange={(e) =>
                                    updateHome("hero_cta_link", e.target.value)
                                  }
                                  placeholder="/products"
                                />
                              </label>
                              <div className="choice-row">
                                {(
                                  [
                                    ["/products", isEn ? "All Products" : "كل المنتجات"],
                                    ["/#latest", isEn ? "Latest" : "وصل حديثاً"],
                                    ["/orders", isEn ? "Track Orders" : "تتبع الطلبات"],
                                    ["/contact", isEn ? "Contact" : "تواصل معنا"],
                                  ] as [string, string][]
                                ).map(([href, lbl]) => (
                                  <button
                                    key={href}
                                    type="button"
                                    className="choice-pill"
                                    aria-pressed={
                                      config.pages.home.hero_cta_link === href
                                    }
                                    onClick={() => updateHome("hero_cta_link", href)}
                                  >
                                    {lbl}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="hero-cms-group">
                          <span className="hero-cms-subhead">
                            <ImageIcon size={14} />
                            {isEn
                              ? "Fallback Banner Background Image"
                              : "صورة خلفية البانر الاحتياطي"}
                          </span>
                          <div className="hero-img-actions">
                            <label className="hero-upload-btn">
                              <Upload size={14} />
                              <span>
                                {uploadingHeroImg
                                  ? isEn
                                    ? "Uploading…"
                                    : "جارٍ الرفع…"
                                  : isEn
                                    ? "Upload Image"
                                    : "رفع صورة"}
                              </span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                disabled={uploadingHeroImg}
                                onChange={handleHeroImageUpload}
                                hidden
                              />
                            </label>
                            {config.pages.home.hero_image_url && (
                              <button
                                type="button"
                                className="hero-remove-btn"
                                onClick={() => updateHome("hero_image_url", null)}
                              >
                                <Trash2 size={14} />
                                <span>{isEn ? "Remove" : "حذف الصورة"}</span>
                              </button>
                            )}
                          </div>
                          <label className="hero-cms-field">
                            <span>
                              {isEn
                                ? "Or Paste HTTPS Image URL"
                                : "أو الصق رابط صورة مباشر"}
                            </span>
                            <input
                              type="url"
                              dir="ltr"
                              value={config.pages.home.hero_image_url ?? ""}
                              onChange={(e) =>
                                updateHome(
                                  "hero_image_url",
                                  e.target.value.trim() || null,
                                )
                              }
                              placeholder="https://..."
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: PAGE SETTINGS (SYNCED WITH SINGLE PREVIEW PAGE SWITCHER) */}
              {studioTab === "page" && (
                <div className="control-stack">
                  <div className="active-page-sync-badge">
                    <span className="active-page-sync-icon">
                      <ActivePageIcon size={15} />
                    </span>
                    <div>
                      <strong>
                        {isEn
                          ? `Editing: ${activePageMeta.badge_en}`
                          : `تخصيص: ${activePageMeta.badge_ar}`}
                      </strong>
                      <small>
                        {isEn
                          ? "Switch pages in the preview toolbar to edit another page."
                          : "اختر أي صفحة من شريط المعاينة للتبديل التلقائي لإعداداتها."}
                      </small>
                    </div>
                  </div>

                  {activePage === "home" && (
                    <>
                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn ? "Category Card Style" : "نمط بطاقات الأقسام"}
                          </span>
                        </div>
                        <div className="choice-row">
                          {(
                            [
                              ["pills", isEn ? "Pills" : "أقراص"],
                              ["rounded-cards", isEn ? "Cards" : "بطاقات"],
                              ["minimal", isEn ? "Minimal" : "بسيط"],
                            ] as [CategoryCardStyle, string][]
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.home.categoryCardStyle === val
                              }
                              onClick={() => updateHome("categoryCardStyle", val)}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn ? "Entrance Animation" : "حركة دخول العناصر"}
                          </span>
                          <button
                            type="button"
                            className="preview-toggle"
                            onClick={() => setAnimSeed((s) => s + 1)}
                          >
                            <Play size={12} /> {isEn ? "Replay" : "تشغيل"}
                          </button>
                        </div>
                        <div className="choice-row">
                          {(
                            [
                              ["fade-up", isEn ? "Fade Up" : "ظهور للأعلى"],
                              ["zoom-in", isEn ? "Zoom In" : "تكبير ناعم"],
                              ["slide-rtl", isEn ? "Slide In" : "انزلاق جانبي"],
                              ["none", isEn ? "None" : "بدون"],
                            ] as [EntranceAnimation, string][]
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.home.entranceAnimation === val
                              }
                              onClick={() => {
                                updateHome("entranceAnimation", val);
                                setAnimSeed((s) => s + 1);
                              }}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="page-quick-links">
                        <button
                          type="button"
                          className="customizer-btn-secondary"
                          onClick={() => handleSelectStudioTab("banners")}
                        >
                          <Images size={14} />
                          <span>
                            {isEn
                              ? "Manage Hero Carousel Slides"
                              : "إدارة شرائح الكاروسيل والبانر"}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="customizer-btn-secondary"
                          onClick={() => handleSelectPreviewPage("sections")}
                        >
                          <ListOrdered size={14} />
                          <span>
                            {isEn
                              ? "Reorder Home Sections"
                              : "ترتيب أقسام الرئيسية"}
                          </span>
                        </button>
                      </div>
                    </>
                  )}

                  {activePage === "sections" && (
                    <SectionsBuilder
                      sections={config.homeSections}
                      categories={categories}
                      defaultAccent={config.global.primaryButtonBg}
                      onChange={updateHomeSections}
                    />
                  )}

                  {activePage === "products" && (
                    <>
                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn
                              ? "Product Grid Columns"
                              : "عدد أعمدة شبكة المنتجات"}
                          </span>
                        </div>
                        <div className="choice-row">
                          {([2, 3, 4] as GridColumns[]).map((cols) => (
                            <button
                              key={cols}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.products.gridColumns === cols
                              }
                              onClick={() => updateProducts("gridColumns", cols)}
                            >
                              {isEn ? `${cols} columns` : `${cols} أعمدة`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn ? "Card Hover Effect" : "تأثير تمرير البطاقة"}
                          </span>
                        </div>
                        <div className="choice-row">
                          {(
                            [
                              ["zoom", isEn ? "Image Zoom" : "تكبير الصورة"],
                              ["lift", isEn ? "Card Lift" : "رفع البطاقة"],
                              ["glow", isEn ? "Border Glow" : "توهّج الإطار"],
                              ["none", isEn ? "None" : "بدون"],
                            ] as [CardHoverEffect, string][]
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.products.cardHoverEffect === val
                              }
                              onClick={() =>
                                updateProducts("cardHoverEffect", val)
                              }
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="color-grid">
                        <ColorControl
                          label={isEn ? "Price Badge Color" : "لون شارة السعر"}
                          value={config.pages.products.priceBadgeColor}
                          onChange={(v) => updateProducts("priceBadgeColor", v)}
                        />
                      </div>

                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn
                              ? "Add-to-Bag Button Style"
                              : "نمط زر الإضافة للسلة"}
                          </span>
                        </div>
                        <div className="choice-row">
                          {(
                            [
                              ["solid", isEn ? "Solid" : "ممتلئ"],
                              ["outline", isEn ? "Outline" : "محدد بإطار"],
                              ["pill", isEn ? "Rounded Pill" : "دائري ناعم"],
                              ["soft", isEn ? "Soft Fill" : "ناعم"],
                            ] as [AddToCartStyle, string][]
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.products.addToCartStyle === val
                              }
                              onClick={() =>
                                updateProducts("addToCartStyle", val)
                              }
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {activePage === "product_details" && (
                    <>
                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn ? "Image Gallery Layout" : "نمط معرض الصور"}
                          </span>
                        </div>
                        <div className="choice-row">
                          {(
                            [
                              [
                                "thumbnails-bottom",
                                isEn ? "Bottom Thumbnails" : "مصغرات بالأسفل",
                              ],
                              [
                                "side-stack",
                                isEn ? "Side Stack" : "عمود جانبي",
                              ],
                            ] as [GalleryStyle, string][]
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.product_details.galleryStyle ===
                                val
                              }
                              onClick={() => updateDetails("galleryStyle", val)}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="color-grid">
                        <ColorControl
                          label={
                            isEn
                              ? "Primary CTA Button Color"
                              : "لون زر الشراء الرئيسي"
                          }
                          value={config.pages.product_details.ctaButtonColor}
                          onChange={(v) => updateDetails("ctaButtonColor", v)}
                        />
                      </div>

                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn
                              ? "Variant Selector Style"
                              : "نمط اختيار المقاسات والألوان"}
                          </span>
                        </div>
                        <div className="choice-row">
                          {(
                            [
                              ["pills", isEn ? "Rounded Pills" : "أقراص دائرية"],
                              ["boxed", isEn ? "Crisp Boxes" : "مربعات واضحة"],
                            ] as [VariantSelectorStyle, string][]
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.product_details
                                  .variantSelectorStyle === val
                              }
                              onClick={() =>
                                updateDetails("variantSelectorStyle", val)
                              }
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {activePage === "cart_checkout" && (
                    <div className="color-grid">
                      <ColorControl
                        label={
                          isEn ? "Summary Card Background" : "خلفية بطاقة الملخص"
                        }
                        value={config.pages.cart_checkout.summaryCardBg}
                        onChange={(v) => updateCart("summaryCardBg", v)}
                      />
                      <ColorControl
                        label={
                          isEn ? "Progress Bar Accent" : "لون شريط التقدم"
                        }
                        value={config.pages.cart_checkout.progressBarAccent}
                        onChange={(v) => updateCart("progressBarAccent", v)}
                      />
                      <ColorControl
                        label={
                          isEn ? "Checkout Button Color" : "لون زر إتمام الطلب"
                        }
                        value={config.pages.cart_checkout.checkoutButtonColor}
                        onChange={(v) => updateCart("checkoutButtonColor", v)}
                      />
                    </div>
                  )}

                  {activePage === "orders" && (
                    <>
                      <div className="color-grid">
                        <ColorControl
                          label={
                            isEn
                              ? "Active Timeline Step Color"
                              : "لون الخطوة النشطة بالتتبع"
                          }
                          value={config.pages.orders.timelineActiveColor}
                          onChange={(v) =>
                            updateOrders("timelineActiveColor", v)
                          }
                        />
                      </div>

                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn
                              ? "Status Badge Style"
                              : "نمط شارة حالة الطلب"}
                          </span>
                        </div>
                        <div className="choice-row">
                          {(
                            [
                              ["pill", isEn ? "Soft Pill" : "قرص ناعم"],
                              ["rounded", isEn ? "Filled Rounded" : "ممتلئ"],
                              ["outline", isEn ? "Outlined" : "محدد بإطار"],
                            ] as [StatusBadgeStyle, string][]
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.orders.statusBadgeStyle === val
                              }
                              onClick={() =>
                                updateOrders("statusBadgeStyle", val)
                              }
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn ? "Card Elevation" : "ارتفاع وظل البطاقات"}
                          </span>
                        </div>
                        <div className="choice-row">
                          {(
                            [
                              ["flat", isEn ? "Flat" : "مسطح"],
                              ["subtle", isEn ? "Subtle Shadow" : "ظل خفيف"],
                              ["elevated", isEn ? "Elevated" : "بارز"],
                            ] as [CardElevation, string][]
                          ).map(([val, lbl]) => (
                            <button
                              key={val}
                              type="button"
                              className="choice-pill"
                              aria-pressed={
                                config.pages.orders.cardElevation === val
                              }
                              onClick={() => updateOrders("cardElevation", val)}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Sticky, Generous Live Interactive Preview */}
        <section
          className="customizer-preview-shell"
          aria-label={isEn ? "Live interactive preview" : "المعاينة التفاعلية المباشرة"}
        >
          <div className="preview-chrome">
            <div className="preview-toolbar-group">
              <span className="preview-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="preview-url-bar">{activePageMeta.url}</span>
            </div>

            {/* Single Unified Synchronized Page Switcher (6 pages) */}
            <nav
              className="preview-page-switcher"
              aria-label={isEn ? "Preview & edit page" : "التبديل بين صفحات المتجر"}
            >
              {PAGE_SWITCHER_ITEMS.map(({ key, label_ar, label_en }) => (
                <button
                  key={key}
                  type="button"
                  className="preview-toggle"
                  aria-pressed={activePage === key}
                  onClick={() => handleSelectPreviewPage(key)}
                >
                  {isEn ? label_en : label_ar}
                </button>
              ))}
            </nav>

            <div
              className="preview-toolbar-group"
              aria-label={isEn ? "Preview viewport size" : "حجم شاشة المعاينة"}
            >
              <button
                type="button"
                className="preview-toggle"
                aria-pressed={viewport === "desktop"}
                onClick={() => setViewport("desktop")}
              >
                <Monitor size={14} /> {isEn ? "Desktop" : "سطح المكتب"}
              </button>
              <button
                type="button"
                className="preview-toggle"
                aria-pressed={viewport === "mobile"}
                onClick={() => setViewport("mobile")}
              >
                <Smartphone size={14} /> {isEn ? "Mobile" : "الجوال"}
              </button>
            </div>
          </div>

          <div className="preview-stage">
            <PreviewFrame
              config={config}
              page={previewPage}
              viewport={viewport}
              animSeed={animSeed}
              storeName={storeName}
              currency={currency}
              shippingFee={shippingFee}
              banners={banners}
              products={products}
              categories={categories}
              onNavigate={(next) => {
                setActivePage(next);
                if (studioTab === "page") setStudioTab("page");
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
