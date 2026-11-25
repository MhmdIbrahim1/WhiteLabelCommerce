import Link from "next/link";
import Image from "next/image";
import { Package, Star } from "lucide-react";
import { photo, type Product } from "@/lib/shop";
import { localizedText, t, type Lang } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import { formatRatingScore } from "@/lib/reviews-wishlist";
import { Buy } from "./buy";
import { WishlistHeartButton } from "./wishlist-heart";
import {
  ProductDiscountBadge,
  ProductPriceDisplay,
} from "./flash-countdown";

export function Picture({ p, lang = "ar" }: { p: Product; lang?: Lang }) {
  const src = photo(p.image_path);
  const alt = localizedText(lang, p.name, p.name_en);
  return (
    <div className="product-photo">
      {src ? (
        <Image fill unoptimized src={src} alt={alt} />
      ) : (
        <Package size={44} strokeWidth={1.1} />
      )}
    </div>
  );
}

export function Price({
  p,
  currency,
  lang = "ar",
  variant = "card",
}: {
  p: Product;
  currency: string;
  lang?: Lang;
  variant?: "card" | "detail";
}) {
  return (
    <ProductPriceDisplay
      product={p}
      currency={currency}
      lang={lang}
      variant={variant}
    />
  );
}

export function Grid({
  rows,
  currency,
  lang = "ar",
  basePath = "",
  layout = "grid",
}: {
  rows: Product[];
  currency: string;
  lang?: Lang;
  basePath?: string;
  layout?: "grid" | "carousel";
}) {
  if (!rows.length) return <p className="panel">{t(lang, "noMatchingProducts")}</p>;
  return (
    <div
      className={
        layout === "carousel"
          ? "product-grid product-grid--carousel"
          : "product-grid"
      }
    >
      {rows.map((p, idx) => {
        const title = localizedText(lang, p.name, p.name_en);
        const detailHref = storeHref(basePath, "/products/" + p.id);
        const reviewCount = Number(p.review_count ?? 0);
        const avgRating = Number(p.avg_rating ?? 0);
        return (
          <article
            className="tile shop-animate"
            style={{ animationDelay: `${Math.min(idx, 7) * 40}ms` }}
            key={p.id}
          >
            <div className="tile-media">
              <Link
                href={detailHref}
                className="tile-photo-link"
                aria-label={title}
              >
                <Picture p={p} lang={lang} />
              </Link>
              <ProductDiscountBadge product={p} lang={lang} />
              <WishlistHeartButton productId={p.id} />
              <div className="tile-quick-add">
                <Buy p={p} basePath={basePath} />
              </div>
            </div>
            <div className="tile-body">
              <Link href={detailHref} className="tile-title-link">
                <h3>{title}</h3>
              </Link>
              {reviewCount > 0 && (
                <span
                  className="tile-rating-badge"
                  aria-label={`${formatRatingScore(avgRating)} (${reviewCount})`}
                >
                  <Star size={12} fill="#F59E0B" stroke="#F59E0B" />
                  <strong>{formatRatingScore(avgRating)}</strong>
                  <span>({reviewCount})</span>
                </span>
              )}
              <Price p={p} currency={currency} lang={lang} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
