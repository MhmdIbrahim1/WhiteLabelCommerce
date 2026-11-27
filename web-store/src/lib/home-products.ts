import type { SupabaseClient } from "@supabase/supabase-js";
import { checked } from "./db";
import { productFields, type Product } from "./shop";
import type { HomeSection } from "./ui-config";

// Older catalogs without created_at retain their alphabetical fallback within each section.
async function latest<T>(read: (order: "created_at" | "name") =>
  PromiseLike<{ data: T | null; error: { code: string; message: string } | null }>) {
  const result = await read("created_at");
  return checked(result.error?.code === "42703" ? await read("name") : result);
}

export async function homeProducts(db: SupabaseClient, storeId: string, sections: HomeSection[]) {
  const limits = new Map<string, number>();
  for (const section of sections) {
    if (section.visible && section.type === "featured_products") {
      const categoryId = section.categoryId.toLowerCase();
      limits.set(categoryId, Math.max(limits.get(categoryId) ?? 0, section.limit));
    }
  }
  const categories = [...limits.keys()].filter(Boolean);
  const allLimit = limits.get("");
  const [flash, all, grouped] = await Promise.all([
    db.from("storefront_flash_deals").select(productFields).eq("store_id", storeId)
      .order("flash_sale_ends_at", { ascending: true }).order("id").limit(8).returns<Product[]>(),
    allLimit ? latest(order => db.from("products").select(productFields)
      .eq("store_id", storeId).eq("is_active", true).order(order, { ascending: order === "name" })
      .order("id").limit(allLimit).returns<Product[]>()) : [],
    // PostgREST applies an embedded resource's order and limit per parent category.
    categories.length ? latest(order => db.from("categories").select(`id,products!products_category_store_fk(${productFields})`)
      .eq("store_id", storeId).in("id", categories).eq("products.store_id", storeId).eq("products.is_active", true)
      .order(order, { referencedTable: "products", ascending: order === "name" })
      .order("id", { referencedTable: "products" })
      .limit(Math.max(...categories.map(id => limits.get(id)!)), { referencedTable: "products" })
      .returns<{ id: string; products: Product[] }[]>()) : [],
  ]);
  const featured = new Map(grouped.map(category => [category.id, category.products]));
  featured.set("", all);
  return { flashDeals: checked(flash), featured };
}
