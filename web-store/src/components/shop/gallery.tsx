"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Package, X, ZoomIn } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export function ProductGallery({ sources, alt }: { sources: string[]; alt: string }) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const src = sources[active] ?? sources[0];

  return (
    <div className="product-gallery" data-multiple={sources.length > 1}>
      <div className="product-photo gallery-stage">
        {src ? (
          <button className="gallery-open" type="button" aria-label={en ? "Enlarge product image" : "تكبير صورة المنتج"}
            onClick={() => { setEnlarged(true); dialog.current?.showModal(); }}>
            <Image fill unoptimized src={src} alt={alt} />
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
              <Image fill unoptimized src={image} alt="" />
            </button>
          ))}
        </div>
      )}
      {src && <dialog ref={dialog} className="gallery-lightbox" aria-label={alt} onClose={() => setEnlarged(false)}
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label={en ? "Close" : "إغلاق"}><X /></button>
        {enlarged && <Image width={1400} height={1400} unoptimized src={src} alt={alt} />}
      </dialog>}
    </div>
  );
}
