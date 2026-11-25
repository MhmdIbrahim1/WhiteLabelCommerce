import type { Lang } from "./i18n";

export type ReviewStatus = "published" | "hidden";

export type ProductReview = {
  id: string;
  store_id: string;
  product_id: string;
  user_id?: string | null;
  order_id?: string | null;
  author_name: string;
  rating: number;
  comment: string;
  is_verified_purchase: boolean;
  status: ReviewStatus;
  admin_reply: string | null;
  admin_replied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewEligibility = {
  eligible: boolean;
  order_id: string | null;
  existing_review: ProductReview | null;
};

export type WishlistToggleResult = {
  ok: boolean;
  requiresAuth?: boolean;
  in_wishlist?: boolean;
  wishlist_count?: number;
  error?: string;
};

export type RatingDistributionRow = {
  stars: number;
  count: number;
  percentage: number;
};

export type RatingStatsSummary = {
  average: number;
  total: number;
  distribution: RatingDistributionRow[];
};

const RATING_LABELS: Record<Lang, Record<number, string>> = {
  ar: {
    1: "ضعيف",
    2: "مقبول",
    3: "جيد",
    4: "جيد جداً",
    5: "ممتاز",
  },
  en: {
    1: "Poor",
    2: "Fair",
    3: "Good",
    4: "Very Good",
    5: "Excellent",
  },
};

export function ratingLabel(stars: number, lang: Lang): string {
  const clamped = Math.max(1, Math.min(5, Math.round(stars)));
  return RATING_LABELS[lang][clamped] ?? "";
}

export function formatRatingScore(score: number): string {
  if (!Number.isFinite(score) || score <= 0) return "0.0";
  return score.toFixed(1);
}

export function computeRatingStats(reviews: ProductReview[]): RatingStatsSummary {
  const published = reviews.filter((r) => r.status === "published");
  const total = published.length;
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;

  for (const r of published) {
    const s = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
    counts[s] = (counts[s] ?? 0) + 1;
    sum += s;
  }

  const average = total > 0 ? Math.round((sum / total) * 100) / 100 : 0;
  const distribution: RatingDistributionRow[] = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: counts[stars] ?? 0,
    percentage: total > 0 ? Math.round(((counts[stars] ?? 0) / total) * 100) : 0,
  }));

  return { average, total, distribution };
}

export function authorInitials(name: string): string {
  const clean = (name || "").trim();
  if (!clean) return "★";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}
