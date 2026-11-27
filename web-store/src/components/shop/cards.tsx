import { stockLabel } from "@/lib/variant-stock";
import Link from "next/link";
import Image from "next/image";
import { Package, Star } from "lucide-react";
import { serverNowMs } from "@/lib/flash-sale";
import { photo, type Product } from "@/lib/shop";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { localizedText, t, type Lang } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import { normalizeSpecs } from "@/lib/specs";
import type { StorefrontPreset } from "@/lib/storefront-presets";
import { formatRatingScore } from "@/lib/reviews-wishlist";
import { Buy } from "./buy";
import { WishlistHeartButton } from "./wishlist-heart";
import { StoreCopy } from "./store-copy";
import {
  ProductDiscountBadge,
  ProductPriceDisplay,
} from "./flash-countdown";

export function Picture({ p, lang = "ar" }: { p: Product; lang?: Lang }) {
  const src = storefrontImageSrc(photo(p.image_path), 640);
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
  initialNow,
}: {
  p: Product;
  currency: string;
  lang?: Lang;
  variant?: "card" | "detail";
  initialNow?: number;
}) {
  return (
    <ProductPriceDisplay
      product={p}
      currency={currency}
      lang={lang}
      variant={variant}
      initialNow={initialNow ?? serverNowMs()}
    />
  );
}

export function Grid({
  rows,
  currency,
  lang = "ar",
  basePath = "",
  layout = "grid",
  preset,
}: {
  rows: Product[];
  currency: string;
  lang?: Lang;
  basePath?: string;
  layout?: "grid" | "carousel";
  preset: StorefrontPreset;
}) {
  const initialNow = serverNowMs();
  if (!rows.length) return <p className="panel shop-empty-state">{t(lang, "noMatchingProducts")}</p>;
  return (
    <div
      className={
        layout === "carousel"
          ? "product-grid product-grid--carousel"
          : "product-grid"
      }
    >
      {rows.map((p) => {
        const title = localizedText(lang, p.name, p.name_en);
        const detailHref = storeHref(basePath, "/products/" + p.id);
        const reviewCount = Number(p.review_count ?? 0);
        const avgRating = Number(p.avg_rating ?? 0);
        const specs = preset === "tech_precision" ? normalizeSpecs(p.specifications).slice(0, 2) : [];
        return (
          <article
            className="tile"
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
              <ProductDiscountBadge product={p} lang={lang} initialNow={initialNow} />
              <WishlistHeartButton productId={p.id} />
            </div>
            <div className="tile-body">
              <Link href={detailHref} className="tile-title-link">
                <h3><StoreCopy text={title} lang={lang}/></h3>
              </Link>
              {reviewCount > 0 && (
                <span
                  className="tile-rating-badge"
                  aria-label={`${formatRatingScore(avgRating)} (${reviewCount})`}
                >
                  <Star size={12} fill="#F59E0B" stroke="#F59E0B" />
                  <strong><bdi dir="ltr">{formatRatingScore(avgRating)}</bdi></strong>
                  <bdi dir="ltr">({reviewCount})</bdi>
                </span>
              )}
              <span className="stock-tier" data-tier={p.stock <= 0 ? "out" : p.stock <= 5 ? "low" : "in"}>{stockLabel(p.stock, lang)}</span>
              {specs.length > 0 && <dl className="sf-spec-badges">{specs.map((spec, index) =>
                <div key={index}><dt><StoreCopy text={localizedText(lang, spec.key_ar, spec.key_en)} lang={lang}/></dt>
                  <dd><StoreCopy text={localizedText(lang, spec.value_ar, spec.value_en)} lang={lang}/></dd></div>)}</dl>}
              <Price p={p} currency={currency} lang={lang} initialNow={initialNow} />
            </div>
            <div className="sf-card-action"><Buy p={p} basePath={basePath} /></div>
          </article>
        );
      })}
    </div>
  );
}
