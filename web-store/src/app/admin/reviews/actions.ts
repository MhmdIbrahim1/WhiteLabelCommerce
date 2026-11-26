"use server";

import { requireAdmin } from "@/lib/db";
import { appendReviewReply } from "@/lib/append-review-reply";

export async function answerFollowUpAction(reviewId: string, body: string) {
  const { db, storeId } = await requireAdmin();
  return appendReviewReply(db, storeId, reviewId, "merchant", body);
}
