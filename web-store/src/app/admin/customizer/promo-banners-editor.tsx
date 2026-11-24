"use client";

import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Sparkles,
  Upload,
  ImageIcon,
} from "lucide-react";
import type { PromoBannerCampaign } from "@/lib/ui-config";
import { localizedText } from "@/lib/i18n";
import { uploadHeroBannerImage } from "../mutations";
import type { PreviewCategory } from "./preview-frame";

export function PromoBannersEditor({
  banners,
  categories,
  isEn,
  onChange,
  onError,
}: {
  banners: PromoBannerCampaign[];
  categories: PreviewCategory[];
  isEn: boolean;
  onChange: (next: PromoBannerCampaign[]) => void;
  onError?: (msg: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const activeCount = banners.filter((b) => b.active).length;

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
      gradient_end: "#0F172A",
    };
    onChange([...banners, item]);
    setExpandedId(item.id);
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
    if (expandedId === id) setExpandedId(null);
  };

  const handleSlideImageUpload = async (
    slideId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingId(slideId);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadHeroBannerImage(fd);
      if (res.ok) {
        updateItem(slideId, { image_url: res.url });
      } else {
        onError?.(
          isEn
            ? "Could not upload slide image (PNG, JPG, or WEBP up to 5 MB)."
            : "تعذر رفع صورة الشريحة (يجب أن تكون PNG أو JPG أو WEBP بحد أقصى 5 م.ب).",
        );
      }
    } catch {
      onError?.(
        isEn
          ? "Slide image upload failed. Please try again."
          : "حدث خطأ أثناء رفع صورة الشريحة. حاول مرة أخرى.",
      );
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="hero-cms-card promo-campaigns-editor">
      <div className="promo-editor-top">
        <div className="promo-editor-heading">
          <span className="promo-editor-title">
            <Sparkles size={15} />
            <strong>
              {isEn
                ? "Promotional Banner Carousel"
                : "كاروسيل البانرات الترويجية"}
            </strong>
          </span>
          <small>
            {isEn
              ? `${activeCount} active of ${banners.length} slides · synced on Web & Android`
              : `${activeCount} نشط من ${banners.length} شرائح · متزامن على الموقع والتطبيق`}
          </small>
        </div>
        <button
          type="button"
          className="btn-add-section"
          onClick={addBanner}
        >
          <Plus size={14} />
          <span>{isEn ? "Add Slide" : "إضافة شريحة"}</span>
        </button>
      </div>

      {banners.length === 0 ? (
        <p className="promo-empty-hint">
          {isEn
            ? "No carousel slides yet — the storefront falls back to the single Hero Banner below. Add one or more slides to activate the animated multi-slide carousel."
            : "لا توجد شرائح للكاروسيل بعد — يعرض المتجر البانر المفرد الاحتياطي بالأسفل. أضف شريحة أو أكثر لتفعيل الكاروسيل المتحرك."}
        </p>
      ) : (
        <div className="promo-editor-list">
          {banners.map((b, idx) => {
            const isExpanded = expandedId === b.id;
            const displayTitle = isEn
              ? b.title_en || b.title_ar || `Slide #${idx + 1}`
              : b.title_ar || b.title_en || `شريحة #${idx + 1}`;
            const displayBadge = isEn
              ? b.badge_en || b.badge_ar
              : b.badge_ar || b.badge_en;

            return (
              <div
                key={b.id}
                className={`promo-editor-item ${b.active ? "" : "is-inactive"} ${isExpanded ? "is-expanded" : ""}`}
              >
                <div className="promo-editor-item-head">
                  <button
                    type="button"
                    className="promo-slide-summary"
                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                    aria-expanded={isExpanded}
                  >
                    <span
                      className="promo-slide-thumb"
                      style={{
                        background: b.image_url
                          ? `url("${b.image_url}") center/cover no-repeat`
                          : `linear-gradient(135deg, ${b.gradient_start}, ${b.gradient_end})`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="promo-slide-meta">
                      <strong>
                        #{idx + 1} · {displayTitle}
                      </strong>
                      <small>
                        {b.active
                          ? isEn
                            ? "Active"
                            : "نشط"
                          : isEn
                            ? "Hidden"
                            : "مخفي"}
                        {displayBadge ? ` · ${displayBadge}` : ""}
                      </small>
                    </span>
                  </button>

                  <div className="promo-editor-actions">
                    <button
                      type="button"
                      className="sec-icon-btn"
                      title={isEn ? "Move up" : "تحريك لأعلى"}
                      aria-label={isEn ? `Move slide ${idx + 1} up` : `تحريك الشريحة ${idx + 1} لأعلى`}
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="sec-icon-btn"
                      title={isEn ? "Move down" : "تحريك لأسفل"}
                      aria-label={isEn ? `Move slide ${idx + 1} down` : `تحريك الشريحة ${idx + 1} لأسفل`}
                      disabled={idx === banners.length - 1}
                      onClick={() => moveItem(idx, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className={`sec-icon-btn ${b.active ? "is-on" : "is-off"}`}
                      title={
                        b.active
                          ? isEn
                            ? "Hide slide"
                            : "إخفاء الشريحة"
                          : isEn
                            ? "Activate slide"
                            : "تفعيل الشريحة"
                      }
                      aria-pressed={b.active}
                      onClick={() => updateItem(b.id, { active: !b.active })}
                    >
                      {b.active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      className="sec-icon-btn"
                      title={isEn ? "Edit slide" : "تعديل الشريحة"}
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      type="button"
                      className="sec-icon-btn sec-icon-btn--danger"
                      title={isEn ? "Delete slide" : "حذف الشريحة"}
                      aria-label={isEn ? `Delete slide ${idx + 1}` : `حذف الشريحة ${idx + 1}`}
                      onClick={() => removeItem(b.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="promo-slide-body">
                    {/* Image Upload + URL */}
                    <div className="promo-slide-media-box">
                      <span className="hero-cms-subhead">
                        <ImageIcon size={14} />
                        {isEn ? "Slide Background Image" : "صورة خلفية الشريحة"}
                      </span>
                      <div className="hero-img-actions">
                        <label className="hero-upload-btn">
                          <Upload size={14} />
                          <span>
                            {uploadingId === b.id
                              ? isEn
                                ? "Uploading…"
                                : "جارٍ الرفع…"
                              : isEn
                                ? "Upload Image"
                                : "رفع صورة"}
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={uploadingId === b.id}
                            onChange={(e) => handleSlideImageUpload(b.id, e)}
                            hidden
                          />
                        </label>
                        {b.image_url && (
                          <button
                            type="button"
                            className="hero-remove-btn"
                            onClick={() => updateItem(b.id, { image_url: null })}
                          >
                            <Trash2 size={14} />
                            <span>{isEn ? "Remove" : "حذف الصورة"}</span>
                          </button>
                        )}
                      </div>
                      <label className="hero-cms-field">
                        <span>
                          {isEn ? "Or Image URL (HTTPS)" : "أو رابط صورة مباشر"}
                        </span>
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
                    </div>

                    <div className="hero-cms-pair promo-pair-cols">
                      <label className="hero-cms-field">
                        <span>{isEn ? "Badge (AR)" : "الشارة (عربي)"}</span>
                        <input
                          type="text"
                          value={b.badge_ar}
                          onChange={(e) =>
                            updateItem(b.id, { badge_ar: e.target.value })
                          }
                        />
                      </label>
                      <label className="hero-cms-field">
                        <span>{isEn ? "Badge (EN)" : "الشارة (إنجليزي)"}</span>
                        <input
                          type="text"
                          dir="ltr"
                          value={b.badge_en}
                          onChange={(e) =>
                            updateItem(b.id, { badge_en: e.target.value })
                          }
                        />
                      </label>
                    </div>

                    <div className="hero-cms-pair promo-pair-cols">
                      <label className="hero-cms-field">
                        <span>{isEn ? "Title (AR)" : "العنوان (عربي)"}</span>
                        <input
                          type="text"
                          value={b.title_ar}
                          onChange={(e) =>
                            updateItem(b.id, { title_ar: e.target.value })
                          }
                        />
                      </label>
                      <label className="hero-cms-field">
                        <span>{isEn ? "Title (EN)" : "العنوان (إنجليزي)"}</span>
                        <input
                          type="text"
                          dir="ltr"
                          value={b.title_en}
                          onChange={(e) =>
                            updateItem(b.id, { title_en: e.target.value })
                          }
                        />
                      </label>
                    </div>

                    <div className="hero-cms-pair">
                      <label className="hero-cms-field">
                        <span>{isEn ? "Subtitle (AR)" : "الوصف (عربي)"}</span>
                        <input
                          type="text"
                          value={b.subtitle_ar}
                          onChange={(e) =>
                            updateItem(b.id, { subtitle_ar: e.target.value })
                          }
                        />
                      </label>
                      <label className="hero-cms-field">
                        <span>{isEn ? "Subtitle (EN)" : "الوصف (إنجليزي)"}</span>
                        <input
                          type="text"
                          dir="ltr"
                          value={b.subtitle_en}
                          onChange={(e) =>
                            updateItem(b.id, { subtitle_en: e.target.value })
                          }
                        />
                      </label>
                    </div>

                    <div className="hero-cms-pair promo-pair-cols">
                      <label className="hero-cms-field">
                        <span>{isEn ? "CTA Label (AR)" : "نص الزر (عربي)"}</span>
                        <input
                          type="text"
                          value={b.cta_text_ar}
                          onChange={(e) =>
                            updateItem(b.id, { cta_text_ar: e.target.value })
                          }
                        />
                      </label>
                      <label className="hero-cms-field">
                        <span>{isEn ? "CTA Label (EN)" : "نص الزر (إنجليزي)"}</span>
                        <input
                          type="text"
                          dir="ltr"
                          value={b.cta_text_en}
                          onChange={(e) =>
                            updateItem(b.id, { cta_text_en: e.target.value })
                          }
                        />
                      </label>
                    </div>

                    <label className="hero-cms-field">
                      <span>
                        {isEn
                          ? "Deep-Link Target (/products, /category/..., /product/..., /cart)"
                          : "رابط الوجهة (/products أو /category/... أو /product/... أو /cart)"}
                      </span>
                      <input
                        type="text"
                        dir="ltr"
                        value={b.cta_link}
                        onChange={(e) =>
                          updateItem(b.id, { cta_link: e.target.value })
                        }
                        placeholder="/products"
                      />
                    </label>

                    <div className="choice-row">
                      <button
                        type="button"
                        className="choice-pill"
                        aria-pressed={b.cta_link === "/products"}
                        onClick={() => updateItem(b.id, { cta_link: "/products" })}
                      >
                        {isEn ? "All Products" : "كل المنتجات"}
                      </button>
                      <button
                        type="button"
                        className="choice-pill"
                        aria-pressed={b.cta_link === "/cart"}
                        onClick={() => updateItem(b.id, { cta_link: "/cart" })}
                      >
                        {isEn ? "Cart" : "السلة"}
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
                            {localizedText(isEn ? "en" : "ar", cat.name, cat.name_en)}
                          </button>
                        );
                      })}
                    </div>

                    <div className="promo-gradient-pickers">
                      <label className="hero-cms-field">
                        <span>{isEn ? "Fallback Gradient Start" : "بداية التدرج"}</span>
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
                        <span>{isEn ? "Fallback Gradient End" : "نهاية التدرج"}</span>
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
