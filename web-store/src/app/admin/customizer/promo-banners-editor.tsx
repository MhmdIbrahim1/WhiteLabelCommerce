"use client";

import {
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Sparkles,
} from "lucide-react";
import type { PromoBannerCampaign } from "@/lib/ui-config";
import type { PreviewCategory } from "./preview-frame";

export function PromoBannersEditor({
  banners,
  categories,
  isEn,
  onChange,
}: {
  banners: PromoBannerCampaign[];
  categories: PreviewCategory[];
  isEn: boolean;
  onChange: (next: PromoBannerCampaign[]) => void;
}) {
  const addBanner = () => {
    const idx = banners.length + 1;
    const item: PromoBannerCampaign = {
      id: `promo-${Date.now().toString(36)}-${idx}`,
      active: true,
      badge_ar: "عرض خاص",
      badge_en: "Special Offer",
      title_ar: `حملة ترويجية #${idx}`,
      title_en: `Promo Campaign #${idx}`,
      subtitle_ar: "اكتشف أحدث العروض والخصومات المتاحة الآن لفترة محدودة.",
      subtitle_en: "Discover limited-time offers and new arrivals curated for you.",
      cta_text_ar: "تسوّق العرض",
      cta_text_en: "Shop Offer",
      cta_link: "/products",
      image_url: null,
      gradient_start: "#164E63",
      gradient_end: "#0E7490",
    };
    onChange([...banners, item]);
  };

  const updateItem = (id: string, patch: Partial<PromoBannerCampaign>) => {
    onChange(banners.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= banners.length) return;
    const next = [...banners];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const removeItem = (id: string) => {
    onChange(banners.filter((b) => b.id !== id));
  };

  return (
    <div className="hero-cms-card promo-campaigns-editor">
      <div className="hero-cms-header">
        <span className="hero-cms-title">
          <Sparkles size={15} />
          {isEn
            ? `Promotional Banner Carousel (${banners.length})`
            : `كاروسيل البانرات الترويجية (${banners.length})`}
        </span>
        <button
          type="button"
          className="choice-pill"
          aria-pressed="true"
          onClick={addBanner}
        >
          <Plus size={14} />
          <span>{isEn ? "Add Campaign" : "إضافة بانر"}</span>
        </button>
      </div>

      {banners.length === 0 ? (
        <p className="promo-empty-hint">
          {isEn
            ? "No multi-campaign banners yet — the storefront uses the single Hero Banner above. Add 1 or more campaigns to activate the animated carousel."
            : "لا توجد حملات متعددة بعد — يعرض المتجر البانر الرئيسي أعلاه. أضف حملة أو أكثر لتفعيل الكاروسيل المتحرك على الموقع والتطبيق."}
        </p>
      ) : (
        <div className="promo-editor-list">
          {banners.map((b, idx) => (
            <div
              key={b.id}
              className={`promo-editor-item ${b.active ? "" : "is-inactive"}`}
            >
              <div className="promo-editor-item-head">
                <strong>
                  #{idx + 1} · {isEn ? b.title_en || b.title_ar : b.title_ar || b.title_en}
                </strong>
                <div className="promo-editor-actions">
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    title={isEn ? "Move up" : "تحريك لأعلى"}
                    disabled={idx === 0}
                    onClick={() => moveItem(idx, -1)}
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    title={isEn ? "Move down" : "تحريك لأسفل"}
                    disabled={idx === banners.length - 1}
                    onClick={() => moveItem(idx, 1)}
                  >
                    <ChevronDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    title={b.active ? (isEn ? "Deactivate" : "إخفاء") : isEn ? "Activate" : "تفعيل"}
                    onClick={() => updateItem(b.id, { active: !b.active })}
                  >
                    {b.active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    title={isEn ? "Delete" : "حذف"}
                    onClick={() => removeItem(b.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="hero-cms-pair">
                <label className="hero-cms-field">
                  <span>{isEn ? "Badge (AR)" : "الشارة (عربي)"}</span>
                  <input
                    type="text"
                    value={b.badge_ar}
                    onChange={(e) => updateItem(b.id, { badge_ar: e.target.value })}
                  />
                </label>
                <label className="hero-cms-field">
                  <span>{isEn ? "Badge (EN)" : "الشارة (إنجليزي)"}</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={b.badge_en}
                    onChange={(e) => updateItem(b.id, { badge_en: e.target.value })}
                  />
                </label>
              </div>

              <div className="hero-cms-pair">
                <label className="hero-cms-field">
                  <span>{isEn ? "Headline (AR)" : "العنوان (عربي)"}</span>
                  <input
                    type="text"
                    value={b.title_ar}
                    onChange={(e) => updateItem(b.id, { title_ar: e.target.value })}
                  />
                </label>
                <label className="hero-cms-field">
                  <span>{isEn ? "Headline (EN)" : "العنوان (إنجليزي)"}</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={b.title_en}
                    onChange={(e) => updateItem(b.id, { title_en: e.target.value })}
                  />
                </label>
              </div>

              <div className="hero-cms-pair">
                <label className="hero-cms-field">
                  <span>{isEn ? "Subtitle (AR)" : "الوصف (عربي)"}</span>
                  <input
                    type="text"
                    value={b.subtitle_ar}
                    onChange={(e) => updateItem(b.id, { subtitle_ar: e.target.value })}
                  />
                </label>
                <label className="hero-cms-field">
                  <span>{isEn ? "Subtitle (EN)" : "الوصف (إنجليزي)"}</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={b.subtitle_en}
                    onChange={(e) => updateItem(b.id, { subtitle_en: e.target.value })}
                  />
                </label>
              </div>

              <div className="hero-cms-pair">
                <label className="hero-cms-field">
                  <span>{isEn ? "CTA Label (AR)" : "نص الزر (عربي)"}</span>
                  <input
                    type="text"
                    value={b.cta_text_ar}
                    onChange={(e) => updateItem(b.id, { cta_text_ar: e.target.value })}
                  />
                </label>
                <label className="hero-cms-field">
                  <span>{isEn ? "CTA Label (EN)" : "نص الزر (إنجليزي)"}</span>
                  <input
                    type="text"
                    dir="ltr"
                    value={b.cta_text_en}
                    onChange={(e) => updateItem(b.id, { cta_text_en: e.target.value })}
                  />
                </label>
              </div>

              <label className="hero-cms-field">
                <span>
                  {isEn
                    ? "Target Link (/products, /products?category=..., /products/<id>)"
                    : "رابط الوجهة (/products أو قسم أو منتج)"}
                </span>
                <input
                  type="text"
                  dir="ltr"
                  value={b.cta_link}
                  onChange={(e) => updateItem(b.id, { cta_link: e.target.value })}
                  placeholder="/products"
                />
              </label>

              {categories.length > 0 && (
                <div className="choice-row">
                  <button
                    type="button"
                    className="choice-pill"
                    aria-pressed={b.cta_link === "/products"}
                    onClick={() => updateItem(b.id, { cta_link: "/products" })}
                  >
                    {isEn ? "All Products" : "كل المنتجات"}
                  </button>
                  {categories.slice(0, 4).map((cat) => {
                    const href = `/products?category=${cat.id}`;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className="choice-pill"
                        aria-pressed={b.cta_link === href}
                        onClick={() => updateItem(b.id, { cta_link: href })}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="hero-cms-pair">
                <label className="hero-cms-field">
                  <span>{isEn ? "Image URL (optional)" : "رابط الصورة (اختياري)"}</span>
                  <input
                    type="url"
                    dir="ltr"
                    value={b.image_url ?? ""}
                    onChange={(e) =>
                      updateItem(b.id, {
                        image_url: e.target.value.trim() || null,
                      })
                    }
                    placeholder="https://..."
                  />
                </label>
                <div className="promo-gradient-pickers">
                  <label className="hero-cms-field">
                    <span>{isEn ? "Start Color" : "بداية التدرج"}</span>
                    <input
                      type="color"
                      value={b.gradient_start}
                      onChange={(e) =>
                        updateItem(b.id, {
                          gradient_start: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label className="hero-cms-field">
                    <span>{isEn ? "End Color" : "نهاية التدرج"}</span>
                    <input
                      type="color"
                      value={b.gradient_end}
                      onChange={(e) =>
                        updateItem(b.id, {
                          gradient_end: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
