import { checked, requireAdmin } from "@/lib/db";
import { localizedText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { getPublishedTheme } from "@/lib/platform-theme-data";
import { designFields, readStoreDesign, type DesignSettingsRow } from "@/lib/store-design-settings";
import { storefrontDesign } from "@/lib/storefront-theme";
import { merchantStorefrontUrl } from "@/lib/tenant";
import { CustomizerStudio } from "./customizer-studio";

export default async function CustomizerPage() {
  const { db, storeId, activeStore } = await requireAdmin("manage_settings");
  const [settings, product, liveUrl, platform, lang] = await Promise.all([
    db.from("store_settings").select("store_name," + designFields).eq("store_id", storeId)
      .single<DesignSettingsRow & { store_name: string }>(),
    db.from("products").select("id").eq("store_id", storeId).eq("is_active", true).order("id").limit(1).maybeSingle(),
    merchantStorefrontUrl(activeStore.slug), getPublishedTheme(), getServerLang(),
  ]);
  const row = checked(settings);
  const config = readStoreDesign(row);
  return <CustomizerStudio key={storeId} storeId={storeId} slug={activeStore.slug} liveUrl={liveUrl}
    storeName={localizedText(lang, row.store_name || activeStore.name_ar, activeStore.name_en)}
    initial={storefrontDesign(config)} template={config.baseTemplate} productId={product.data?.id ?? null}
    hasHero={config.homeSections.some(section => section.type === "hero_banner" && section.visible)}
    gates={{ motion_enabled: platform.motion_enabled, sticky_cta_enabled: platform.sticky_cta_enabled }}/>;
}
