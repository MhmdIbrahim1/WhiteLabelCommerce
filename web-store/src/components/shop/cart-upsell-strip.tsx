"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { showToast } from "@/components/floating-toast";
import { Package, Plus, Sparkles, Zap } from "lucide-react";
import { money } from "@/lib/brand";
import { localizedText } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import { isFlashSaleActive, resolveEffectivePrice } from "@/lib/flash-sale";
import { useLanguage } from "@/components/language-provider";
import { change, type Line, useCartTenant } from "./cart-store";

type UpsellProduct = {
  id: string;
  name: string;
  name_en?: string | null;
  price: number;
  old_price: number | null;
  flash_sale_price?: number | null;
  flash_sale_starts_at?: string | null;
  flash_sale_ends_at?: string | null;
  stock: number;
  sizes: string[];
  colors: string[];
  image_url: string | null;
};

export function CartUpsellStrip({
  enabled,
  threshold,
  subtotal,
  currency,
  cartLines,
  basePath = "",
}: {
  enabled: boolean;
  threshold: number;
  subtotal: number;
  currency: string;
  cartLines: Line[];
  basePath?: string;
}) {
  const { lang } = useLanguage();
  const tenantId = useCartTenant();
  const isEn = lang === "en";

  const remaining = Math.max(0, threshold - subtotal);
  const shouldShow =
    enabled && Number.isFinite(threshold) && threshold > 0 && remaining > 0;

  const cartIdsKey = useMemo(() => {
    const ids = Array.from(new Set(cartLines.map((l) => l.id))).sort();
    return ids.join(",");
  }, [cartLines]);

  const roundedGap = Math.round(remaining);

  const [items, setItems] = useState<UpsellProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shouldShow) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (cartIdsKey) params.set("exclude", cartIdsKey);
        params.set("gap", String(roundedGap));
        params.set("limit", "4");

        const res = await fetch(`/api/cart-upsells?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items?: UpsellProduct[] };
        if (Array.isArray(data.items)) {
          setItems(data.items);
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setItems([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [shouldShow, cartIdsKey, roundedGap]);

  if (!shouldShow || (!loading && items.length === 0)) {
    return null;
  }

  function handleQuickAdd(item: UpsellProduct) {
    const effective = resolveEffectivePrice(item);
    const ok = change(
      tenantId,
      {
        id: item.id,
        name: item.name,
        name_en: item.name_en ?? null,
        size: item.sizes[0] ?? "",
        color: item.colors[0] ?? "",
        price: effective,
        regular_price: item.price,
        flash_sale_price: item.flash_sale_price ?? null,
        flash_sale_starts_at: item.flash_sale_starts_at ?? null,
        flash_sale_ends_at: item.flash_sale_ends_at ?? null,
        stock: item.stock,
        quantity: 1,
      },
      1,
    );
    showToast({ kind: ok ? "cart" : "info", image: item.image_url, message: ok
      ? (isEn ? "Added to cart" : "تمت الإضافة إلى السلة") : (isEn ? "Stock limit reached" : "بلغت الحد المتاح") });
  }

  return (
    <section
      className="cart-upsell-strip shop-animate"
      aria-label={
        isEn ? "Add to unlock free shipping" : "أكمل طلبك للشحن المجاني"
      }
    >
      <div className="cart-upsell-head">
        <div className="cart-upsell-title-wrap">
          <Sparkles size={15} className="cart-upsell-sparkle" aria-hidden="true" />
          <h2>
            {isEn ? "Add to unlock free shipping" : "أكمل طلبك للشحن المجاني"}
          </h2>
        </div>
        <span className="cart-upsell-gap-pill">
          {isEn
            ? `${money(remaining, currency, "en")} away`
            : `متبقي ${money(remaining, currency, "ar")}`}
        </span>
      </div>

      <div className="cart-upsell-rail">
        {items.map((item) => {
          const title = localizedText(lang, item.name, item.name_en);
          const detailHref = storeHref(basePath, "/products/" + item.id);
          const flashActive = isFlashSaleActive(item);
          const effective = resolveEffectivePrice(item);
          const needsOptions = item.sizes.length > 0 || item.colors.length > 0;

          return (
            <article key={item.id} className="cart-upsell-card">
              <Link
                href={detailHref}
                className="cart-upsell-thumb"
                aria-label={title}
              >
                {item.image_url ? (
                  <Image fill unoptimized src={item.image_url} alt={title} />
                ) : (
                  <Package size={20} strokeWidth={1.3} />
                )}
                {flashActive && (
                  <span className="cart-upsell-flash-dot" aria-hidden="true">
                    <Zap size={10} />
                  </span>
                )}
              </Link>

              <div className="cart-upsell-meta">
                <Link href={detailHref} className="cart-upsell-name">
                  {title}
                </Link>
                <div className="cart-upsell-price-row">
                  <strong className={flashActive ? "is-flash" : ""}>
                    {money(effective, currency, lang)}
                  </strong>
                  {flashActive && (
                    <del>{money(item.price, currency, lang)}</del>
                  )}
                </div>
              </div>

              {needsOptions
                ? <Link className="cart-upsell-add-btn" href={detailHref}>{isEn ? "Choose options" : "اختر الخيارات"}</Link>
                : <button type="button" className="cart-upsell-add-btn" onClick={() => handleQuickAdd(item)} disabled={item.stock <= 0}>
                    <Plus size={13} aria-hidden="true" /><span>{isEn ? "Add" : "أضف"}</span>
                  </button>}

            </article>
          );
        })}
      </div>
    </section>
  );
}
