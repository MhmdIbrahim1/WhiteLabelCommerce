"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Package, X, ZoomIn } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

import type { Product } from "@/lib/shop";
import { initialProductColor, resolveColorGallery } from "@/lib/color-galleries";
import { photo } from "@/lib/product-photo";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { Buy } from "./buy";
import { useStudioPreview } from "./studio-preview-context";

export function ProductPurchase({ product, title, basePath, currency, sticky, initialNow, children }: {
  product: Product; title: string; basePath: string; currency: string; sticky: boolean; initialNow: number; children: React.ReactNode;
}) {
  const [color, setColor] = useState(() => initialProductColor(product));
  const showSticky = useStudioPreview()?.theme.stickyCtaEnabled ?? sticky;
  const images = resolveColorGallery(product, color).map(photo)
    .filter((src): src is string => Boolean(storefrontImageSrc(src, 1080)));
  return <section className="details-grid sf-product">
    <ProductGallery key={color} sources={images} alt={title} />
    <div className="sf-buy-column">{children}<Buy p={product} detail basePath={basePath} color={color} onColorChange={setColor}
      sticky={showSticky ? { currency, initialNow } : undefined} /></div>
  </section>;
}

export function ProductGallery({ sources, alt }: { sources: string[]; alt: string }) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const src = sources[active] ?? sources[0];
  function move(step: number) {
    setActive(current => (current + step + sources.length) % sources.length);
  }
  const controls = sources.length > 1 && <>
    <button type="button" className="gallery-arrow gallery-prev" onClick={() => move(-1)}
      aria-label={en ? "Previous photo" : "الصورة السابقة"}><ChevronLeft size={21} strokeWidth={1.5} /></button>
    <button type="button" className="gallery-arrow gallery-next" onClick={() => move(1)}
      aria-label={en ? "Next photo" : "الصورة التالية"}><ChevronRight size={21} strokeWidth={1.5} /></button>
    <output className="gallery-counter"><bdi dir="ltr">{active + 1} / {sources.length}</bdi></output>
  </>;

  return (
    <div className="product-gallery" data-multiple={sources.length > 1} onKeyDown={event => {
      if (sources.length < 2 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const rtl = event.currentTarget.matches(":dir(rtl)");
      move((event.key === "ArrowRight") !== rtl ? 1 : -1);
    }}>
      <div className="product-photo gallery-stage">
        {src ? (
          <button className="gallery-open" type="button" aria-label={en ? "Enlarge product image" : "تكبير صورة المنتج"}
            onClick={() => { setEnlarged(true); dialog.current?.showModal(); }}>
            <Image key={src} fill unoptimized src={storefrontImageSrc(src, 1080)!} alt={alt} />
            <ZoomIn aria-hidden="true" size={22} strokeWidth={1.5} />
          </button>
        ) : <Package size={54} strokeWidth={1} />}
        {controls}
      </div>
      {sources.length > 1 && (
        <div className="gallery-thumbs" role="group" aria-label={en ? "Product images" : "صور المنتج"}>
          {sources.map((image, index) => (
            <button type="button" key={image} className="gallery-thumb" data-active={index === active}
              aria-pressed={index === active} aria-label={en ? `Image ${index + 1}` : `الصورة ${index + 1}`}
              onClick={() => setActive(index)}>
              <Image fill unoptimized src={storefrontImageSrc(image, 128)!} alt="" />
            </button>
          ))}
        </div>
      )}
      {src && <dialog ref={dialog} className="gallery-lightbox" aria-label={alt} onClose={() => setEnlarged(false)}
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
        <button type="button" className="gallery-close" autoFocus onClick={() => dialog.current?.close()} aria-label={en ? "Close" : "إغلاق"}><X strokeWidth={1.5} /></button>
        {enlarged && <>
          <Image key={src} width={1400} height={1400} unoptimized src={storefrontImageSrc(src, 1920)!} alt={alt} />
          {controls}
        </>}
      </dialog>}
    </div>
  );
}
