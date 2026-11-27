import { cache } from "react";
import { notFound } from "next/navigation";
import { serverDb, checked } from "./db";
import { resolveUiConfig, type StoreUiConfig } from "./ui-config";
import type { ProductSpec } from "./specs";
import type { StorePixelsConfig } from "./marketing";
import {
  DEFAULT_STORE_ID,
  resolveActiveStore,
  type StorePlan,
  type StoreStatus,
} from "./tenant";
import brand from "./brand";

export { DEFAULT_STORE_ID };

export type Product = {
  id: string;
  name: string;
  name_en?: string | null;
  category_id: string;
  description: string;
  description_en?: string | null;
  price: number;
  old_price: number | null;
  flash_sale_price?: number | null;
  flash_sale_starts_at?: string | null;
  flash_sale_ends_at?: string | null;
  stock: number;
  max_order_qty?: number | null;
  product_variants?: import("./variant-stock").Variant[];
  color_images?: Record<string, string>;
  sizes: string[];
  colors: string[];
  image_path: string | null;
  image_paths?: string[] | null;
  specifications?: ProductSpec[] | null;
  avg_rating?: number | null;
  review_count?: number | null;
};

export const productFields =
  "id,name,name_en,category_id,description,description_en,price,old_price,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at,stock,max_order_qty,sizes,colors,image_path,specifications,avg_rating,review_count";

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
  default_max_order_qty?: number | null;
  cart_incentive_enabled?: boolean | null;
  free_shipping_threshold?: number | null;
  cashback_enabled?: boolean | null;
  cashback_percentage?: number | null;
  meta_pixel_id?: string | null;
  tiktok_pixel_id?: string | null;
  ga4_measurement_id?: string | null;
};

export type StoreIncentives = {
  cartIncentiveEnabled: boolean;
  freeShippingThreshold: number;
  cashbackEnabled: boolean;
  cashbackPercentage: number;
};

export const settings = cache(async () => {
  const [resolved, db] = await Promise.all([resolveActiveStore(), serverDb()]);
  if (!resolved) notFound();

  const primary = await db
    .from("store_settings")
    .select(
      "store_id,store_name,primary_color,secondary_color,surface_color,border_radius,currency,shipping_fee,whatsapp_number,banners,theme_template,ui_config,cod_enabled,paymob_enabled,paymob_card_enabled,paymob_wallet_enabled,default_max_order_qty,cart_incentive_enabled,free_shipping_threshold,cashback_enabled,cashback_percentage,meta_pixel_id,tiktok_pixel_id,ga4_measurement_id",
    )
    .eq("store_id", resolved.id)
    .single<SettingsRow>();
  let data = primary.data;
  let error = primary.error;
  if (error?.code === "42703" || error?.code === "PGRST204") {
    const fallback = await db
      .from("store_settings")
      .select(
        "store_id,store_name,primary_color,secondary_color,surface_color,border_radius,currency,shipping_fee,whatsapp_number,banners,theme_template,ui_config,cod_enabled,paymob_enabled,paymob_card_enabled,paymob_wallet_enabled",
      )
      .eq("store_id", resolved.id)
      .single<SettingsRow>();
    data = fallback.data;
    error = fallback.error;
  }
  if (error || !data) throw new Error("تعذر تحميل إعدادات المتجر");
  const uiConfig: StoreUiConfig = resolveUiConfig(data.ui_config, {
    template: data.theme_template,
    primary: data.primary_color || brand.colors.primary,
    accent: data.secondary_color || brand.colors.secondary,
    surface: data.surface_color || brand.colors.surface,
    radius: data.border_radius ?? brand.borderRadius,
  });
  return {
    storeId: data.store_id || resolved.id || DEFAULT_STORE_ID,
    slug: resolved.slug,
    basePath: resolved.basePath,
    isDefaultStore: resolved.isDefault,
    plan: resolved.plan as StorePlan,
    status: resolved.status as StoreStatus,
    maxProducts: resolved.max_products,
    defaultMaxOrderQty: data.default_max_order_qty === undefined ? 10 : data.default_max_order_qty,
    nameAr: data.store_name || resolved.name_ar || brand.storeName,
    nameEn: resolved.name_en || data.store_name || brand.storeName,
    template: uiConfig.baseTemplate,
    name: data.store_name || resolved.name_ar || brand.storeName,
    primary: uiConfig.global.primaryButtonBg,
    accent: uiConfig.global.accentBadge,
    surface: uiConfig.global.cardSurface,
    radius: uiConfig.global.borderRadius,
    currency: String(data.currency || brand.currency),
    fee: Number(data.shipping_fee),
    whatsapp: String(data.whatsapp_number || brand.whatsappNumber),
    banners: ((data.banners as string[]) ?? []).filter((s) =>
      s.startsWith("https://"),
    ),
    uiConfig,
    payment: {
      codEnabled: data.cod_enabled ?? true,
      paymobEnabled: data.paymob_enabled ?? false,
      paymobCardEnabled: data.paymob_card_enabled ?? false,
      paymobWalletEnabled: data.paymob_wallet_enabled ?? false,
    },
    incentives: {
      cartIncentiveEnabled: data.cart_incentive_enabled ?? true,
      freeShippingThreshold: Number(data.free_shipping_threshold ?? 1000),
      cashbackEnabled: data.cashback_enabled ?? true,
      cashbackPercentage: Number(data.cashback_percentage ?? 5),
    } satisfies StoreIncentives,
    pixels: {
      metaPixelId: String(data.meta_pixel_id ?? "").trim(),
      tiktokPixelId: String(data.tiktok_pixel_id ?? "").trim(),
      ga4MeasurementId: String(data.ga4_measurement_id ?? "").trim(),
    } satisfies StorePixelsConfig,
  };
});

export const categories = cache(async () => {
  const [store, db] = await Promise.all([resolveActiveStore(), serverDb()]);
  if (!store) notFound();
  const all: { id: string; name: string; name_en?: string | null }[] = [];
  for (let start = 0; ; start += 200) {
    const batch = checked(
      await db
        .from("categories")
        .select("id,name,name_en")
        .eq("store_id", store.id)
        .order("name")
        .order("id")
        .range(start, start + 199),
    );
    all.push(...batch);
    if (batch.length < 200) return all;
  }
});

export { photo } from "./product-photo";

export const searchPattern = (value: string) =>
  "%" + value.slice(0, 100).replace(/[\\%_]/g, "\\$&") + "%";
