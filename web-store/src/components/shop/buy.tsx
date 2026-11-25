"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, Check, SlidersHorizontal, Ruler, BellRing } from "lucide-react";
import type { Product } from "@/lib/shop";
import { translateColor } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import { useLanguage } from "@/components/language-provider";
import { change } from "./cart-store";
import { SizeGuideModal } from "./size-guide-modal";

export function Buy({
  p,
  detail = false,
  basePath = "",
}: {
  p: Product;
  detail?: boolean;
  basePath?: string;
}) {
  const { lang, t } = useLanguage();
  const [size, setSize] = useState(
      detail && p.sizes.length === 1 ? p.sizes[0] : "",
    ),
    [color, setColor] = useState(
      detail && p.colors.length === 1 ? p.colors[0] : "",
    ),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [guideOpen, setGuideOpen] = useState(false),
    [restockOpen, setRestockOpen] = useState(false),
    [restockPhone, setRestockPhone] = useState(""),
    [restockBusy, setRestockBusy] = useState(false),
    [restockDone, setRestockDone] = useState(false),
    [restockErr, setRestockErr] = useState("");

  async function handleRestockSubscribe() {
    setRestockBusy(true);
    setRestockErr("");
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
        setRestockErr(t("restockError"));
      } else {
        setRestockDone(true);
      }
    } catch {
      setRestockErr(t("restockError"));
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
            setError(t("selectSizeFirst"));
            setMessage("");
            return;
          }
          if (detail && p.colors.length > 0 && !color) {
            setError(t("selectColorFirst"));
            setMessage("");
            return;
          }
          setError("");
          setMessage(
            change({ ...p, size, color, quantity: 1 }, 1)
              ? t("addedToCart")
              : t("stockLimitReached"),
          );
        }}
      >
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
                    onClick={() => {
                      setSize(s);
                      setError("");
                    }}
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
                    onClick={() => {
                      setColor(c);
                      setError("");
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
          disabled={p.stock <= 0}
        >
          {message && !detail ? (
            <>
              <Check size={15} />
              <span>{message}</span>
            </>
          ) : (
            <>
              <ShoppingBag size={detail ? 17 : 15} />
              <span>
                {p.stock > 0
                  ? detail
                    ? t("addToBag")
                    : t("quickAdd")
                  : t("outOfStock")}
              </span>
            </>
          )}
        </button>
        {error && (
          <small role="alert" className="variant-error">
            {error}
          </small>
        )}
        {detail && message && <small role="status">{message}</small>}
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
              {restockErr && (
                <small role="alert" className="variant-error">
                  {restockErr}
                </small>
              )}
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
