"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { QuotaPrompt } from "@/components/quota-prompt";
import { quickSaveProduct } from "../mutations";

type Result = Awaited<ReturnType<typeof quickSaveProduct>>;
const messages = {
  saved: ["Product saved.", "تم حفظ المنتج."],
  changed: ["This product is no longer available in this store.", "لم يعد المنتج متاحاً في هذا المتجر."],
  inventory_changed: ["Inventory changed while you were editing. Reload the current stock before saving.", "تغيّر المخزون أثناء التعديل. حدّث الكمية المعروضة قبل الحفظ."],
  flash_price: ["The regular price must be higher than the flash sale price.", "يجب أن يكون السعر الأساسي أعلى من سعر العرض المؤقت."],
  invalid: ["Check the product name, price and stock, then save again.", "راجع اسم المنتج وسعره ومخزونه ثم احفظ التعديلات."],
  unavailable: ["Couldn’t save the product. Try again.", "تعذّر حفظ المنتج. حاول مجدداً."],
};

export function QuickEditor({ product, storeId, editorHref, lang, currency, canViewBilling }: {
  product: { id: string; name: string; name_en: string | null; price: number; stock: number; is_active: boolean; hasVariants: boolean };
  storeId: string; editorHref: string; lang: Lang; currency: string; canViewBilling: boolean;
}) {
  const en = lang === "en";
  const [result, setResult] = useState<Result | "unavailable" | null>(null);
  const [originalStock, setOriginalStock] = useState(product.stock);
  const [pending, start] = useTransition();
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setResult(null);
    start(async () => {
      try {
        const outcome = await quickSaveProduct(storeId, product.id, form);
        setResult(outcome);
        if (outcome === "saved" && form.has("stock")) setOriginalStock(Number(form.get("stock")));
      }
      catch { setResult("unavailable"); }
    });
  }
  return <form onSubmit={save} className="ws-form" onChange={() => setResult(null)}>
    <input type="hidden" name="original_stock" value={originalStock} />
    <fieldset className="ws-edit-fields" disabled={pending}>
    <label>{en ? "Arabic product name" : "اسم المنتج بالعربية"}<input lang="ar" dir="rtl" name="name" defaultValue={product.name} required /></label>
    <label>{en ? "English product name" : "اسم المنتج بالإنجليزية"}<input lang="en" dir="ltr" name="name_en" defaultValue={product.name_en ?? ""} /></label>
    <div className="ws-field-grid">
      <label><span>{en ? "Regular price" : "السعر الأساسي"} (<bdi dir="ltr">{currency}</bdi>)</span><input type="number" dir="ltr" name="price" step=".01" min="0" required defaultValue={product.price} /></label>
      <label>{en ? "Stock on hand" : "الكمية المتاحة"}<input type="number" dir="ltr" name={product.hasVariants ? undefined : "stock"}
        readOnly={product.hasVariants} min="0" max="2147483647" step="1" required defaultValue={product.stock}
        aria-describedby={product.hasVariants ? "variant-stock-help" : undefined} /></label>
    </div>
    {product.hasVariants && <small id="variant-stock-help">{en ? "This total comes from your variants. Edit each quantity in the full editor." : "هذه الكمية هي مجموع مخزون الخيارات. لتعديل كمية خيار معيّن، افتح المحرّر الكامل."}</small>}
    <label>{en ? "Visibility" : "ظهور المنتج"}<select name="visibility" defaultValue={product.is_active ? "active" : "draft"}>
      <option value="active">{en ? "Active" : "منشور"}</option><option value="draft">{en ? "Draft" : "مسودة"}</option></select></label>
    <div className="ws-actions"><button className="ws-primary" disabled={pending}>{pending ? (en ? "Saving…" : "جارٍ الحفظ…") : en ? "Save changes" : "حفظ التعديلات"}</button>
      <Link href={editorHref} prefetch={false} className="ws-text-link">{en ? "Full editor and variants" : "المحرّر الكامل وخيارات المنتج"}<ArrowRight className="pt-directional" size={15} /></Link></div>
    </fieldset>
    {result === "quota" ? <QuotaPrompt resource="products" lang={lang} canViewBilling={canViewBilling} /> :
      result && <p role="status" className={result === "saved" ? "ws-feedback" : "ws-field-error"}>{messages[result][en ? 0 : 1]}</p>}
    {result === "inventory_changed" && <button type="button" className="ws-button" onClick={() => window.location.reload()}>{en ? "Reload stock" : "تحديث المخزون"}</button>}
  </form>;
}
