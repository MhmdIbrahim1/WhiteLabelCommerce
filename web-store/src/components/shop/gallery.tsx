"use client";
import { useState } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

const VIEW_LABELS = {
  ar: ["العرض الأساسي", "تفاصيل المنتج", "زاوية قريبة"],
  en: ["Main View", "Product Details", "Close-Up"],
} as const;

export function ProductGallery({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const { lang } = useLanguage();
  const labels = VIEW_LABELS[lang];
  const [active, setActive] = useState(0);
  const frameClasses = [
    "gallery-view--main",
    "gallery-view--zoom",
    "gallery-view--angle",
  ];

  return (
    <div className="product-gallery">
      <div className={"product-photo gallery-stage " + frameClasses[active]}>
        {src ? (
          <Image fill unoptimized src={src} alt={alt} />
        ) : (
          <Package size={54} strokeWidth={1} />
        )}
      </div>
      <div
        className="gallery-thumbs"
        role="tablist"
        aria-label={lang === "en" ? "Product images" : "صور المنتج"}
      >
        {labels.map((label, idx) => (
          <button
            key={idx}
            type="button"
            role="tab"
            aria-selected={active === idx}
            aria-label={label}
            className={"gallery-thumb " + frameClasses[idx]}
            data-active={active === idx ? "true" : "false"}
            onClick={() => setActive(idx)}
          >
            {src ? (
              <Image fill unoptimized src={src} alt={label} />
            ) : (
              <Package size={20} strokeWidth={1.3} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
