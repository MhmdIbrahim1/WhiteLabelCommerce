import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { serverDb, checked } from "@/lib/db";
import { settings, photo, productFields, type Product } from "@/lib/shop";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { storeHref } from "@/lib/tenant";
import {
  formatRatingScore,
  type ProductReview,
  type ReviewEligibility,
} from "@/lib/reviews-wishlist";
import { Price, Grid } from "@/components/shop/cards";
import { ProductGallery } from "@/components/shop/gallery";
import { Buy } from "@/components/shop/buy";
import { ProductSpecsTable } from "@/components/shop/product-specs";
import { WishlistHeartButton } from "@/components/shop/wishlist-heart";
import { ProductReviewsSection } from "@/components/shop/product-reviews";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Details({ params }: PageProps<"/products/[id]">) {
  const [{ id }, db, s] = await Promise.all([params, serverDb(), settings()]);
  const isUuid = UUID_RE.test(id);
  const query = db
    .from("products")
    .select(productFields)
    .eq("store_id", s.storeId)
    .eq("is_active", true);
  const result = await (isUuid ? query.eq("id", id) : query.eq("slug", id))
    .maybeSingle<Product>();

  if (result.error?.code === "22P02" || (!result.error && !result.data))
    notFound();
  const p = checked(result);

  const [lang, related, authRes, reviewsRes] = await Promise.all([
    getServerLang(s.uiConfig.defaultLanguage),
    db
      .from("products")
      .select(productFields)
      .eq("store_id", s.storeId)
      .eq("category_id", p.category_id)
      .eq("is_active", true)
      .neq("id", p.id)
      .limit(4),
    db.auth.getUser(),
    db
      .from("product_reviews")
      .select(
        "id,store_id,product_id,user_id,order_id,author_name,rating,comment,is_verified_purchase,status,admin_reply,admin_replied_at,created_at,updated_at",
      )
      .eq("store_id", s.storeId)
      .eq("product_id", p.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const user = authRes.data.user;
  let eligibility: ReviewEligibility = {
    eligible: false,
    order_id: null,
    existing_review: null,
  };
  if (user) {
    const eligRes = await db.rpc("can_review_product", {
      p_store_id: s.storeId,
      p_product_id: p.id,
    });
    if (!eligRes.error && eligRes.data && typeof eligRes.data === "object") {
      const raw = eligRes.data as Partial<ReviewEligibility>;
      eligibility = {
        eligible: Boolean(raw.eligible),
        order_id: raw.order_id ?? null,
        existing_review: raw.existing_review ?? null,
      };
    }
  }

  const initialReviews = ((reviewsRes.data ?? []) as ProductReview[]).map((r) => ({
    ...r,
    rating: Number(r.rating),
  }));

  const title = localizedText(lang, p.name, p.name_en);
  const desc = localizedText(lang, p.description, p.description_en);
  const displayStoreName = localizedText(lang, s.nameAr, s.nameEn) || s.name;
  const reviewCount = Number(p.review_count ?? initialReviews.length);
  const avgRating = Number(p.avg_rating ?? 0);
  const currentPath = storeHref(s.basePath, "/products/" + p.id);

  return (
    <>
      <section className="details-grid">
        <ProductGallery src={photo(p.image_path)} alt={title} />
        <div>
          <h1>{title}</h1>

          <div className="detail-meta-bar">
            {reviewCount > 0 && (
              <a href="#reviews" className="detail-rating-pill">
                <Star size={14} fill="#F59E0B" stroke="#F59E0B" />
                <strong>{formatRatingScore(avgRating)}</strong>
                <span>
                  (
                  {lang === "en"
                    ? `${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`
                    : `${reviewCount} ${reviewCount === 1 ? "تقييم" : "تقييمات"}`}
                  )
                </span>
              </a>
            )}
            <WishlistHeartButton productId={p.id} variant="pill" />
          </div>

          <Price p={p} currency={s.currency} lang={lang} />
          <p>{desc}</p>
          <p className="detail-stock-line">
            {t(lang, "inStockLabel")} · <strong>{p.stock}</strong>
          </p>
          <Buy p={p} detail basePath={s.basePath} />
        </div>
      </section>

      <ProductSpecsTable specs={p.specifications} />

      <ProductReviewsSection
        productId={p.id}
        initialReviews={initialReviews}
        initialEligibility={eligibility}
        isSignedIn={Boolean(user)}
        currentPath={currentPath}
        storeName={displayStoreName}
      />

      <section className="shop-section">
        <div className="split section-head">
          <div>
            <span className="section-kicker">{t(lang, "kickerFeatured")}</span>
            <h2>{t(lang, "relatedProducts")}</h2>
          </div>
        </div>
        <Grid
          rows={checked(related)}
          currency={s.currency}
          lang={lang}
          basePath={s.basePath}
        />
      </section>
    </>
  );
}
