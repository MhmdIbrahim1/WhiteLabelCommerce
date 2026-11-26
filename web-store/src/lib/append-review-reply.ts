import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FOLLOW_UP_LIMIT, type ReviewReply } from "./reviews-wishlist";

export async function appendReviewReply(db: SupabaseClient, storeId: string, reviewId: string,
  role: ReviewReply["role"], text: string) {
  const body = text.trim();
  if (!body || Array.from(body).length > FOLLOW_UP_LIMIT) return { ok: false } as const;

  const { data, error } = await db.from("review_replies")
    .insert({ store_id: storeId, review_id: reviewId, role, body })
    .select("role,body,created_at").single<ReviewReply>();
  if (error || !data) return { ok: false } as const;
  revalidatePath("/admin/reviews");
  revalidatePath("/products/[id]", "page");
  return { ok: true, reply: data } as const;
}
