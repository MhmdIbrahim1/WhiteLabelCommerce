"use client";

import { SubmitButton } from "@/components/submit-button";
import { useState } from "react";
import { Sparkles, Plus, Trash2, Check } from "lucide-react";
import {
  ADMIN_CATEGORY_PRESETS,
  normalizeSpecs,
  type AdminCategoryPreset,
  type ProductSpec,
} from "@/lib/specs";
import { flashCompareAt, getRegularSavingsPercent, toDateTimeLocalValue } from "@/lib/flash-sale";
import { localizedText } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import { variantKey, type Variant } from "@/lib/variant-stock";
import { photo } from "@/lib/product-photo";
import type { ProductStudioDraft } from "@/lib/openai-studio";
import { ProductPhotoStudio, type StudioAllowances } from "./product-photo-studio";
import { saveProduct } from "../mutations";

export type AdminCategoryItem = {
  id: string;
  name: string;
  name_en?: string | null;
  slug: string;
};

export type AdminProductItem = {
  id: string;
  name: string;
  name_en?: string | null;
  slug: string;
  category_id: string;
  description: string;
  description_en?: string | null;
  price: number;
  cost_price: number | null;
  old_price: number | null;
  flash_sale_price?: number | null;
  flash_sale_starts_at?: string | null;
  flash_sale_ends_at?: string | null;
  stock: number;
  max_order_qty: number | null;
  product_variants?: Variant[];
  color_images?: Record<string, string>;
  sizes: string[];
  colors: string[];
  image_path: string | null;
  image_paths?: string[] | null;
  specifications?: ProductSpec[] | null;
  is_active: boolean;
};

const QUICK_COLOR_SWATCHES = [
  { label_ar: "أبيض", label_en: "White", hex: "#F8FAFC" },
  { label_ar: "أسود", label_en: "Black", hex: "#111827" },
  { label_ar: "كحلي", label_en: "Navy", hex: "#1E3A5F" },
  { label_ar: "بيج", label_en: "Beige", hex: "#D6C5B3" },
  { label_ar: "رمادي", label_en: "Gray", hex: "#64748B" },
  { label_ar: "بني", label_en: "Brown", hex: "#7C4A2D" },
  { label_ar: "جملي", label_en: "Camel", hex: "#C28E5C" },
  { label_ar: "زيتي", label_en: "Olive", hex: "#4D5D53" },
  { label_ar: "فضي / كحلي", label_en: "Silver / Navy", hex: "#94A3B8" },
  { label_ar: "ذهبي / أخضر", label_en: "Gold / Green", hex: "#166534" },
];

