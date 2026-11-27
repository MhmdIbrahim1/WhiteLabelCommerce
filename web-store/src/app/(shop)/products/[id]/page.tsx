import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { STORE_CANONICAL_HEADER } from "@/lib/tenant-shared";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import { serverDb, checked } from "@/lib/db";
import { settings, productFields, type Product } from "@/lib/shop";
import { localizedText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { storeHref } from "@/lib/tenant";
import {
  formatRatingScore,
  type ProductReview,
  type ReviewEligibility,
} from "@/lib/reviews-wishlist";
import { Price, Grid } from "@/components/shop/cards";
import { ProductPurchase } from "@/components/shop/gallery";
import { ProductSpecsTable } from "@/components/shop/product-specs";
import { StoreCopy } from "@/components/shop/store-copy";
import { WishlistHeartButton } from "@/components/shop/wishlist-heart";
import { ProductReviewsSection } from "@/components/shop/product-reviews";
import { ProductViewTracker } from "@/components/shop/product-view-tracker";
import { resolveEffectivePrice, serverNowMs } from "@/lib/flash-sale";
import { storefrontAppearance } from "@/lib/storefront-appearance";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loadProduct = cache(async (storeId: string, id: string) => {
  const db = await serverDb();
  const isUuid = UUID_RE.test(id);
  const query = db
    .from("products")
    .select(productFields + ",image_paths,color_images,product_variants(color,size,stock)")
    .eq("store_id", storeId)
    .eq("is_active", true);
  return (isUuid ? query.eq("id", id) : query.eq("slug", id))
    .maybeSingle<Product>();
});

export async function generateMetadata({
  params,
}: PageProps<"/products/[id]">): Promise<Metadata> {
  try {
    const [{ id }, s] = await Promise.all([params, settings()]);
    const { data } = await loadProduct(s.storeId, id);
    if (!data) return {};
    const lang = await getServerLang(s.uiConfig.defaultLanguage);
    const title = localizedText(lang, data.name, data.name_en);
    const desc = localizedText(lang, data.description ?? "", data.description_en);
    const canonical = (await headers()).get(STORE_CANONICAL_HEADER);
    return {
      title,
      description: desc ? desc.slice(0, 160) : undefined,
      ...(canonical && { openGraph: { url: canonical, title, description: desc?.slice(0, 160), siteName: s.name } }),
    };
  } catch {
    return {};
  }
}

export default async function Details({ params }: PageProps<"/products/[id]">) {
  const [{ id }, db, s, appearance] = await Promise.all([params, serverDb(), settings(), storefrontAppearance()]);
  const result = await loadProduct(s.storeId, id);
  if (result.error?.code === "22P02" || (!result.error && !result.data))
    notFound();
  const p = checked(result);

  const [lang, relatedRpc, authRes, reviewsRes] = await Promise.all([
    getServerLang(s.uiConfig.defaultLanguage),
    db.rpc("get_related_products", {
      p_store_id: s.storeId,
      p_product_id: p.id,
      p_limit: 6,
    }),
    db.auth.getUser(),
    db
      .from("product_reviews")
      .select(
        "id,store_id,product_id,author_name,rating,comment,is_verified_purchase,status,admin_reply,admin_replied_at,review_replies(role,body,created_at),created_at,updated_at",
      )
      .eq("store_id", s.storeId)
      .eq("product_id", p.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  let relatedProducts: Product[] = [];
  if (!relatedRpc.error && Array.isArray(relatedRpc.data)) {
    relatedProducts = relatedRpc.data as Product[];
  } else {
    const fallbackRelated = await db
      .from("products")
      .select(productFields)
      .eq("store_id", s.storeId)
      .eq("category_id", p.category_id)
      .eq("is_active", true)
      .gt("stock", 0)
      .neq("id", p.id)
      .limit(6);
    relatedProducts = fallbackRelated.error
      ? []
      : ((fallbackRelated.data ?? []) as Product[]);
  }

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
  const reviewCount = Number(p.review_count ?? initialReviews.length);
  const avgRating = Number(p.avg_rating ?? 0);
  const currentPath = storeHref(s.basePath, "/products/" + p.id);
  const initialNow = serverNowMs();

  return (
    <>
      <ProductViewTracker
        id={p.id}
        name={title}
        price={resolveEffectivePrice(p, initialNow)}
        currency={s.currency}
      />
      <nav className="sf-breadcrumb" aria-label={lang === "en" ? "Breadcrumb" : "مسار التصفّح"}>
        <Link href={storeHref(s.basePath, "/")}>{localizedText(lang, s.nameAr, s.nameEn)}</Link><ChevronRight className="sf-forward" size={14}/>
        <Link href={storeHref(s.basePath, "/products")}>{lang === "en" ? "All products" : "كل المنتجات"}</Link>
      </nav>
      <ProductPurchase key={p.id} product={p} title={title} basePath={s.basePath} currency={s.currency}
        sticky={appearance.stickyCtaEnabled} initialNow={initialNow}>
          <h1><StoreCopy text={title} lang={lang}/></h1>

          <div className="detail-meta-bar">
            {reviewCount > 0 && (
              <a href="#reviews" className="detail-rating-pill">
                <Star size={14} fill="#F59E0B" stroke="#F59E0B" />
                <strong><bdi dir="ltr">{formatRatingScore(avgRating)}</bdi></strong>
                <span>(<bdi dir="ltr">{reviewCount.toLocaleString(lang)}</bdi> {lang === "en"
                  ? (reviewCount === 1 ? "review" : "reviews") : (reviewCount === 1 ? "تقييم" : "تقييمات")})</span>
              </a>
            )}
            <WishlistHeartButton productId={p.id} variant="pill" />
          </div>

          <Price p={p} currency={s.currency} lang={lang} variant="detail" initialNow={initialNow} />
      </ProductPurchase>

      {desc && <section className="sf-description" aria-labelledby="description-title">
        <h2 id="description-title">{lang === "en" ? "Product details" : "تفاصيل المنتج"}</h2><p dir="auto"><StoreCopy text={desc} lang={lang}/></p>
      </section>}
      <ProductSpecsTable specs={p.specifications} />

      <ProductReviewsSection
        productId={p.id}
        initialReviews={initialReviews}
        initialEligibility={eligibility}
        isSignedIn={Boolean(user)}
        currentPath={currentPath}
        key={`${p.id}-${user?.id ?? "guest"}`}
      />

      {relatedProducts.length > 0 && (
        <section
          className="shop-section related-products-section shop-animate"
          data-section="related-products"
        >
          <div className="split section-head">
            <div>
              <h2>
                {lang === "en"
                  ? "Related products"
                  : "منتجات ذات صلة"}
              </h2>
            </div>
          </div>
          <Grid
            preset={appearance.preset}
            rows={relatedProducts}
            currency={s.currency}
            lang={lang}
            basePath={s.basePath}
            layout="carousel"
          />
        </section>
      )}
    </>
  );
}
