"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Check, SlidersHorizontal, Ruler, BellRing } from "lucide-react";
import type { Product } from "@/lib/shop";
import { resolveEffectivePrice } from "@/lib/flash-sale";
import { translateColor } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import { useLanguage } from "@/components/language-provider";
import { trackAddToCart } from "@/lib/analytics";
import { change, useCartTenant } from "./cart-store";
import { showToast } from "@/components/floating-toast";
import { indexVariants, stockLabel, variantKey } from "@/lib/variant-stock";
import { photo } from "@/lib/product-photo";
import { SizeGuideModal } from "./size-guide-modal";

export function Buy({
  p,
  detail = false,
  onColorChange,
  basePath = "",
}: {
  p: Product;
  detail?: boolean;
  onColorChange?: (color: string) => void;
  basePath?: string;
}) {
  const { lang, t } = useLanguage();
  const tenantId = useCartTenant();
  const [size, setSize] = useState(
      detail && p.sizes.length === 1 ? p.sizes[0] : "",
    ),
    [color, setColor] = useState(
      detail && p.colors.length === 1 ? p.colors[0] : "",
    ),
    [guideOpen, setGuideOpen] = useState(false),
    [restockOpen, setRestockOpen] = useState(false),
    [restockPhone, setRestockPhone] = useState(""),
    [restockBusy, setRestockBusy] = useState(false),
    [restockDone, setRestockDone] = useState(false);

  const inventory = useMemo(() => indexVariants(p.product_variants), [p.product_variants]);
  const tracked = inventory.pairs.size > 0;
  const pairStock = (c: string, s: string) => inventory.pairs.get(variantKey(c, s)) ?? 0;
  const selectedStock = !tracked ? p.stock : color || !p.colors.length
    ? size || !p.sizes.length ? pairStock(color, size) : inventory.colors.get(color) ?? 0
    : size ? inventory.sizes.get(size) ?? 0 : p.stock;
  const thumbnail = p.color_images?.[color] || photo(p.image_path);

  async function handleRestockSubscribe() {
    setRestockBusy(true);
    try {
      const variantKey = [size, color].filter(Boolean).join(" / ");
      const res = await fetch("/api/notifications/back-in-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: p.id,
          variant_key: variantKey,
          phone: restockPhone.trim() || undefined,
        }),
      });
      if (!res.ok) {
        showToast({ message: t("restockError"), kind: "error" });
      } else {
        setRestockDone(true);
        showToast({ message: t("restockSuccess"), kind: "success" });
      }
    } catch {
      showToast({ message: t("restockError"), kind: "error" });
    } finally {
      setRestockBusy(false);
    }
  }

  if (!detail && (p.sizes.length || p.colors.length))
    return (
      <Link
        className="cta atc-btn quick-add-pill"
        href={storeHref(basePath, "/products/" + p.id)}
      >
        <SlidersHorizontal size={14} />
        <span>{t("chooseOptions")}</span>
      </Link>
    );

  return (
    <>
      <form
        className={detail ? "detail-buy" : "card-buy"}
        onSubmit={(e) => {
          e.preventDefault();
          if (detail && p.sizes.length > 0 && !size) {
            showToast({ message: t("selectSizeFirst"), kind: "error" });
            return;
          }
          if (detail && p.colors.length > 0 && !color) {
            showToast({ message: t("selectColorFirst"), kind: "error" });
            return;
          }
          const effectiveUnit = resolveEffectivePrice(p);
          const added = change(
            tenantId,
            {
              id: p.id,
              name: p.name,
              name_en: p.name_en ?? null,
              size,
              color,
              price: effectiveUnit,
              regular_price: p.price,
              flash_sale_price: p.flash_sale_price ?? null,
              flash_sale_starts_at: p.flash_sale_starts_at ?? null,
              flash_sale_ends_at: p.flash_sale_ends_at ?? null,
              stock: selectedStock,
              variantStock: tracked,
              quantity: 1,
            },
            1,
          );
          if (added) {
            trackAddToCart({
              id: p.id,
              name: p.name,
              price: effectiveUnit,
              quantity: 1,
              size,
              color,
            });
          }
          showToast(added ? { message: t("addedToCart"), kind: "cart", image: thumbnail,
            action: { label: lang === "en" ? "View Cart" : "عرض السلة", href: storeHref(basePath, "/cart") } }
            : { message: t("stockLimitReached"), kind: "info" });
        }}
      >
        {detail && <span className="stock-tier" data-tier={selectedStock <= 0 ? "out" : selectedStock <= 5 ? "low" : "in"}>{stockLabel(selectedStock, lang)}</span>}
        {detail && p.sizes.length > 0 && (
          <div className="variant-group" role="radiogroup" aria-label={t("sizeLabel")}>
            <div className="variant-label-row">
              <span className="variant-label">{t("sizeLabel")}</span>
              <button
                type="button"
                className="size-guide-trigger"
                onClick={() => setGuideOpen(true)}
              >
                <Ruler size={14} aria-hidden="true" />
                <span>{t("sizeGuideBtn")}</span>
              </button>
            </div>
            <div className="variant-options">
              {p.sizes.map((s) => {
                const active = size === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className="variant-chip"
                    data-selected={active ? "true" : "false"}
                    disabled={tracked && (color || !p.colors.length ? pairStock(color, s) : inventory.sizes.get(s) ?? 0) <= 0}
                    onClick={() => setSize(s)}
                  >
                    {active && <Check size={14} />}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {detail && p.colors.length > 0 && (
          <div className="variant-group" role="radiogroup" aria-label={t("colorLabel")}>
            <span className="variant-label">{t("colorLabel")}</span>
            <div className="variant-options">
              {p.colors.map((c) => {
                const active = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className="variant-chip"
                    data-selected={active ? "true" : "false"}
                    disabled={tracked && (inventory.colors.get(c) ?? 0) <= 0}
                    onClick={() => {
                      setColor(c);
                      if (tracked && size && pairStock(c, size) === 0) setSize("");
                      onColorChange?.(c);
                    }}
                  >
                    {active && <Check size={14} />}
                    {translateColor(c, lang)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button
          type="submit"
          className={detail ? "detail-cta" : "atc-btn quick-add-pill"}
          disabled={selectedStock <= 0}
        >
          <ShoppingBag size={detail ? 17 : 15} />
          <span>{selectedStock > 0 ? detail ? t("addToBag") : t("quickAdd") : t("outOfStock")}</span>
        </button>
      </form>
      {detail && p.stock <= 0 && (
        <div className="restock-box">
          {restockDone ? (
            <p className="restock-success" role="status">
              <Check size={16} />
              <span>{t("restockSuccess")}</span>
            </p>
          ) : !restockOpen ? (
            <button
              type="button"
              className="restock-trigger-btn"
              onClick={() => setRestockOpen(true)}
            >
              <BellRing size={16} />
              <span>{t("restockNotifyBtn")}</span>
            </button>
          ) : (
            <div className="restock-form">
              <p className="restock-hint">{t("restockHint")}</p>
              <div className="restock-row">
                <input
                  type="tel"
                  dir="ltr"
                  value={restockPhone}
                  onChange={(e) => setRestockPhone(e.target.value)}
                  placeholder={t("restockPhonePlaceholder")}
                  aria-label={t("restockPhonePlaceholder")}
                />
                <button
                  type="button"
                  className="restock-submit-btn"
                  disabled={restockBusy}
                  onClick={() => void handleRestockSubscribe()}
                >
                  <BellRing size={15} />
                  <span>
                    {restockBusy ? t("restockSubmitting") : t("restockNotifyBtn")}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {detail && p.sizes.length > 0 && (
        <SizeGuideModal
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          sizes={p.sizes}
        />
      )}
    </>
  );
}
