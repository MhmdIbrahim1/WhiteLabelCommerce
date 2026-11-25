import { requireAdmin } from "@/lib/db";
import brand from "@/lib/brand";
import { photo } from "@/lib/shop";
import { isTemplate } from "@/lib/theme-templates";
import { resolveUiConfig } from "@/lib/ui-config";
import { computeMobileAppUnlocked } from "@/lib/tenant-shared";
import type { StoreAppBuildRow } from "@/app/api/admin/mobile-builds/route";
import { MobileAppStudio, type PreviewProduct } from "./mobile-app-studio";

export const dynamic = "force-dynamic";

type StoreSettingsSelect = {
  store_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  surface_color: string | null;
  border_radius: number | null;
  currency: string | null;
  whatsapp_number: string | null;
  support_email: string | null;
  banners: string[] | null;
  theme_template: string | null;
  ui_config: unknown;
};

type RawPreviewProduct = {
  id: string;
  name: string;
  name_en: string | null;
  price: number;
  old_price: number | null;
  flash_sale_price: number | null;
  flash_sale_starts_at: string | null;
  flash_sale_ends_at: string | null;
  stock: number;
  image_path: string | null;
  avg_rating: number | null;
  review_count: number | null;
};

export default async function AdminMobileAppPage() {
  const { db, storeId, activeStore, isSuperAdmin } = await requireAdmin();

  const [settingsRes, accessRes, buildsRes, productsRes] = await Promise.all([
    db
      .from("store_settings")
      .select(
        "store_name,primary_color,secondary_color,surface_color,border_radius,currency,whatsapp_number,support_email,banners,theme_template,ui_config",
      )
      .eq("store_id", storeId)
      .maybeSingle<StoreSettingsSelect>(),
    db.rpc("store_has_mobile_app_access", { p_store_id: storeId }),
    db
      .from("store_app_builds")
      .select(
        "id,store_id,app_name,app_id_suffix,package_id,icon_url,version_code,version_name,status,apk_download_url,github_run_url,error_message,created_at,updated_at,completed_at",
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("products")
      .select(
        "id,name,name_en,price,old_price,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at,stock,image_path,avg_rating,review_count",
      )
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const unlocked =
    !accessRes.error && typeof accessRes.data === "boolean"
      ? accessRes.data
      : computeMobileAppUnlocked(activeStore.plan, activeStore.mobile_app_access);

  const githubConfigured = Boolean(
    process.env.GITHUB_ACTIONS_TOKEN?.trim() &&
      process.env.GITHUB_REPO_OWNER?.trim() &&
      process.env.GITHUB_REPO_NAME?.trim(),
  );

  const s = settingsRes.data;
  const template =
    s?.theme_template && isTemplate(s.theme_template)
      ? s.theme_template
      : ("modern-minimal" as const);
  const uiConfig = resolveUiConfig(s?.ui_config, {
    template,
    primary: s?.primary_color || brand.colors.primary,
    accent: s?.secondary_color || brand.colors.secondary,
    surface: s?.surface_color || brand.colors.surface,
    radius: s?.border_radius ?? brand.borderRadius,
  });

  const homeCfg = uiConfig.pages.home;
  const activeCampaign = (homeCfg.promo_banners ?? []).find((c) => c.active);
  const fallbackBanner = ((s?.banners ?? []) as string[]).find((b) =>
    typeof b === "string" && b.startsWith("https://"),
  );
  const heroSectionVisible =
    homeCfg.hero_visible &&
    (uiConfig.homeSections.find((sec) => sec.type === "hero_banner")?.visible ??
      true);

  const promoSection = uiConfig.homeSections.find(
    (sec) => sec.type === "promo_banner" && sec.visible,
  );
  const announcementText =
    promoSection && promoSection.type === "promo_banner"
      ? promoSection.headline || promoSection.badge || ""
      : "";

  const previewProducts: PreviewProduct[] = (
    (productsRes.data ?? []) as RawPreviewProduct[]
  ).map((p) => ({
    id: p.id,
    name: p.name,
    name_en: p.name_en,
    price: Number(p.price ?? 0),
    old_price: p.old_price !== null ? Number(p.old_price) : null,
    flash_sale_price:
      p.flash_sale_price !== null ? Number(p.flash_sale_price) : null,
    flash_sale_starts_at: p.flash_sale_starts_at,
    flash_sale_ends_at: p.flash_sale_ends_at,
    stock: Number(p.stock ?? 0),
    imageUrl: photo(p.image_path),
    avg_rating: p.avg_rating !== null ? Number(p.avg_rating) : 0,
    review_count: Number(p.review_count ?? 0),
  }));

  const cleanedSlug = activeStore.slug
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 28);
  const safeSlug =
    cleanedSlug && /^[a-z]/.test(cleanedSlug)
      ? cleanedSlug
      : `s${cleanedSlug || "shop"}`;

  const builds = (buildsRes.data ?? []) as StoreAppBuildRow[];
  const lastUploadedIcon = builds.find((b) => b.icon_url)?.icon_url ?? "";

  return (
    <MobileAppStudio
      key={activeStore.store_id}
      store={{
        storeId: activeStore.store_id,
        slug: activeStore.slug,
        nameAr: s?.store_name || activeStore.name_ar,
        nameEn: activeStore.name_en || s?.store_name || activeStore.name_ar,
        plan: activeStore.plan,
        mobileAppAccess: activeStore.mobile_app_access ?? "plan",
        logoUrl: lastUploadedIcon,
        primaryColor: uiConfig.global.primaryButtonBg,
        primaryText: uiConfig.global.primaryButtonText,
        secondaryColor: uiConfig.global.accentBadge,
        pageBg: uiConfig.global.pageBg,
        cardSurface: uiConfig.global.cardSurface,
        borderRadius: uiConfig.global.borderRadius,
        currency: s?.currency || brand.currency,
        packageId: `com.whitelabel.commerce.${safeSlug}`,
        whatsappNumber: s?.whatsapp_number ?? "",
        supportEmail: s?.support_email ?? "",
      }}
      preview={{
        heroVisible: heroSectionVisible,
        heroImageUrl:
          activeCampaign?.image_url ||
          homeCfg.hero_image_url ||
          fallbackBanner ||
          null,
        heroOverlayOpacity: homeCfg.hero_overlay_opacity ?? 45,
        heroGradientStart: activeCampaign?.gradient_start || homeCfg.heroBg || uiConfig.global.primaryButtonBg,
        heroGradientEnd: activeCampaign?.gradient_end || uiConfig.global.accentBadge,
        heroTextColor: homeCfg.heroText || "#ffffff",
        heroBadgeVisible: homeCfg.hero_badge_visible,
        heroBadgeAr: activeCampaign?.badge_ar || homeCfg.hero_badge_ar || "",
        heroBadgeEn: activeCampaign?.badge_en || homeCfg.hero_badge_en || "",
        heroTitleAr: activeCampaign?.title_ar || homeCfg.hero_title_ar || "",
        heroTitleEn: activeCampaign?.title_en || homeCfg.hero_title_en || "",
        heroSubtitleAr: activeCampaign?.subtitle_ar || homeCfg.hero_subtitle_ar || "",
        heroSubtitleEn: activeCampaign?.subtitle_en || homeCfg.hero_subtitle_en || "",
        heroCtaVisible: homeCfg.hero_cta_visible,
        heroCtaAr: activeCampaign?.cta_text_ar || homeCfg.hero_cta_text_ar || "",
        heroCtaEn: activeCampaign?.cta_text_en || homeCfg.hero_cta_text_en || "",
        announcementText,
        products: previewProducts,
      }}
      unlocked={unlocked}
      isSuperAdmin={isSuperAdmin}
      githubConfigured={githubConfigured}
      initialBuilds={builds}
    />
  );
}
