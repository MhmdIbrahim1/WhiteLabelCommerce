"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Package, X, ZoomIn } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

import type { Product } from "@/lib/shop";
import { photo } from "@/lib/product-photo";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { Buy } from "./buy";

export function ProductPurchase({ product, title, basePath, currency, sticky, initialNow, children }: {
  product: Product; title: string; basePath: string; currency: string; sticky: boolean; initialNow: number; children: React.ReactNode;
}) {
  const [color, setColor] = useState(product.colors.length === 1 ? product.colors[0] : "");
  const images = useMemo(() => [...new Set([product.image_path, ...(product.image_paths ?? []),
    ...Object.values(product.color_images ?? {})].map(photo).filter((src): src is string => Boolean(storefrontImageSrc(src, 1080))))], [product]);
  const positions = useMemo(() => new Map(images.map((src, i) => [src, i])), [images]);
  return <section className="details-grid sf-product">
    <ProductGallery key={color} sources={images} alt={title} initial={positions.get(photo(product.color_images?.[color] ?? null) ?? "") ?? 0} />
    <div className="sf-buy-column">{children}<Buy p={product} detail basePath={basePath} onColorChange={setColor}
      sticky={sticky ? { currency, initialNow } : undefined} /></div>
  </section>;
}

export function ProductGallery({ sources, alt, initial = 0 }: { sources: string[]; alt: string; initial?: number }) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState(initial);
  const [enlarged, setEnlarged] = useState(false);
  const src = sources[active] ?? sources[0];

  return (
    <div className="product-gallery" data-multiple={sources.length > 1}>
      <div className="product-photo gallery-stage">
        {src ? (
          <button className="gallery-open" type="button" aria-label={en ? "Enlarge product image" : "تكبير صورة المنتج"}
            onClick={() => { setEnlarged(true); dialog.current?.showModal(); }}>
            <Image fill unoptimized src={storefrontImageSrc(src, 1080)!} alt={alt} />
            <ZoomIn aria-hidden="true" size={22} />
          </button>
        ) : <Package size={54} strokeWidth={1} />}
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
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label={en ? "Close" : "إغلاق"}><X /></button>
        {enlarged && <Image width={1400} height={1400} unoptimized src={storefrontImageSrc(src, 1920)!} alt={alt} />}
      </dialog>}
    </div>
  );
}
