import { checked, requireAdmin } from "@/lib/db";
import brand from "@/lib/brand";
import { photo } from "@/lib/shop";
import { resolveUiConfig } from "@/lib/ui-config";
import { CustomizerStudio } from "./customizer-studio";
import { merchantStorefrontUrl } from "@/lib/tenant";

type CustomizerSettingsRow = {
  store_name: string;
  currency: string;
  shipping_fee: number;
  banners: string[];
  theme_template: string;
  primary_color: string;
  secondary_color: string;
  surface_color: string;
  border_radius: number;
  ui_config?: unknown;
};

type RawProductRow = {
  id: string;
  category_id: string;
  name: string;
  name_en?: string | null;
  description: string;
  description_en?: string | null;
  price: number;
  old_price: number | null;
  stock: number;
  sizes: string[];
  colors: string[];
  image_path: string | null;
};

export default async function CustomizerPage() {
  const { db, storeId, activeStore } = await requireAdmin("manage_settings");

  const settingsQuery = await db
    .from("store_settings")
    .select(
      "store_name,currency,shipping_fee,banners,theme_template,primary_color,secondary_color,surface_color,border_radius,ui_config",
    )
    .eq("store_id", storeId)
    .single<CustomizerSettingsRow>();

  let settingsRow = settingsQuery.data;
  if (
    settingsQuery.error?.code === "42703" ||
    settingsQuery.error?.code === "PGRST204"
  ) {
    const fallback = await db
      .from("store_settings")
      .select(
        "store_name,currency,shipping_fee,banners,theme_template,primary_color,secondary_color,surface_color,border_radius",
      )
      .eq("store_id", storeId)
      .single<CustomizerSettingsRow>();
    settingsRow = checked(fallback);
  } else {
    settingsRow = checked(settingsQuery);
  }

  const [productsRes, categoriesRes, liveUrl] = await Promise.all([
    db
      .from("products")
      .select("id,category_id,name,name_en,description,description_en,price,old_price,stock,sizes,colors,image_path")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("name")
      .limit(12),
    db
      .from("categories")
      .select("id,name,name_en")
      .eq("store_id", storeId)
      .order("name")
      .limit(12),
    merchantStorefrontUrl(activeStore.slug),
  ]);

  const products = ((productsRes.data ?? []) as RawProductRow[]).map((p) => ({
    id: p.id,
    categoryId: p.category_id,
    name: p.name,
    name_en: p.name_en ?? "",
    description: p.description,
    description_en: p.description_en ?? "",
    price: Number(p.price),
    old_price: p.old_price !== null ? Number(p.old_price) : null,
    stock: Number(p.stock),
    sizes: p.sizes ?? [],
    colors: p.colors ?? [],
    imageUrl: photo(p.image_path),
  }));

  const categories = (categoriesRes.data ?? []) as {
    id: string;
    name: string;
    name_en?: string | null;
  }[];

  const initialConfig = resolveUiConfig(settingsRow.ui_config, {
    template: settingsRow.theme_template,
    primary: settingsRow.primary_color || brand.colors.primary,
    accent: settingsRow.secondary_color || brand.colors.secondary,
    surface: settingsRow.surface_color || brand.colors.surface,
    radius: settingsRow.border_radius ?? brand.borderRadius,
  });

  return (
    <CustomizerStudio
      storefrontPath={liveUrl}
      storeId={storeId}
      initialConfig={initialConfig}
      storeName={settingsRow.store_name || brand.storeName}
      currency={settingsRow.currency || brand.currency}
      shippingFee={Number(settingsRow.shipping_fee ?? brand.shippingFee)}
      banners={(settingsRow.banners ?? []).filter((b) =>
        b.startsWith("https://"),
      )}
      products={products}
      categories={categories}
    />
  );
}
