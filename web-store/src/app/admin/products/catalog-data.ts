import "server-only";
import { checked, requireAdmin } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import type { AdminCategoryItem, AdminProductItem } from "./product-form";

export async function catalogCategories() {
  const { db, storeId } = await requireAdmin("manage_products");
  const categories: AdminCategoryItem[] = [];
  for (let offset = 0; ; offset += 200) {
    const batch = checked(await db.from("categories").select("id,name,name_en,slug")
      .eq("store_id", storeId).order("name").order("id").range(offset, offset + 199));
    categories.push(...batch);
    if (batch.length < 200) return categories;
  }
}

export const productColumns = "id,name,name_en,slug,price,stock,is_active,image_path,category_id,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at" as const;

export async function editorProduct(id: string) {
  const { storeId } = await requireAdmin("manage_products");
  // Cost is private. Only the authorized full editor reads it via the server client.
  const result = await adminDb().from("products").select(productColumns +
    ",cost_price,description,description_en,old_price,max_order_qty,sizes,colors,color_images,product_variants(color,size,stock),image_paths,specifications")
    .eq("store_id", storeId).eq("id", id).eq("product_variants.listed", true).maybeSingle<AdminProductItem>();
  return result.error ? checked(result) : result.data;
}
