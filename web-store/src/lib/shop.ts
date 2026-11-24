import { cache } from "react";
import { serverDb, checked } from "./db";
import { isTemplate } from "./theme-templates";
import { resolveUiConfig, type StoreUiConfig } from "./ui-config";
import type { ProductSpec } from "./specs";
import brand from "./brand";

export type Product = {
  id: string;
  name: string;
  name_en?: string | null;
  category_id: string;
  description: string;
  description_en?: string | null;
  price: number;
  old_price: number | null;
  stock: number;
  sizes: string[];
  colors: string[];
  image_path: string | null;
  specifications?: ProductSpec[] | null;
};

export const productFields =
  "id,name,name_en,category_id,description,description_en,price,old_price,stock,sizes,colors,image_path,specifications";

export const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

type SettingsRow = {
  store_id?: string | null;
  store_name: string;
  primary_color: string;
  secondary_color: string;
  surface_color: string;
  border_radius: number;
  currency: string;
  shipping_fee: number;
  whatsapp_number: string;
  banners: string[];
  theme_template: string;
  ui_config?: unknown;
  cod_enabled?: boolean | null;
  paymob_enabled?: boolean | null;
  paymob_card_enabled?: boolean | null;
  paymob_wallet_enabled?: boolean | null;
};

export const settings = cache(async () => {
  const db = await serverDb();
  const primary = await db
    .from("store_settings")
    .select(
      "store_id,store_name,primary_color,secondary_color,surface_color,border_radius,currency,shipping_fee,whatsapp_number,banners,theme_template,ui_config,cod_enabled,paymob_enabled,paymob_card_enabled,paymob_wallet_enabled",
    )
    .eq("id", true)
    .single<SettingsRow>();
  let data = primary.data;
  let error = primary.error;
  if (error?.code === "42703" || error?.code === "PGRST204") {
    const fallback = await db
      .from("store_settings")
      .select(
        "store_id,store_name,primary_color,secondary_color,surface_color,border_radius,currency,shipping_fee,whatsapp_number,banners,theme_template,ui_config",
      )
      .eq("id", true)
      .single<SettingsRow>();
    data = fallback.data;
    error = fallback.error;
  }
  if (error || !data) throw new Error("تعذر تحميل إعدادات المتجر");
  const template = isTemplate(data.theme_template)
    ? data.theme_template
    : ("modern-minimal" as const);
  const uiConfig: StoreUiConfig = resolveUiConfig(data.ui_config, {
    template,
    primary: data.primary_color || brand.colors.primary,
    accent: data.secondary_color || brand.colors.secondary,
    surface: data.surface_color || brand.colors.surface,
    radius: data.border_radius ?? brand.borderRadius,
  });
  return {
    storeId: data.store_id || DEFAULT_STORE_ID,
    template: uiConfig.baseTemplate,
    name: data.store_name || brand.storeName,
    primary: uiConfig.global.primaryButtonBg,
    accent: uiConfig.global.accentBadge,
    surface: uiConfig.global.cardSurface,
    radius: uiConfig.global.borderRadius,
    currency: String(data.currency || brand.currency),
    fee: Number(data.shipping_fee),
    whatsapp: String(data.whatsapp_number || brand.whatsappNumber),
    banners: (data.banners as string[]).filter((s) => s.startsWith("https://")),
    uiConfig,
    payment: {
      codEnabled: data.cod_enabled ?? true,
      paymobEnabled: data.paymob_enabled ?? false,
      paymobCardEnabled: data.paymob_card_enabled ?? false,
      paymobWalletEnabled: data.paymob_wallet_enabled ?? false,
    },
  };
});
export const categories = cache(async () => {
  const db = await serverDb();
  const all: { id: string; name: string; name_en?: string | null }[] = [];
  for (let start = 0; ; start += 200) {
    const batch = checked(
      await db
        .from("categories")
        .select("id,name,name_en")
        .order("name")
        .order("id")
        .range(start, start + 199),
    );
    all.push(...batch);
    if (batch.length < 200) return all;
  }
});
export const photo = (path: string | null) =>
  path
    ? /^https?:\/\//i.test(path) || path.startsWith("/")
      ? path
      : process.env.NEXT_PUBLIC_SUPABASE_URL +
        "/storage/v1/object/public/product-images/" +
        path.split("/").map(encodeURIComponent).join("/")
    : null;
export const searchPattern = (value: string) =>
  "%" + value.slice(0, 100).replace(/[\\%_]/g, "\\$&") + "%";
