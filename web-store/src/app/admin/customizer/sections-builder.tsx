"use client";
import { useState } from "react";
import {
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  LayoutGrid,
  ShoppingBag,
  Megaphone,
  ShieldCheck,
} from "lucide-react";
import {
  createHomeSection,
  isHexColor,
  type HomeSection,
  type HomeSectionType,
} from "@/lib/ui-config";
import { localizedText, translateHomeCopy } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import type { PreviewCategory } from "./preview-frame";

const SECTION_META: Record<
  HomeSectionType,
  {
    label_ar: string;
    label_en: string;
    description_ar: string;
    description_en: string;
    icon: typeof Sparkles;
  }
> = {
  hero_banner: {
    label_ar: "البانر الرئيسي",
    label_en: "Hero Banner",
    description_ar: "واجهة شبكية أو عرض كامل أو مقسّم",
    description_en: "Bento grid, full-bleed editorial, or split hero layout",
    icon: Sparkles,
  },
  categories_grid: {
    label_ar: "شبكة الأقسام",
    label_en: "Categories Grid",
    description_ar: "عرض التصنيفات المتاحة للتصفّح السريع",
    description_en: "Displays store categories for quick browsing",
    icon: LayoutGrid,
  },
  featured_products: {
    label_ar: "منتجات مختارة",
    label_en: "Featured Products",
    description_ar: "شريط منتجات بعنوان مخصص وتصفية حسب القسم",
    description_en: "Product grid with custom title and category filter",
    icon: ShoppingBag,
  },
  promo_banner: {
    label_ar: "بانر ترويجي",
    label_en: "Promo Banner",
    description_ar: "دعوة عرض كاملة العرض بعنوان وشارة وزر",
    description_en: "Full-width promotional callout with badge and CTA button",
    icon: Megaphone,
  },
  trust_features: {
    label_ar: "مميزات المتجر",
    label_en: "Trust Bar",
    description_ar: "شريط الشحن السريع والدفع عند الاستلام والدعم",
    description_en: "Fast shipping, Cash on Delivery, and live support highlights",
    icon: ShieldCheck,
  },
};

