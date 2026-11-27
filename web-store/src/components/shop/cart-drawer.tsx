"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { money } from "@/lib/brand";
import { storeHref } from "@/lib/tenant-shared";
import { CartLines, useBasketContents } from "./cart-lines";

export function CartDrawerContents({ basePath, currency, close }: { basePath: string; currency: string; close: () => void }) {
  const basket = useBasketContents();
  const { lang, t } = useLanguage();
  const en = lang === "en";
  const href = (path: string) => storeHref(basePath, path);
  if (!basket.lines.length) return <div className="sf-drawer-empty"><ShoppingBag size={34}/><p>{t("cartEmpty")}</p>
    <Link className="sf-primary" href={href("/products")} onClick={close}>{t("heroShopProducts")}</Link>
  </div>;
  return <>
    <div className="sf-drawer-scroll"><CartLines basket={basket} basePath={basePath} currency={currency} editable onNavigate={close}/></div>
    <div className="sf-drawer-foot">
      <div className="sf-total"><span>{t("subtotalLabel")}</span>
        <strong aria-live="polite"><bdi dir="ltr">{money(basket.subtotal, currency, lang)}</bdi></strong></div>
      <p>{en ? "Delivery and discounts are calculated at checkout." : "تُحسب رسوم التوصيل والخصومات عند إتمام الطلب."}</p>
      {!basket.overLimit && <Link className="sf-primary" href={href("/checkout")} onClick={close}>{t("proceedCheckoutBtn")}</Link>}
      <Link className="sf-text-link" href={href("/cart")} onClick={close}>{en ? "View full cart" : "عرض السلة كاملة"}</Link>
    </div>
  </>;
}
