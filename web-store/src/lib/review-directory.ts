import type { ReviewReply, ReviewStatus } from "./reviews-wishlist";

export const reviewsPageSize = 20;
export type ReviewTab = "all" | "needs_reply" | "hidden";
export type ReviewFilters = { filter: ReviewTab; q: string; rating: number | null; page: number };

export function reviewFilters(query: Record<string, string | string[] | undefined>): ReviewFilters {
  const rating = typeof query.rating === "string" && /^[1-5]$/.test(query.rating) ? Number(query.rating) : null;
  const page = typeof query.page === "string" && /^[1-9]\d{0,8}$/.test(query.page) ? Number(query.page) : 1;
  return {
    filter: query.filter === "needs_reply" || query.filter === "hidden" ? query.filter : "all",
    q: typeof query.q === "string" ? query.q.trim().slice(0, 100) : "", rating, page,
  };
}

export function reviewHref({ filter, q, rating, page }: ReviewFilters) {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("filter", filter);
  if (q) query.set("q", q);
  if (rating) query.set("rating", String(rating));
  if (page > 1) query.set("page", String(page));
  return query.size ? "/admin/reviews?" + query : "/admin/reviews";
}

export type DirectoryReview = {
  id: string; product_id: string; author_name: string; rating: number; comment: string;
  is_verified_purchase: boolean; status: ReviewStatus; admin_reply: string | null;
  admin_replied_at: string | null; created_at: string; needs_reply: boolean;
  product_name_ar: string | null; product_name_en: string | null; review_replies: ReviewReply[];
};

export type ReviewDirectory = {
  total: number; published_count: number; avg_rating: number; needs_reply_count: number; hidden_count: number;
  total_count: number; page: number; page_size: number; rows: (DirectoryReview & { image_path: string | null })[];
};
