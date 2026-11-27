"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Minus, Package, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { money } from "@/lib/brand";
import { localizedText, translateColor } from "@/lib/i18n";
import { quantityLimitHint } from "@/lib/variant-stock";
import { storeHref } from "@/lib/tenant-shared";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { photo } from "@/lib/product-photo";
import { change, lineEffectivePrice, refreshCartInventory, remainingQuantity, useCart, useCartScope, useDefaultOrderLimit } from "./cart-store";
import { useSaleClock } from "./use-sale-clock";
import { StoreCopy } from "./store-copy";

export function useBasketContents() {
  const tenant = useCartScope();
  const limit = useDefaultOrderLimit();
  const lines = useCart();
  const now = useSaleClock(lines);
  const productIds = [...new Set(lines.map(line => line.id))].sort().join(",");
  const [attempt, setAttempt] = useState(0);
  const [checked, setChecked] = useState({ key: "", ok: false });
  const key = tenant.key + ":" + productIds + ":" + attempt;
  useEffect(() => {
    if (!productIds) return;
    let current = true;
    refreshCartInventory(tenant, productIds.split(","), () => current)
      .then(() => { if (current) setChecked({ key, ok: true }); })
      .catch(() => { if (current) setChecked({ key, ok: false }); });
    return () => { current = false; };
  }, [key, productIds, tenant]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const subtotal = lines.reduce((total, line) => total + lineEffectivePrice(line, now) * line.quantity, 0);
  const overLimit = lines.some(line => remainingQuantity(lines, line, limit) < 0);
  const quoteBasis = JSON.stringify(lines.map(l => [l.id, l.size, l.color, l.quantity, lineEffectivePrice(l, now)]));
  return {
    tenant, lines, limit, now, subtotal, quoteBasis, overLimit,
    inventoryReady: checked.key === key && checked.ok, inventoryError: checked.key === key && !checked.ok,
    retry
  };
}

export function CartLines({ basket, currency, basePath, editable, onNavigate }: {
  basket: ReturnType<typeof useBasketContents>; currency: string; basePath: string; editable: boolean; onNavigate?: () => void;
}) {
  const { lang, t } = useLanguage();
  const en = lang === "en";
  const { tenant, lines, limit, now } = basket;
  return <>
    {basket.inventoryError && <p role="alert" className="sf-field-error">
      {en ? "Availability could not be checked." : "تعذّر التحقق من الكميات المتاحة."}{" "}
      <button type="button" onClick={basket.retry}>{en ? "Retry" : "أعد المحاولة"}</button>
    </p>}
    <ul className="sf-cart-lines">
      {lines.map(line => {
        const remaining = remainingQuantity(lines, line, limit);
        const unit = lineEffectivePrice(line, now);
        const title = localizedText(lang, line.name, line.name_en);
        const image = storefrontImageSrc(typeof line.image_path === "string" ? photo(line.image_path) : null, 128);
        return <li key={JSON.stringify([line.id, line.color, line.size])}>
          <div className="sf-line-art" aria-hidden="true">{image
            ? <Image src={image} unoptimized alt="" width={64} height={76}/>
            : <Package size={20}/>}</div>
          <div className="sf-line-head">
            <Link href={storeHref(basePath, "/products/" + line.id)} onClick={onNavigate}><StoreCopy text={title} lang={lang}/></Link>
            <strong><bdi dir="ltr">{money(unit * line.quantity, currency, lang)}</bdi></strong>
          </div>
          {(line.color || line.size) && <div className="sf-line-variant">
            {line.color && <span>{t("colorLabel")} · {translateColor(line.color, lang)}</span>}
            {line.size && <span>{t("sizeLabel")} · <bdi dir="ltr">{line.size}</bdi></span>}
          </div>}
          <div className="sf-line-controls">
            {editable ? <div className="sf-stepper" role="group" aria-label={title}>
              <button type="button" aria-label={en ? "Decrease quantity" : "إنقاص الكمية"} onClick={() => change(tenant, line, -1, limit)}><Minus size={15}/></button>
              <output aria-live="polite"><bdi dir="ltr">{line.quantity.toLocaleString(lang)}</bdi></output>
              <button type="button" aria-label={en ? "Increase quantity" : "زيادة الكمية"} disabled={!basket.inventoryReady || remaining <= 0}
                onClick={() => change(tenant, line, 1, limit)}><Plus size={15}/></button>
            </div> : <span>{t("qtyLabel")} <bdi dir="ltr">{line.quantity.toLocaleString(lang)}</bdi></span>}
            <small><bdi dir="ltr">{money(unit, currency, lang)}</bdi> {en ? "each" : "للقطعة"}
              {Number(line.regular_price) > unit && <> <del><bdi dir="ltr">{money(line.regular_price!, currency, lang)}</bdi></del></>}
            </small>
            {editable && <button type="button" className="sf-icon sf-line-remove" aria-label={(en ? "Remove " : "حذف ") + title}
              onClick={() => change(tenant, line, -line.quantity, limit)}><Trash2 size={16}/></button>}
          </div>
          {remaining <= 0 && <small role="status" className="sf-limit">{remaining < 0
            ? (en ? "Reduce this quantity before checkout." : "خفّض الكمية قبل إتمام الطلب.") : quantityLimitHint(lang)}</small>}
        </li>;
      })}
    </ul>
  </>;
}
