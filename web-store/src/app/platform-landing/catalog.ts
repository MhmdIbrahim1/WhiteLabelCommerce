import fragrance from "./photos/fragrance.webp";
import audio from "./photos/audio.webp";
import coffee from "./photos/coffee.webp";
import fashion from "./photos/fashion.webp";
import objects from "./photos/objects.webp";
import knit from "./photos/knit.webp";
import type { Lang } from "@/lib/i18n";

export const photos = { fragrance, audio, coffee, fashion, objects, knit };
export const verticals = ["fragrance", "audio", "coffee", "fashion", "objects"] as const;
export type Vertical = (typeof verticals)[number];

export const catalog = {
  fragrance: { brand: "Sillage", category: { en: "Fragrance", ar: "عطور" }, name: { en: "Amber No. 04", ar: "عطر أمبر" },
    detail: { en: "Eau de parfum", ar: "ماء عطر مركّز" }, spec: "50 ml", price: 980 },
  audio: { brand: "Frequency", category: { en: "Electronics", ar: "إلكترونيات" }, name: { en: "Studio One", ar: "سماعات ستوديو ون" },
    detail: { en: "Wireless headphones", ar: "سماعات لاسلكية" }, spec: "32 Ω", price: 2450 },
  coffee: { brand: "Slow Pour", category: { en: "Coffee", ar: "قهوة" }, name: { en: "The amber brewer", ar: "قطّارة أمبر" },
    detail: { en: "Glass pour-over set", ar: "طقم تقطير زجاجي" }, spec: "600 ml", price: 740 },
  fashion: { brand: "Fold", category: { en: "Fashion", ar: "أزياء" }, name: { en: "Market tote", ar: "حقيبة ماركت" },
    detail: { en: "Heavy cotton canvas", ar: "قماش قطني متين" }, spec: "38 × 42 cm", price: 620 },
  objects: { brand: "Forma", category: { en: "Home", ar: "ديكور" }, name: { en: "Loop vessel", ar: "مزهرية لوب" },
    detail: { en: "Hand-finished stoneware", ar: "خزف مشغول يدوياً" }, spec: "24 cm", price: 860 },
} as const;

export function displayPrice(amount: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "en" ? "en-EG" : "ar-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 0, minimumFractionDigits: 0,
  }).format(amount);
}
