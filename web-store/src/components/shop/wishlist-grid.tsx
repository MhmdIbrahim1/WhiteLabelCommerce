"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Heart,
  Star,
  Trash2,
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  Package,
} from "lucide-react";
import type { Product } from "@/lib/shop";
import { localizedText, t } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import { formatRatingScore } from "@/lib/reviews-wishlist";
import { useLanguage } from "@/components/language-provider";
import { Buy } from "./buy";
import { useWishlist } from "./wishlist-provider";
import {
  ProductDiscountBadge,
  ProductPriceDisplay,
} from "./flash-countdown";

export type WishlistCardProduct = Product & {
  image_url: string | null;
};

export function WishlistGrid({
  initialProducts,
  currency,
  basePath = "",
}: {
  initialProducts: WishlistCardProduct[];
  currency: string;
  basePath?: string;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  const { toggle } = useWishlist();

  const [items, setItems] = useState<WishlistCardProduct[]>(initialProducts);
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());

  async function handleRemove(productId: string) {
    setRemovingIds((prev) => new Set(prev).add(productId));
    setTimeout(() => {
      setItems((prev) => prev.filter((p) => p.id !== productId));
    }, 180);
    await toggle(productId);
  }

  if (items.length === 0) {
    return (
      <div className="panel wishlist-empty-card shop-animate">
        <span className="wishlist-empty-icon" aria-hidden="true">
          <Heart size={28} strokeWidth={1.6} />
        </span>
        <h2>
          {isEn ? "Your wishlist is empty" : "قائمة المفضلة فارغة حالياً"}
        </h2>
        <p>
          {isEn
            ? "Tap the heart on any product you love to save it here and receive alerts when prices drop or sold-out items return."
            : "اضغط على أيقونة القلب بجانب أي منتج يعجبك لحفظه هنا ومتابعة انخفاض الأسعار أو توفره من جديد."}
        </p>
        <Link href={storeHref(basePath, "/products")} className="cta">
          <ShoppingBag size={16} />
          <span>{isEn ? "Explore Catalog" : "تصفّح المنتجات"}</span>
          <ArrowIcon size={15} />
        </Link>
      </div>
    );
  }

  return (
    <div className="product-grid wishlist-grid">
      {items.map((p, idx) => {
        const title = localizedText(lang, p.name, p.name_en);
        const detailHref = storeHref(basePath, "/products/" + p.id);
        const isRemoving = removingIds.has(p.id);
        const reviewCount = Number(p.review_count ?? 0);
        const avgRating = Number(p.avg_rating ?? 0);

        return (
          <article
            key={p.id}
            className={`tile shop-animate ${isRemoving ? "wishlist-card-removing" : ""}`}
            style={{ animationDelay: `${Math.min(idx, 7) * 40}ms` }}
          >
            <div className="tile-media">
              <Link
                href={detailHref}
                className="tile-photo-link"
                aria-label={title}
              >
                <div className="product-photo">
                  {p.image_url ? (
                    <Image fill unoptimized src={p.image_url} alt={title} />
                  ) : (
                    <Package size={44} strokeWidth={1.1} />
                  )}
                </div>
              </Link>

              <ProductDiscountBadge product={p} lang={lang} />

              <button
                type="button"
                className="wishlist-heart-btn is-saved"
                aria-label={isEn ? "Remove from wishlist" : "إزالة من المفضلة"}
                onClick={() => void handleRemove(p.id)}
              >
                <Trash2 size={15} />
              </button>

              <span
                className={`wishlist-stock-pill ${p.stock > 0 ? "is-in" : "is-out"}`}
              >
                {p.stock > 0
                  ? isEn
                    ? "In Stock"
                    : "متوفر"
                  : t(lang, "outOfStock")}
              </span>
            </div>

            <div className="tile-body">
              <Link href={detailHref} className="tile-title-link">
                <h3>{title}</h3>
              </Link>
              {reviewCount > 0 && (
                <span className="tile-rating-badge">
                  <Star size={12} fill="#F59E0B" stroke="#F59E0B" />
                  <strong>{formatRatingScore(avgRating)}</strong>
                  <span>({reviewCount})</span>
                </span>
              )}
              <ProductPriceDisplay
                product={p}
                currency={currency}
                lang={lang}
              />
              <div className="wishlist-card-cta">
                <Buy p={p} basePath={basePath} />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
