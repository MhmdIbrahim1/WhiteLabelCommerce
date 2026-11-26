"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { browserDb } from "@/lib/supabase/browser";
import { withReviewReply, type ProductReview, type ReviewReply } from "@/lib/reviews-wishlist";

export function useReviewReplies<T extends Pick<ProductReview, "id" | "review_replies">>(
  storeId: string | undefined, setReviews: Dispatch<SetStateAction<T[]>>,
) {
  useEffect(() => {
    if (!storeId) return;
    const db = browserDb();
    const channel = db.channel(`review-replies-${storeId}`).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "review_replies", filter: `store_id=eq.${storeId}`,
    }, (event) => {
      const reply = event.new as ReviewReply & { review_id: string };
      setReviews((reviews) => reviews.some((r) => r.id === reply.review_id)
        ? reviews.map((r) => r.id === reply.review_id ? withReviewReply(r, reply) : r) : reviews);
    }).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [storeId, setReviews]);
}
