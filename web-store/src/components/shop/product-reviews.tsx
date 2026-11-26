"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Star,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  PenLine,
  LogIn,
  Info,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useReviewReplies } from "@/components/use-review-replies";
import { formatDate } from "@/lib/i18n";
import {
  authorInitials,
  computeRatingStats,
  formatRatingScore,
  ratingLabel,
  withReviewReply,
  type ProductReview,
  type ReviewEligibility,
  type ReviewReply,
} from "@/lib/reviews-wishlist";
import { ReviewThread, ReplyComposer } from "@/components/review-thread";
import { submitFollowUpAction, submitReviewAction } from "@/app/(shop)/products/[id]/actions";

function StarRow({
  value,
  size = 15,
}: {
  value: number;
  size?: number;
}) {
  const rounded = Math.round(value);
  return (
    <span className="review-stars-row" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          fill={n <= rounded ? "#F59E0B" : "none"}
          stroke={n <= rounded ? "#F59E0B" : "#CBD5E1"}
          strokeWidth={1.8}
        />
      ))}
    </span>
  );
}

export function ProductReviewsSection({
  productId,
  initialReviews,
  initialEligibility,
  isSignedIn,
  currentPath,
}: {
  productId: string;
  initialReviews: ProductReview[];
  initialEligibility: ReviewEligibility;
  isSignedIn: boolean;
  currentPath: string;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";

  const [reviews, setReviews] = useState<ProductReview[]>(initialReviews);
  useReviewReplies(initialReviews[0]?.store_id, setReviews);
  const [existingReview, setExistingReview] = useState<ProductReview | null>(
    initialEligibility.existing_review,
  );
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "highest">("newest");

  // Write / Edit form state
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number>(
    initialEligibility.existing_review?.rating ?? 5,
  );
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState<string>(
    initialEligibility.existing_review?.comment ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  const stats = useMemo(() => computeRatingStats(reviews), [reviews]);

  const filteredReviews = useMemo(() => {
    const published = reviews.filter((r) => r.status === "published");
    const byStar =
      starFilter !== null
        ? published.filter((r) => Math.round(r.rating) === starFilter)
        : published;
    return [...byStar].sort((a, b) => {
      if (sortBy === "highest") {
        if (b.rating !== a.rating) return b.rating - a.rating;
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [reviews, starFilter, sortBy]);

  const activePreviewStars = hoverRating ?? selectedRating;
  const activeRatingCaption = ratingLabel(activePreviewStars, lang);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    setFormSuccess(false);
    try {
      const res = await submitReviewAction({
        productId,
        rating: selectedRating,
        comment,
      });
      if (!res.ok) {
        if (res.error.includes("verified_purchase_required")) {
          setFormError(
            isEn
              ? "Reviews are exclusive to verified delivered orders of this product."
              : "التقييمات متاحة فقط للمشترين الذين تم تسليم طلبهم لهذا المنتج.",
          );
        } else if (res.error.includes("auth_required")) {
          setFormError(
            isEn
              ? "Please sign in first to submit a review."
              : "يرجى تسجيل الدخول أولاً لإرسال تقييمك.",
          );
        } else {
          setFormError(
            isEn
              ? "Could not save your review right now. Please try again."
              : "تعذر حفظ تقييمك حالياً. يرجى المحاولة مرة أخرى.",
          );
        }
        return;
      }

      const saved = res.review;
      setExistingReview(saved);
      setReviews((prev) => {
        const idx = prev.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...saved };
          return next;
        }
        return [saved, ...prev];
      });
      setFormSuccess(true);
      setFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      id="reviews"
      className="shop-section reviews-section shop-animate"
      aria-labelledby="reviews-heading"
    >
      <div className="split section-head">
        <div>
          <span className="section-kicker">
            {isEn ? "Verified Customer Feedback" : "آراء وتقييمات المشترين"}
          </span>
          <h2 id="reviews-heading">
            {isEn ? "Customer Reviews" : "تقييمات المنتج"}
          </h2>
        </div>

        {initialEligibility.eligible && (
          <button
            type="button"
            className="reviews-write-toggle-btn"
            onClick={() => {
              setFormOpen((v) => !v);
              setFormSuccess(false);
              setFormError("");
            }}
          >
            <PenLine size={15} />
            <span>
              {existingReview
                ? isEn
                  ? "Edit Your Review"
                  : "تعديل تقييمك"
                : isEn
                  ? "Write a Review"
                  : "أضف تقييمك"}
            </span>
          </button>
        )}
      </div>

      {/* Rating Summary Header (Two-Column Calm Editorial Layout) */}
      <div className="panel reviews-summary-card">
        <div className="reviews-score-col">
          <div className="reviews-big-score">
            {stats.total > 0 ? formatRatingScore(stats.average) : "—"}
          </div>
          <StarRow value={stats.average} size={19} />
          <p className="reviews-total-caption">
            {stats.total > 0
              ? isEn
                ? `Based on ${stats.total} verified ${stats.total === 1 ? "review" : "reviews"}`
                : `بناءً على ${stats.total} ${stats.total === 1 ? "تقييم موثّق" : stats.total === 2 ? "تقييمَين موثّقَين" : "تقييمات موثّقة"}`
              : isEn
                ? "No verified reviews yet"
                : "لا توجد تقييمات موثّقة بعد"}
          </p>
        </div>

        <div className="reviews-bars-col">
          {stats.distribution.map((row) => {
            const active = starFilter === row.stars;
            return (
              <button
                key={row.stars}
                type="button"
                className={`reviews-bar-row ${active ? "is-active" : ""}`}
                onClick={() =>
                  setStarFilter((prev) =>
                    prev === row.stars ? null : row.stars,
                  )
                }
                aria-pressed={active}
              >
                <span className="reviews-bar-label">
                  <span>{row.stars}</span>
                  <Star size={12} fill="#F59E0B" stroke="#F59E0B" />
                </span>
                <span className="reviews-bar-track" aria-hidden="true">
                  <span
                    className="reviews-bar-fill"
                    style={{ width: `${row.percentage}%` }}
                  />
                </span>
                <span className="reviews-bar-count">{row.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Save Confirmation Banner */}
      {formSuccess && (
        <div className="reviews-success-banner" role="status">
          <CheckCircle2 size={17} />
          <span>
            {isEn
              ? "Thank you! Your verified review has been saved."
              : "شكراً لك! تم حفظ تقييمك الموثّق بنجاح."}
          </span>
        </div>
      )}

      {/* Frictionless Write / Edit Review Flow OR Calm Neutral Eligibility Note */}
      {initialEligibility.eligible ? (
        formOpen && (
          <form
            className="panel reviews-form-card"
            onSubmit={(e) => void handleSubmit(e)}
          >
            <div className="reviews-form-head">
              <div>
                <h3>
                  {existingReview
                    ? isEn
                      ? "Update Your Verified Review"
                      : "تعديل تقييمك الموثّق"
                    : isEn
                      ? "Share Your Experience"
                      : "شاركنا تجربتك مع المنتج"}
                </h3>
                <p>
                  {isEn
                    ? "Your review is marked with a Verified Purchase badge."
                    : "سيظهر تقييمك بشارة «مشتري موثّق» لمساعدة المتسوقين الآخرين."}
                </p>
              </div>
              <span className="verified-purchase-pill">
                <ShieldCheck size={13} />
                <span>{isEn ? "Verified Buyer" : "مشتري موثّق"}</span>
              </span>
            </div>

            <div className="reviews-star-picker-wrap">
              <div
                className="reviews-star-picker"
                role="radiogroup"
                aria-label={isEn ? "Select rating" : "اختر التقييم"}
                onMouseLeave={() => setHoverRating(null)}
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const filled = star <= activePreviewStars;
                  return (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={selectedRating === star}
                      aria-label={`${star} ${isEn ? "stars" : "نجوم"} — ${ratingLabel(star, lang)}`}
                      className={`reviews-star-tap ${filled ? "is-filled" : ""}`}
                      onMouseEnter={() => setHoverRating(star)}
                      onFocus={() => setHoverRating(star)}
                      onBlur={() => setHoverRating(null)}
                      onClick={() => setSelectedRating(star)}
                    >
                      <Star
                        size={26}
                        fill={filled ? "#F59E0B" : "none"}
                        stroke={filled ? "#F59E0B" : "#94A3B8"}
                        strokeWidth={1.8}
                      />
                    </button>
                  );
                })}
              </div>
              <span className="reviews-star-caption">
                <Sparkles size={14} aria-hidden="true" />
                <strong>
                  {activePreviewStars}★ · {activeRatingCaption}
                </strong>
              </span>
            </div>

            <label className="reviews-textarea-label">
              <span>
                {isEn
                  ? "Your Review (optional details about fit, quality, delivery)"
                  : "رأيك في المنتج (اختياري — الخامة، المقاس، سرعة التوصيل)"}
              </span>
              <textarea
                rows={4}
                maxLength={1500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  isEn
                    ? "What did you love most about this item?"
                    : "ما أكثر ما أعجبك في المنتج؟ شارك تفاصيل تفيد المشترين الآخرين..."
                }
              />
              <small className="reviews-char-counter">
                {comment.length} / 1500
              </small>
            </label>

            {formError && (
              <p className="reviews-form-error" role="alert">
                {formError}
              </p>
            )}

            <div className="reviews-form-actions">
              <button
                type="submit"
                disabled={submitting}
                className="reviews-submit-btn"
              >
                {submitting
                  ? isEn
                    ? "Saving Review…"
                    : "جارٍ الحفظ…"
                  : existingReview
                    ? isEn
                      ? "Save Changes"
                      : "حفظ التعديل"
                    : isEn
                      ? "Publish Review"
                      : "نشر التقييم"}
              </button>
              <button
                type="button"
                className="reviews-cancel-btn"
                onClick={() => setFormOpen(false)}
              >
                {isEn ? "Cancel" : "إلغاء"}
              </button>
            </div>
          </form>
        )
      ) : (
        <div className="reviews-eligibility-note" role="note">
          <Info size={16} aria-hidden="true" />
          <div className="reviews-eligibility-copy">
            <span>
              {isSignedIn
                ? isEn
                  ? "Reviews are exclusive to verified customers who have received a delivered order containing this product."
                  : "التقييمات مخصّصة حصرياً للعملاء الذين اشتروا هذا المنتج وتم تسليم طلبهم بنجاح لضمان مصداقية الآراء."
                : isEn
                  ? "Bought this item? Sign in to leave a verified purchase review once your order is delivered."
                  : "هل اشتريت هذا المنتج من قبل؟ سجّل الدخول لإضافة تقييم موثّق بعد استلام طلبك."}
            </span>
          </div>
          {!isSignedIn && (
            <Link
              href={`/login?next=${encodeURIComponent(currentPath + "#reviews")}`}
              className="reviews-signin-chip"
            >
              <LogIn size={14} />
              <span>{isEn ? "Sign In" : "تسجيل الدخول"}</span>
            </Link>
          )}
        </div>
      )}

      {/* Filter Chips & Sort Controls */}
      {stats.total > 0 && (
        <div className="reviews-toolbar">
          <div
            className="reviews-filter-chips"
            role="group"
            aria-label={isEn ? "Filter by rating" : "تصفية حسب التقييم"}
          >
            <button
              type="button"
              className={`reviews-chip ${starFilter === null ? "is-active" : ""}`}
              onClick={() => setStarFilter(null)}
            >
              {isEn ? `All (${stats.total})` : `الكل (${stats.total})`}
            </button>
            {stats.distribution
              .filter((d) => d.count > 0)
              .map((d) => (
                <button
                  key={d.stars}
                  type="button"
                  className={`reviews-chip ${starFilter === d.stars ? "is-active" : ""}`}
                  onClick={() =>
                    setStarFilter((prev) => (prev === d.stars ? null : d.stars))
                  }
                >
                  <span>{d.stars}★</span>
                  <span className="reviews-chip-count">({d.count})</span>
                </button>
              ))}
          </div>

          <label className="reviews-sort-wrap">
            <span>{isEn ? "Sort:" : "ترتيب:"}</span>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value === "highest" ? "highest" : "newest")
              }
            >
              <option value="newest">
                {isEn ? "Newest" : "الأحدث"}
              </option>
              <option value="highest">
                {isEn ? "Highest Rated" : "الأعلى تقييماً"}
              </option>
            </select>
          </label>
        </div>
      )}

      {/* Review Cards List */}
      {filteredReviews.length > 0 ? (
        <div className="reviews-list">
          {filteredReviews.map((review) => (
            <article key={review.id} className="panel review-card">
              <header className="review-card-head">
                <div className="review-author-wrap">
                  <span className="review-avatar" aria-hidden="true">
                    {authorInitials(review.author_name)}
                  </span>
                  <div className="review-author-meta">
                    <div className="review-author-line">
                      <strong>{review.author_name}</strong>
                      {review.is_verified_purchase && (
                        <span className="verified-purchase-pill">
                          <CheckCircle2 size={12} />
                          <span>
                            {isEn ? "Verified Purchase" : "مشتري موثّق"}
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="review-rating-date">
                      <StarRow value={review.rating} size={14} />
                      <time dateTime={review.created_at}>
                        {formatDate(review.created_at, lang)}
                      </time>
                    </div>
                  </div>
                </div>
              </header>

              {review.comment.trim() && (
                <p className="review-comment-body">{review.comment}</p>
              )}

              <ReviewFollowUp
                review={review}
                isAuthor={isSignedIn && existingReview?.id === review.id}
                onSaved={(reply) => setReviews((prev) => prev.map((r) => r.id === review.id
                  ? withReviewReply(r, reply) : r))}
              />
            </article>
          ))}
        </div>
      ) : stats.total > 0 ? (
        <div className="panel reviews-empty-filter">
          <p>
            {isEn
              ? `No ${starFilter}-star reviews yet.`
              : `لا توجد تقييمات بـ ${starFilter} نجوم حتى الآن.`}
          </p>
          <button
            type="button"
            className="reviews-chip is-active"
            onClick={() => setStarFilter(null)}
          >
            {isEn ? "Show All Reviews" : "عرض كل التقييمات"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ReviewFollowUp({ review, isAuthor, onSaved }: {
  review: ProductReview;
  isAuthor: boolean;
  onSaved: (reply: ReviewReply) => void;
}) {
  const { lang } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!review.admin_reply) return null;
  const canReply = isAuthor && review.status === "published" && !review.review_replies?.length;
  const label = lang === "en" ? "Reply to store" : "الرد على المتجر";
  return (
    <div>
      <ReviewThread review={review} lang={lang} expanded={expanded} onToggle={setExpanded} />
      {canReply && (editing ? (
        <ReplyComposer lang={lang} label={label} onCancel={() => setEditing(false)}
          onSave={async (body) => {
            const result = await submitFollowUpAction(review.id, body);
            if (!result.ok) return false;
            onSaved(result.reply);
            setExpanded(true);
            setEditing(false);
            return true;
          }} />
      ) : (
        <button type="button" className="review-thread-link" onClick={() => setEditing(true)}>{label}</button>
      ))}
    </div>
  );
}
