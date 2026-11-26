import { requireAdmin, checked } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import { getServerLang } from "@/lib/i18n-server";
import { photo } from "@/lib/shop";
import { AdminReviewsClient, type AdminReviewItem } from "./reviews-client";

type RawReviewJoinRow = {
  id: string;
  store_id: string;
  product_id: string;
  user_id: string;
  order_id: string | null;
  author_name: string;
  rating: number;
  comment: string;
  is_verified_purchase: boolean;
  status: "published" | "hidden";
  admin_reply: string | null;
  admin_replied_at: string | null;
  created_at: string;
  updated_at: string;
  products:
    | { id: string; name: string; name_en: string | null; image_path: string | null }
    | { id: string; name: string; name_en: string | null; image_path: string | null }[]
    | null;
};

export default async function AdminReviewsPage() {
  const [{ storeId }, lang] = await Promise.all([
    requireAdmin(),
    getServerLang(),
  ]);

  const res = await adminDb()
    .from("product_reviews")
    .select(
      "id,store_id,product_id,user_id,order_id,author_name,rating,comment,is_verified_purchase,status,admin_reply,admin_replied_at,created_at,updated_at,products(id,name,name_en,image_path)",
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(200);

  const rawRows = (checked(res) ?? []) as RawReviewJoinRow[];

  const reviews: AdminReviewItem[] = rawRows.map((row) => {
    const prod = Array.isArray(row.products) ? row.products[0] : row.products;
    return {
      id: row.id,
      store_id: row.store_id,
      product_id: row.product_id,
      user_id: row.user_id,
      order_id: row.order_id,
      author_name: row.author_name,
      rating: Number(row.rating),
      comment: row.comment,
      is_verified_purchase: Boolean(row.is_verified_purchase),
      status: row.status === "hidden" ? "hidden" : "published",
      admin_reply: row.admin_reply,
      admin_replied_at: row.admin_replied_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      product_name_ar: prod?.name ?? "",
      product_name_en: prod?.name_en ?? "",
      product_image_url: photo(prod?.image_path ?? null),
    };
  });

  return <AdminReviewsClient initialReviews={reviews} initialLang={lang} />;
}
