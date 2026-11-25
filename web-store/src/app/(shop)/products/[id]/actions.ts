"use server";

import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";
import type { ProductReview } from "@/lib/reviews-wishlist";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SubmitReviewResult =
  | { ok: true; review: ProductReview }
  | { ok: false; error: string };

export async function submitReviewAction(input: {
  productId: string;
  rating: number;
  comment: string;
}): Promise<SubmitReviewResult> {
  const productId = (input.productId ?? "").trim();
  const rating = Math.round(Number(input.rating));
  const comment = (input.comment ?? "").trim().slice(0, 1500);

  if (!UUID_RE.test(productId)) {
    return { ok: false, error: "invalid_product" };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "invalid_rating" };
  }

  const [db, store] = await Promise.all([
    serverDb(),
    resolveActiveStoreOrDefault(),
  ]);

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return { ok: false, error: "auth_required" };
  }

  const { data, error } = await db.rpc("submit_product_review", {
    p_store_id: store.id,
    p_product_id: productId,
    p_rating: rating,
    p_comment: comment,
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "review_submit_failed",
    };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  revalidatePath("/");
  revalidatePath("/admin/reviews");
  if (store.basePath) {
    revalidatePath(`${store.basePath}/products/${productId}`);
    revalidatePath(`${store.basePath}/products`);
    revalidatePath(store.basePath);
  }

  return { ok: true, review: data as ProductReview };
}