export function SectionsBuilder({
  sections,
  categories,
  defaultAccent,
  onChange,
}: {
  sections: HomeSection[];
  categories: PreviewCategory[];
  defaultAccent: string;
  onChange: (next: HomeSection[]) => void;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleVisible = (id: string) => {
    onChange(
      sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    );
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const copy = [...sections];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    onChange(copy);
  };

  const remove = (id: string) => {
    if (sections.length <= 1) return;
    onChange(sections.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const updateSection = (id: string, patch: Partial<HomeSection>) => {
    onChange(
      sections.map((s) =>
        s.id === id ? ({ ...s, ...patch } as HomeSection) : s,
      ),
    );
  };

  const handleAdd = (type: HomeSectionType) => {
    const created = createHomeSection(type, defaultAccent);
    onChange([...sections, created]);
    setPickerOpen(false);
    setExpandedId(created.id);
  };

  const sectionSubtitle = (s: HomeSection) => {
    switch (s.type) {
      case "hero_banner":
        return isEn
          ? "Configured via the Home tab hero settings"
          : "يرتبط بإعدادات البانر في تبويب الرئيسية";
      case "categories_grid":
        return translateHomeCopy(s.title, lang);
      case "featured_products": {
        const cat = categories.find((c) => c.id === s.categoryId);
        const catName = cat
          ? localizedText(lang, cat.name, cat.name_en)
          : isEn
            ? "All Categories"
            : "كل الأقسام";
        return `${translateHomeCopy(s.title, lang)} · ${catName} (${s.limit})`;
      }
      case "promo_banner":
        return translateHomeCopy(s.headline, lang);
      case "trust_features":
        return translateHomeCopy(s.title, lang);
    }
  };

  return (
    <div className="sections-builder">
      <div className="sections-builder-head">
        <div>
          <h3>
            {isEn
              ? "Home Page Sections & Ordering"
              : "ترتيب وإدارة أقسام الصفحة الرئيسية"}
          </h3>
          <small>
            {isEn
              ? "Show, hide, reorder, or add new storefront sections with instant preview."
              : "أخفِ أو أظهر أي قسم أو أعد ترتيبه أو أضف أقساماً جديدة مع معاينة فورية."}
          </small>
        </div>
        <button
          type="button"
          className="btn-add-section"
          onClick={() => setPickerOpen((o) => !o)}
          aria-expanded={pickerOpen}
        >
          <Plus size={15} /> {isEn ? "Add Section" : "إضافة قسم"}
        </button>
      </div>

      {pickerOpen && (
        <div
          className="section-picker-drawer"
          role="region"
          aria-label={isEn ? "Choose section type" : "اختر نوع القسم"}
        >
          {(Object.keys(SECTION_META) as HomeSectionType[]).map((type) => {
            const meta = SECTION_META[type];
            const Icon = meta.icon;
            return (
              <button
                key={type}
                type="button"
                className="section-picker-item"
                onClick={() => handleAdd(type)}
              >
                <span className="section-picker-icon">
                  <Icon size={16} />
                </span>
                <span>
                  <strong>{isEn ? meta.label_en : meta.label_ar}</strong>
                  <small>{isEn ? meta.description_en : meta.description_ar}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="section-list">
        {sections.map((sec, idx) => {
          const meta = SECTION_META[sec.type];
          const label = isEn ? meta.label_en : meta.label_ar;
          const Icon = meta.icon;
          const isExpanded = expandedId === sec.id;
          const editable = sec.type !== "hero_banner";

          return (
            <div
              key={sec.id}
              className={`section-item-card ${sec.visible ? "" : "is-hidden"}`}
              data-section-type={sec.type}
            >
              <div className="section-item-row">
                <div className="section-item-info">
                  <span className="section-item-icon">
                    <Icon size={15} />
                  </span>
                  <div className="section-item-text">
                    <strong>{label}</strong>
                    <small>{sectionSubtitle(sec)}</small>
                  </div>
                </div>

                <div className="section-item-actions">
                  <button
                    type="button"
                    className="sec-icon-btn"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    aria-label={(isEn ? "Move up: " : "تحريك لأعلى: ") + label}
                    title={isEn ? "Move Up" : "تحريك لأعلى"}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="sec-icon-btn"
                    onClick={() => move(idx, 1)}
                    disabled={idx === sections.length - 1}
                    aria-label={(isEn ? "Move down: " : "تحريك لأسفل: ") + label}
                    title={isEn ? "Move Down" : "تحريك لأسفل"}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className={`sec-icon-btn ${sec.visible ? "is-on" : "is-off"}`}
                    onClick={() => toggleVisible(sec.id)}
                    aria-pressed={sec.visible}
                    aria-label={
                      (sec.visible
                        ? isEn
                          ? "Hide "
                          : "إخفاء "
                        : isEn
                          ? "Show "
                          : "إظهار ") + label
                    }
                    title={
                      sec.visible
                        ? isEn
                          ? "Hide section"
                          : "إخفاء القسم"
                        : isEn
                          ? "Show section"
                          : "إظهار القسم"
                    }
                  >
                    {sec.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  {editable && (
                    <button
                      type="button"
                      className="sec-icon-btn"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : sec.id)
                      }
                      aria-expanded={isExpanded}
                      aria-label={(isEn ? "Edit settings: " : "تعديل إعدادات ") + label}
                      title={isEn ? "Edit section" : "تعديل القسم"}
                    >
                      {isExpanded ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  )}
                  {sections.length > 1 && (
                    <button
                      type="button"
                      className="sec-icon-btn sec-icon-btn--danger"
                      onClick={() => remove(sec.id)}
                      aria-label={(isEn ? "Remove " : "حذف ") + label}
                      title={isEn ? "Remove section" : "حذف القسم"}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {editable && isExpanded && (
                <div className="section-item-editor">
                  {(sec.type === "categories_grid" ||
                    sec.type === "trust_features") && (
                    <label>
                      {isEn ? "Section Title" : "عنوان القسم"}
                      <input
                        value={sec.title}
                        maxLength={80}
                        onChange={(e) =>
                          updateSection(sec.id, { title: e.target.value })
                        }
                      />
                    </label>
                  )}

                  {sec.type === "featured_products" && (
                    <>
                      <label>
                        {isEn ? "Products Section Title" : "عنوان شريط المنتجات"}
                        <input
                          value={sec.title}
                          maxLength={80}
                          onChange={(e) =>
                            updateSection(sec.id, { title: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {isEn ? "Filter by Category" : "تصفية حسب القسم"}
                        <select
                          value={sec.categoryId}
                          onChange={(e) =>
                            updateSection(sec.id, {
                              categoryId: e.target.value,
                            })
                          }
                        >
                          <option value="">
                            {isEn ? "All Categories" : "كل الأقسام"}
                          </option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {localizedText(lang, c.name, c.name_en)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="control-field">
                        <div className="control-label-row">
                          <span>
                            {isEn ? "Products to Display" : "عدد المنتجات المعروضة"}
                          </span>
                          <code>{sec.limit}</code>
                        </div>
                        <div className="choice-row">
                          {[4, 8, 12].map((n) => (
                            <button
                              key={n}
                              type="button"
                              className="choice-pill"
                              aria-pressed={sec.limit === n}
                              onClick={() =>
                                updateSection(sec.id, { limit: n })
                              }
                            >
                              {isEn ? `${n} products` : `${n} منتجات`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {sec.type === "promo_banner" && (
                    <>
                      <label>
                        {isEn ? "Top Badge" : "الشارة العلوية"}
                        <input
                          value={sec.badge}
                          maxLength={50}
                          onChange={(e) =>
                            updateSection(sec.id, { badge: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {isEn ? "Promo Headline" : "العنوان الرئيسي للعرض"}
                        <input
                          value={sec.headline}
                          maxLength={120}
                          onChange={(e) =>
                            updateSection(sec.id, { headline: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {isEn ? "Short Subtext" : "وصف مختصر"}
                        <input
                          value={sec.subtext}
                          maxLength={180}
                          onChange={(e) =>
                            updateSection(sec.id, { subtext: e.target.value })
                          }
                        />
                      </label>
                      <div className="color-grid">
                        <label>
                          {isEn ? "Button Label" : "نص الزر"}
                          <input
                            value={sec.ctaLabel}
                            maxLength={40}
                            onChange={(e) =>
                              updateSection(sec.id, {
                                ctaLabel: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {isEn ? "Button Link" : "رابط الزر"}
                          <input
                            dir="ltr"
                            value={sec.ctaHref}
                            maxLength={200}
                            onChange={(e) =>
                              updateSection(sec.id, { ctaHref: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <label className="color-picker-box">
                        <span>
                          {isEn ? "Banner Background Color" : "لون خلفية البانر الترويجي"}
                        </span>
                        <div className="color-picker-input-row">
                          <input
                            type="color"
                            value={
                              isHexColor(sec.accentColor)
                                ? sec.accentColor
                                : defaultAccent
                            }
                            onChange={(e) =>
                              updateSection(sec.id, {
                                accentColor: e.target.value.toUpperCase(),
                              })
                            }
                          />
                          <input
                            type="text"
                            dir="ltr"
                            maxLength={7}
                            value={sec.accentColor}
                            onChange={(e) => {
                              const raw = e.target.value.trim().toUpperCase();
                              if (isHexColor(raw)) {
                                updateSection(sec.id, { accentColor: raw });
                              }
                            }}
                          />
                        </div>
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
