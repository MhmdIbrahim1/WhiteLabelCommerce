"use client";

import Image from "next/image";
import { useId, useState, type KeyboardEvent } from "react";
import { ArrowRight, AudioLines, Check, CircleCheck, Coffee, Fingerprint, Globe, LockKeyhole, PackageCheck,
  Plus, RotateCcw, Search, ShoppingBag } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { catalog, displayPrice, photos, verticals, type Vertical } from "./catalog";

export function StorefrontDemo({ lang }: { lang: Lang }) {
  const [active, setActive] = useState<Vertical>("fragrance");
  const id = useId();
  const shop = catalog[active];
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const forward = lang === "ar" ? "ArrowLeft" : "ArrowRight";
    let target = index;
    if (event.key === "Home") target = 0;
    else if (event.key === "End") target = verticals.length - 1;
    else if (event.key === forward) target = (index + 1) % verticals.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") target = (index + verticals.length - 1) % verticals.length;
    else return;
    event.preventDefault();
    setActive(verticals[target]);
    document.getElementById(id + verticals[target])?.focus();
  }
  return <div className="storefront-demo">
    <div className="vertical-tabs" role="tablist" aria-label={lang === "en" ? "Store category" : "نشاط المتجر"}>
      {verticals.map((key, i) => <button key={key} type="button" role="tab" id={id + key} aria-selected={active === key}
        aria-controls={id + "-panel"} tabIndex={active === key ? 0 : -1}
        onKeyDown={e => navigate(e, i)} onClick={() => setActive(key)}>{catalog[key].category[lang]}</button>)}
    </div>
    <div className="mini-stage" role="tabpanel" id={id + "-panel"} aria-labelledby={id + active} tabIndex={0} data-vertical={active}>
      <div key={active} className="demo-storefront">
        <div className="mini-mast"><span lang="en">{shop.brand}</span><div aria-hidden="true"><Search size={13} /><ShoppingBag size={14} /></div></div>
        <div className="mini-product">
          <Image src={photos[active]} alt="" unoptimized />
          <div className="mini-description">
            <span>{shop.detail[lang]}</span><strong>{shop.name[lang]}</strong>
            <div className="mini-spec"><bdi dir="ltr">{shop.spec}</bdi>
              {active === "audio" && <AudioLines size={16} />}
              {active === "fashion" && <i className="fabric-swatch" aria-hidden="true" />}</div>
            <bdi dir="ltr" className="mini-price">{displayPrice(shop.price, lang)}</bdi>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

const appBrands = [
  { key: "fragrance", icon: Fingerprint, color: "#84402D" },
  { key: "audio", icon: AudioLines, color: "#25483C" },
  { key: "coffee", icon: Coffee, color: "#345A9C" },
] as const;

export function AndroidDemo({ lang }: { lang: Lang }) {
  const [index, setIndex] = useState(0);
  const { key, icon: Mark, color } = appBrands[index];
  const shop = catalog[key];
  const en = lang === "en";
  return <div className="android-demo">
    <div className="brand-options" role="group" aria-label={en ? "Preview an app identity" : "معاينة هوية التطبيق"}>
      {appBrands.map((brand, i) => <button key={brand.key} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}
        aria-label={catalog[brand.key].brand} style={{ background: brand.color }}>{i === index && <Check size={13} />}</button>)}
      <span>{en ? "App identity" : "هوية التطبيق"}</span>
    </div>
    <div className="builder-stage">
      <div className="builder-phone" key={key}>
        <div className="device-camera" />
        <div className="builder-bar" style={{ background: color }}><Mark size={24} /><b lang="en">{shop.brand}</b></div>
        <Image src={photos[key]} alt="" unoptimized />
        <div className="builder-product"><b>{shop.name[lang]}</b><span><bdi dir="ltr">{displayPrice(shop.price, lang)}</bdi><ShoppingBag size={12} /></span></div>
        <div className="device-home" />
      </div>
      <div className="build-receipt" aria-live="polite">
        <span className="receipt-icon" style={{ background: color }}><Mark size={20} /></span>
        <bdi dir="ltr">{shop.brand.replaceAll(" ", "").toLowerCase()}.apk</bdi>
        <div><PackageCheck size={14} />{en ? "APK Ready" : "ملف APK جاهز"}</div>
      </div>
    </div>
  </div>;
}

export function DomainDemo({ lang }: { lang: Lang }) {
  const [custom, setCustom] = useState(false);
  const en = lang === "en";
  const domain = custom ? "shop.yourbrand.com" : "store.platform";
  return <div className="domain-demo">
    <div className="domain-window">
      <div className="window-strip" aria-hidden="true"><i /><i /><i /></div>
      <div className="address-bar" aria-live="polite">
        {custom ? <LockKeyhole size={17} className="verified-icon" /> : <Globe size={17} />}
        <bdi dir="ltr" key={domain}>{domain}</bdi>
      </div>
      <span className="domain-state">{custom ? <CircleCheck size={16} className="verified-icon" /> : <Globe size={16} />}
        {custom ? (en ? "SSL verified" : "شهادة SSL موثّقة") : (en ? "Platform address" : "عنوان المنصة")}</span>
    </div>
    <button type="button" className="demo-command" onClick={() => setCustom(!custom)}>
      {custom ? (en ? "Use platform address" : "استخدم عنوان المنصة") : (en ? "Connect a domain" : "اربط نطاقاً")}
      {custom ? <RotateCcw size={14} /> : <ArrowRight size={14} className="pt-directional" />}
    </button>
  </div>;
}

const basePoints = [83, 80, 82, 65, 69, 57, 60, 45, 51, 35, 40, 26];
export function SalesDemo({ lang }: { lang: Lang }) {
  const [orders, setOrders] = useState(0);
  const en = lang === "en";
  const capacity = 50;
  const used = 42 + orders;
  const full = used === capacity;
  const number = new Intl.NumberFormat(en ? "en-EG" : "ar-EG");
  const points = [...basePoints, ...Array.from({ length: orders }, (_, i) => 24 - i * 2 + (i % 2) * 3)];
  const line = points.map((y, i) => (i ? "L" : "M") + (i * 300 / (points.length - 1)).toFixed(1) + " " + y).join(" ");
  return <div className="sales-demo">
    <div className="sales-sheet">
      <div className="sales-summary" aria-live="polite"><span>{en ? "Sample sales" : "مبيعات توضيحية"}</span>
        <strong><bdi dir="ltr">{displayPrice(18450 + orders * 450, lang)}</bdi></strong></div>
      <svg className="sales-chart" viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true">
        {[24, 52, 80].map(y => <path key={y} d={"M0 " + y + " H300"} stroke="#DFE2DD" strokeDasharray="3 5" />)}
        <path d={line + " L300 96 H0 Z"} fill="#E8EEDE" opacity=".8" />
        <path key={orders} className="sales-curve" d={line} pathLength="1" fill="none" stroke="#34543A" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="quota-row"><span>{en ? "Order allowance" : "رصيد الطلبات"}</span>
        <bdi dir="ltr">{number.format(used)} / {number.format(capacity)}</bdi></div>
      <progress aria-label={en ? "Monthly order usage" : "الطلبات المستخدمة هذا الشهر"} value={used} max={capacity} />
    </div>
    <button type="button" className="demo-command" onClick={() => setOrders(n => n >= capacity - 42 ? 0 : n + 1)}>
      {full ? <RotateCcw size={14} /> : <Plus size={14} />}
      {full ? (en ? "Reset sample" : "إعادة المثال") : (en ? "Add a sample order" : "أضف طلباً تجريبياً")}
    </button>
  </div>;
}