function parseList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,،\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function dateInputToIso(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

export function AdminProductForm({
  p,
  categories,
  query,
  page,
  status = "",
  storeId,
  aiEnabled,
  allowances,
}: {
  p?: AdminProductItem;
  categories: AdminCategoryItem[];
  query: string;
  page: number;
  status?: string;
  storeId: string;
  aiEnabled: boolean;
  allowances: StudioAllowances;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";

  const [priceValue, setPriceValue] = useState(
    p?.price !== undefined && p?.price !== null ? String(p.price) : "",
  );
  const [oldPriceValue, setOldPriceValue] = useState(p?.old_price?.toString() ?? "");
  const [flashEnabled, setFlashEnabled] = useState(p?.flash_sale_price != null);
  const [customFlashPrice, setCustomFlashPrice] = useState(p?.flash_sale_price?.toString());
  const [flashStartsIso, setFlashStartsIso] = useState(p?.flash_sale_starts_at ?? "");
  const [flashEndsIso, setFlashEndsIso] = useState(p?.flash_sale_ends_at ?? "");

  const [sizesValue, setSizesValue] = useState(
    (p?.sizes ?? []).join(isEn ? ", " : "، "),
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const [editor, setEditor] = useState(() => {
    const fields = {
      name: p?.name ?? "", name_en: p?.name_en ?? "", slug: p?.slug ?? "",
      category_id: p?.category_id || categories[0]?.id || "",
      description: p?.description ?? "", description_en: p?.description_en ?? "",
      colorsValue: (p?.colors ?? []).join(isEn ? ", " : "، "),
      specs: normalizeSpecs(p?.specifications), activePreset: null as string | null,
    };
    return { fields, undo: null as typeof fields | null };
  });
  const { fields, undo } = editor;
  const { colorsValue, specs, activePreset } = fields;
  function editFields(changes: Partial<typeof fields>) {
    setEditor(prev => ({ ...prev, fields: { ...prev.fields, ...changes } }));
  }
  function applyDraft(draft: ProductStudioDraft) {
    const detected = isEn ? draft.colors_en : draft.colors_ar;
    // Read the current fields at completion so Undo includes edits made while the request was running.
    setEditor(({ fields: current }) => ({
      undo: current,
      fields: {
        name: draft.name_ar, name_en: draft.name_en, slug: draft.slug,
        category_id: categories.find(c => c.id === draft.category_id)?.id ?? current.category_id,
        description: draft.description_ar, description_en: draft.description_en,
        colorsValue: current.colorsValue.trim() ? current.colorsValue : detected.join(isEn ? ", " : "، "),
        specs: draft.specifications, activePreset: null,
      },
    }));
  }
  function undoDraft() {
    setEditor(prev => prev.undo ? { fields: prev.undo, undo: null } : prev);
  }

  const regularNum = Number(priceValue);
  const oldPriceNum = Number(oldPriceValue);
  const alreadyDiscounted = regularNum > 0 && oldPriceNum > regularNum;
  const flashPriceValue = customFlashPrice ?? (alreadyDiscounted ? priceValue : "");
  const flashNum = Number(flashPriceValue);
  const compareAt = flashCompareAt({ price: regularNum, old_price: oldPriceNum, flash_sale_price: flashNum });
  const flashPriceInvalid = Boolean(flashPriceValue.trim()) && compareAt === null;
  const flashPreviewPct = getRegularSavingsPercent({ price: flashNum, old_price: compareAt });

  const flashWindowInvalid =
    Boolean(flashStartsIso && flashEndsIso) &&
    Date.parse(flashEndsIso) <= Date.parse(flashStartsIso);
  const flashMissingEnd =
    Boolean(flashPriceValue.trim()) && !flashEndsIso;

  const applyFlashDurationHours = (hours: number) => {
    const now = new Date();
    const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
    setFlashStartsIso(now.toISOString());
    setFlashEndsIso(end.toISOString());
  };

  const selectedColors = parseList(colorsValue);
  const selectedSizes = parseList(sizesValue);
  const [sharedStock, setSharedStock] = useState(String(p?.stock ?? 0));
  const [trackVariants, setTrackVariants] = useState(Boolean(p?.product_variants?.length));
  const [stockByKey, setStockByKey] = useState<Record<string, number>>(() =>
    Object.fromEntries((p?.product_variants ?? []).map(v => [variantKey(v.color, v.size), v.stock])));
  const [photos, setPhotos] = useState<Record<string, string>>(p?.color_images ?? {});
  const hasOptions = selectedSizes.length > 0 || selectedColors.length > 0;
  const options = hasOptions ? (selectedColors.length ? selectedColors : [""]).flatMap(color =>
    (selectedSizes.length ? selectedSizes : [""]).map(size => ({ color, size }))) : [];
  const variants = trackVariants ? options.map(({ color, size }) =>
    ({ color, size, stock: stockByKey[variantKey(color, size)] ?? 0 })) : [];
  function distributeStock() {
    const total = Number(sharedStock);
    const base = Math.floor(total / options.length);
    const extra = total % options.length;
    setStockByKey(Object.fromEntries(options.map(({ color, size }, i) =>
      [variantKey(color, size), base + (i < extra ? 1 : 0)])));
    setTrackVariants(true);
  }
  const colorPhotos = Object.fromEntries(selectedColors.filter(color => photos[color]?.trim()).map(color => [color, photos[color].trim()]));

  const applyPreset = (preset: AdminCategoryPreset) => {
    const sep = isEn ? ", " : "، ";
    setSizesValue(preset.sizes.join(sep));
    editFields({
      colorsValue: preset.colors.map((c) => (isEn ? c.label_en : c.label)).join(sep),
      specs: preset.specs.map(row => ({ ...row })), activePreset: preset.id,
    });
  };

  const toggleColorSwatch = (label: string) => {
    const current = parseList(colorsValue);
    const exists = current.includes(label);
    const next = exists
      ? current.filter((c) => c !== label)
      : [...current, label];
    editFields({ colorsValue: next.join(isEn ? ", " : "، ") });
  };

  const updateSpec = (
    idx: number,
    field: keyof ProductSpec,
    value: string,
  ) => {
    editFields({ specs: specs.map((row, i) => i === idx ? { ...row, [field]: value } : row) });
  };

  const addSpecRow = () => {
    editFields({ specs: [...specs, { key_ar: "", key_en: "", value_ar: "", value_en: "" }] });
  };

  const removeSpecRow = (idx: number) => {
    editFields({ specs: specs.filter((_, i) => i !== idx) });
  };

  const serializedSpecs = JSON.stringify(
    specs.filter(
      (r) =>
        (r.key_ar.trim() || r.key_en.trim()) &&
        (r.value_ar.trim() || r.value_en.trim()),
    ),
  );

  return (
    <form action={saveProduct} className="fields" onSubmit={event => { if (photoBusy) event.preventDefault(); }}>
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <input type="hidden" name="q" value={query} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="previous_image" value={p?.image_path ?? ""} />
      <input type="hidden" name="specifications" value={serializedSpecs} />

      <ProductPhotoStudio storeId={storeId} en={isEn} existingImage={photo(p?.image_path ?? null)} aiEnabled={aiEnabled}
        allowances={allowances} onBusyChange={setPhotoBusy} onDraft={applyDraft} onUndo={undoDraft} canUndo={Boolean(undo)} />

      <div className="wide admin-presets-bar">
        <div className="admin-presets-head">
          <span className="with-icon">
            <Sparkles size={15} />
            <strong>
              {isEn
                ? "Product presets"
                : "قوالب مواصفات المنتج"}
            </strong>
          </span>
          <small>
            {isEn
              ? "Choose a category to fill in sizes, colors and specifications."
              : "اختر فئة لتعبئة المقاسات والألوان والمواصفات."}
          </small>
        </div>
        <div className="admin-presets-grid">
          {ADMIN_CATEGORY_PRESETS.map((preset) => {
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`admin-preset-btn ${active ? "is-active" : ""}`}
                aria-pressed={active}
                onClick={() => applyPreset(preset)}
              >
                {active && <Check size={14} />}
                <span>{isEn ? preset.label_en : preset.label_ar}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label>
        {isEn ? "Product Name (Arabic)" : "اسم المنتج (عربي)"}
        <input name="name" lang="ar" dir="rtl" value={fields.name} onChange={e => editFields({ name: e.target.value })} required />
      </label>
      <label>
        {isEn ? "Product Name (English · Optional)" : "اسم المنتج (إنجليزي · اختياري)"}
        <input
          name="name_en"
          lang="en"
          dir="ltr"
          value={fields.name_en} onChange={e => editFields({ name_en: e.target.value })}
          placeholder={isEn ? "e.g. Luxury Chronograph Watch" : "مثال: ساعة كرونوغراف فاخرة"}
        />
      </label>
      <label>
        {isEn ? "URL Slug" : "الرابط المختصر"}
        <input name="slug" dir="ltr" value={fields.slug} onChange={e => editFields({ slug: e.target.value })} required />
      </label>
      <label>
        {isEn ? "Category" : "الفئة"}
        <select name="category_id" value={fields.category_id} onChange={e => editFields({ category_id: e.target.value })} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {localizedText(lang, c.name, c.name_en)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {isEn ? "Stock" : "المخزون"}
        <input
          type="number"
          name="stock"
          min="0"
          value={variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : sharedStock}
          readOnly={variants.length > 0}
          onChange={e => setSharedStock(e.target.value)}
          required
        />
      </label>
      <label>
        {isEn ? "Maximum per order" : "الحد الأقصى لكل طلب"}
        <input type="number" name="max_order_qty" min={1} max={2147483647} step={1}
          defaultValue={p?.max_order_qty ?? ""} placeholder={isEn ? "Use store default" : "استخدام حد المتجر"} />
      </label>
      <label>
        {isEn ? "Selling Price" : "السعر"}
        <input
          type="number"
          name="price"
          min="0"
          step=".01"
          value={priceValue}
          onChange={(e) => setPriceValue(e.target.value)}
          required
        />
      </label>
      <label>
        {isEn
          ? "Unit cost for profit reports"
          : "تكلفة المنتج (لحساب صافي الربح)"}
        <input
          type="number"
          name="cost_price"
          min="0"
          step=".01"
          defaultValue={p?.cost_price ?? 0}
        />
      </label>
      <label>
        {isEn ? "Previous price (regular sale)" : "السعر السابق (للخصم العادي)"}
        <input
          type="number"
          name="old_price"
          min="0"
          step=".01"
          value={oldPriceValue}
          onChange={(e) => setOldPriceValue(e.target.value)}
        />
      </label>

      <div className="wide admin-flash-card">
        <label className="check">
          <input
            type="checkbox"
            name="flash_sale_enabled"
            value="on"
            checked={flashEnabled}
            onChange={(e) => setFlashEnabled(e.target.checked)}
          />
          {isEn ? "Include in Flash Sale" : "إظهار المنتج في عروض الفلاش"}
        </label>
        {flashEnabled ? (
          <div className="admin-flash-body">
            <input
              type="hidden"
              name="flash_sale_starts_at"
              value={flashStartsIso}
            />
            <input
              type="hidden"
              name="flash_sale_ends_at"
              value={flashEndsIso}
            />
            <div className="admin-flash-grid">
              <label>
                <span>
                  {isEn ? "Flash Sale Price" : "سعر العرض المؤقت"}
                  {flashPreviewPct !== null && (
                    <strong className="admin-flash-pct-inline" dir="ltr">
                      {" "}
                      (-{flashPreviewPct}
                      {isEn ? "%" : "٪"})
                    </strong>
                  )}
                </span>
                <input
                  type="number"
                  name="flash_sale_price"
                  required
                  min="0.01"
                  step=".01"
                  value={flashPriceValue}
                  onChange={(e) => setCustomFlashPrice(e.target.value)}
                  placeholder={
                    isEn ? "Flash sale price" : "سعر العرض المؤقت"
                  }
                />
              </label>
              <label>
                {isEn ? "Start date & time (optional)" : "تاريخ ووقت البدء (اختياري)"}
                <input
                  type="datetime-local"
                  dir="ltr"
                  value={toDateTimeLocalValue(flashStartsIso)}
                  onChange={(e) => setFlashStartsIso(dateInputToIso(e.target.value))}
                />
              </label>
              <label>
                {isEn ? "End Date & Time" : "تاريخ ووقت الانتهاء"}
                <input
                  type="datetime-local"
                  dir="ltr"
                  required
                  value={toDateTimeLocalValue(flashEndsIso)}
                  onChange={(e) => setFlashEndsIso(dateInputToIso(e.target.value))}
                />
              </label>
            </div>

            <div className="admin-flash-presets">
              <small>{isEn ? "Start now for" : "ابدأ الآن لمدة"}</small>
              {[24, 48, 72].map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  className="btn-outline-admin btn-compact-admin"
                  onClick={() => applyFlashDurationHours(hrs)}
                >
                  {isEn ? `${hrs}h` : `${hrs} ساعة`}
                </button>
              ))}
            </div>

            {flashPriceInvalid && (
              <small role="alert" className="admin-flash-error">
                {isEn
                  ? alreadyDiscounted
                    ? "Use the current discounted price or enter a lower positive price."
                    : "Enter a positive flash price below the selling price."
                  : alreadyDiscounted
                    ? "استخدم سعر البيع المخفّض الحالي أو أدخل سعراً أقل وأكبر من صفر."
                    : "أدخل سعراً للعرض أكبر من صفر وأقل من سعر البيع."}
              </small>
            )}
            {flashMissingEnd && (
              <small role="alert" className="admin-flash-error">
                {isEn
                  ? "Please set an End Date & Time for the flash sale."
                  : "يرجى تحديد تاريخ ووقت انتهاء العرض المؤقت."}
              </small>
            )}
            {flashWindowInvalid && (
              <small role="alert" className="admin-flash-error">
                {isEn
                  ? "End Date & Time must be after Start Date & Time."
                  : "يجب أن يكون وقت الانتهاء بعد وقت البدء."}
              </small>
            )}
          </div>
        ) : (
          <input type="hidden" name="flash_sale_enabled" value="off" />
        )}
      </div>

      <label>
        {isEn ? "Sizes (comma-separated)" : "المقاسات (بفواصل)"}
        <input
          name="sizes"
          value={sizesValue}
          onChange={(e) => setSizesValue(e.target.value)}
          placeholder="S, M, L, XL"
        />
      </label>
      <label>
        {isEn ? "Colors / Straps (comma-separated)" : "الألوان / الأساور (بفواصل)"}
        <input
          name="colors"
          value={colorsValue}
          onChange={(e) => editFields({ colorsValue: e.target.value })}
          placeholder={isEn ? "White, Black, Navy" : "أبيض، أسود، كحلي"}
        />
      </label>

      <input type="hidden" name="original_stock" value={p?.stock ?? 0} />
      <input type="hidden" name="original_variants" value={JSON.stringify(p?.product_variants ?? [])} />
      <input type="hidden" name="variants" value={JSON.stringify(variants)} />
      <input type="hidden" name="color_images" value={JSON.stringify(colorPhotos)} />
      {hasOptions && <fieldset className="wide variant-editor">
        <legend>{isEn ? "Variant inventory" : "مخزون الخيارات"}</legend>
        {p && !p.product_variants?.length && !trackVariants && <div>
          <p>{isEn ? "These options share one stock total." : "تسحب هذه الخيارات من مخزون مشترك."}</p>
          <button type="button" onClick={distributeStock} disabled={!/^\d+$/.test(sharedStock)}>
            {isEn ? "Distribute stock evenly across variants" : "توزيع المخزون بالتساوي على الخيارات"}
          </button>
        </div>}
        <label><input type="checkbox" checked={trackVariants} onChange={e => setTrackVariants(e.target.checked)} />
          {isEn ? "Assign stock by color and size" : "تحديد المخزون حسب اللون والمقاس"}</label>
        {selectedColors.map(color => <label key={color}>{isEn ? "Image for " : "صورة اللون "}{color}
          <input type="url" dir="ltr" placeholder="https://" value={photos[color] ?? ""}
            onChange={e => setPhotos({ ...photos, [color]: e.target.value })} /></label>)}
        {variants.map(({ color, size, stock }) => <label key={variantKey(color, size)}>
          {[color, size].filter(Boolean).join(" / ")}
          <input type="number" min={0} step={1} required value={stock}
            onChange={e => setStockByKey({ ...stockByKey, [variantKey(color, size)]: Number(e.target.value) })} /></label>)}
      </fieldset>}
      <div className="wide admin-swatches-row">
        <small>
          {isEn ? "Quick Color Swatches:" : "اختيار سريع للألوان:"}
        </small>
        <div className="admin-swatch-chips">
          {QUICK_COLOR_SWATCHES.map((sw) => {
            const label = isEn ? sw.label_en : sw.label_ar;
            const picked =
              selectedColors.includes(sw.label_ar) ||
              selectedColors.includes(sw.label_en);
            return (
              <button
                key={sw.label_en}
                type="button"
                className={`admin-swatch-chip ${picked ? "is-picked" : ""}`}
                onClick={() => toggleColorSwatch(label)}
              >
                <i style={{ backgroundColor: sw.hex }} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="wide">
        {isEn ? "Description (Arabic)" : "الوصف (عربي)"}
        <textarea name="description" lang="ar" dir="rtl" value={fields.description} onChange={e => editFields({ description: e.target.value })} />
      </label>
      <label className="wide">
        {isEn ? "Description (English · Optional)" : "الوصف (إنجليزي · اختياري)"}
        <textarea
          name="description_en"
          lang="en"
          dir="ltr"
          value={fields.description_en} onChange={e => editFields({ description_en: e.target.value })}
          placeholder={
            isEn
              ? "Detailed product description in English..."
              : "وصف تفصيلي للمنتج بالإنجليزية..."
          }
        />
      </label>

      <div className="wide admin-specs-editor">
        <div className="admin-specs-head">
          <strong>
            {isEn
              ? "Technical Specifications (AR / EN)"
              : "جدول المواصفات والتفاصيل (عربي / إنجليزي)"}
          </strong>
          <button
            type="button"
            className="btn-outline-admin"
            onClick={addSpecRow}
          >
            <Plus size={14} />
            {isEn ? "Add Row" : "إضافة صف"}
          </button>
        </div>
        {specs.length === 0 ? (
          <p className="admin-specs-empty">
            {isEn
              ? "No specifications yet. Click a category preset above or add a row."
              : "لا توجد مواصفات بعد. اختر قالباً سريعاً بالأعلى أو أضف صفاً يدوياً."}
          </p>
        ) : (
          <div className="admin-specs-rows">
            {specs.map((row, idx) => (
              <div key={idx} className="admin-spec-row">
                <input
                  type="text"
                  value={row.key_ar} dir="rtl" lang="ar"
                  onChange={(e) => updateSpec(idx, "key_ar", e.target.value)}
                  placeholder={isEn ? "Key (Arabic)" : "الخاصية (عربي)"}
                  aria-label={isEn ? "Specification key Arabic" : "الخاصية بالعربية"}
                />
                <input
                  type="text"
                  dir="ltr"
                  value={row.key_en} lang="en"
                  onChange={(e) => updateSpec(idx, "key_en", e.target.value)}
                  placeholder={isEn ? "Key (English)" : "الخاصية (إنجليزي)"}
                  aria-label={isEn ? "Specification key English" : "الخاصية بالإنجليزية"}
                />
                <input
                  type="text"
                  value={row.value_ar} dir="rtl" lang="ar"
                  onChange={(e) => updateSpec(idx, "value_ar", e.target.value)}
                  placeholder={isEn ? "Value (Arabic)" : "القيمة (عربي)"}
                  aria-label={isEn ? "Specification value Arabic" : "القيمة بالعربية"}
                />
                <input
                  type="text"
                  dir="ltr"
                  value={row.value_en} lang="en"
                  onChange={(e) => updateSpec(idx, "value_en", e.target.value)}
                  placeholder={isEn ? "Value (English)" : "القيمة (إنجليزي)"}
                  aria-label={isEn ? "Specification value English" : "القيمة بالإنجليزية"}
                />
                <button
                  type="button"
                  className="admin-spec-del"
                  onClick={() => removeSpecRow(idx)}
                  aria-label={isEn ? "Remove row" : "حذف الصف"}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="wide">
        {isEn ? "Additional image URLs (one per line, in display order)" : "روابط الصور الإضافية (رابط في كل سطر حسب ترتيب العرض)"}
        <textarea name="image_paths" dir="ltr" defaultValue={(p?.image_paths ?? []).join("\n")} />
      </label>
      <label className="check">
        <input type="checkbox" name="is_active" defaultChecked={p?.is_active} />{" "}
        {isEn ? "Publish product" : "نشر المنتج"}
      </label>
      <SubmitButton disabled={photoBusy || (flashEnabled && (flashPriceInvalid || flashWindowInvalid || flashMissingEnd))}>
        {isEn ? "Save Product" : "حفظ المنتج"}
      </SubmitButton>
    </form>
  );
}
