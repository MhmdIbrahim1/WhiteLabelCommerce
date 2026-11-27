import type { TemplateId } from "./theme-templates";

const sans = '"DM Sans Variable", "IBM Plex Sans Arabic", sans-serif';
const serif = 'Georgia, "Times New Roman", "IBM Plex Sans Arabic", serif';

export const storefrontPresets = {
  fashion_editorial: {
    page: "#FCFBF9", panel: "#EFECE7", ink: "#211F1E", muted: "#655F59", line: "#D8D3CD",
    action: "#24211F", accent: "#745242", hero: "#EDE7DE", display: serif, weight: 400,
    radius: 2, ratio: "3 / 4", gap: "clamp(1rem, 2.5vw, 2.25rem)", columns: 3,
    sectionGap: "clamp(2.5rem, 6vw, 5rem)",
    en: { title: "The wardrobe edit", body: "Explore silhouettes, textures and pieces to wear together.", cta: "Shop the collection" },
    ar: { title: "مختارات خزانة الملابس", body: "اكتشف القصّات والخامات، واختر القطع التي تنسجم مع أسلوبك.", cta: "تسوّق التشكيلة" },
  },
  tech_precision: {
    page: "#F8FAFB", panel: "#E8EDF0", ink: "#182129", muted: "#4F5D68", line: "#C2CBD2",
    action: "#21303B", accent: "#246257", hero: "#202A32", display: sans, weight: 680,
    radius: 3, ratio: "1 / 1", gap: "0.75rem", columns: 4, sectionGap: "clamp(2rem, 4vw, 3.5rem)",
    en: { title: "Inside the details", body: "Compare the features and specifications that matter to you.", cta: "Explore electronics" },
    ar: { title: "التفاصيل تصنع الفرق", body: "قارن المزايا والمواصفات واختر الجهاز الذي يناسب استخدامك.", cta: "تصفّح الإلكترونيات" },
  },
  beauty_maison: {
    page: "#FFFCFA", panel: "#F5EBE6", ink: "#352B29", muted: "#6B5753", line: "#E1CFCA",
    action: "#623F43", accent: "#8B5759", hero: "#F2E2DC", display: serif, weight: 400,
    radius: 18, ratio: "4 / 5", gap: "clamp(1rem, 2.2vw, 1.8rem)", columns: 3, sectionGap: "clamp(2.5rem, 5vw, 4.75rem)",
    en: { title: "The beauty cabinet", body: "Discover fragrances, shades and textures for your daily ritual.", cta: "Explore the collection" },
    ar: { title: "على رفّ الجمال", body: "اكتشفي الروائح والدرجات والقوام الذي يناسب روتينك اليومي.", cta: "تصفّحي المجموعة" },
  },
  gourmet_craft: {
    page: "#FFFDF6", panel: "#F0ECDD", ink: "#2D3326", muted: "#59604C", line: "#D8D5BE",
    action: "#364B32", accent: "#824521", hero: "#E9E4CB", display: serif, weight: 600,
    radius: 10, ratio: "5 / 4", gap: "0.875rem", columns: 5, sectionGap: "clamp(1.75rem, 3.5vw, 3rem)",
    en: { title: "From the pantry", body: "Browse the shelves and bring a new flavour to the table.", cta: "Shop the market" },
    ar: { title: "من رفوف المؤونة", body: "تجوّل بين الأصناف واختر نكهة جديدة لمائدتك.", cta: "تسوّق من السوق" },
  },
  commerce_signature: {
    page: "#FFFFFF", panel: "#F4F4F5", ink: "#111315", muted: "#56595E", line: "#DADBDD",
    action: "#0B0B0C", accent: "#3E5147", hero: "#E9ECE6", display: sans, weight: 580,
    radius: 12, ratio: "4 / 5", gap: "clamp(0.875rem, 1.6vw, 1.5rem)", columns: 4, sectionGap: "clamp(2rem, 4.5vw, 4rem)",
    en: { title: "The everyday collection", body: "Browse the latest arrivals or find a favourite by category.", cta: "Shop the collection" },
    ar: { title: "مختارات لكل يوم", body: "تعرّف على أحدث المنتجات أو انتقل مباشرة إلى قسمك المفضّل.", cta: "تسوّق المجموعة" },
  },
} as const;

export type StorefrontPreset = keyof typeof storefrontPresets;
const legacyPresets: Record<TemplateId, StorefrontPreset> = {
  "modern-minimal": "commerce_signature", "luxury-boutique": "fashion_editorial",
  "tech-grid": "tech_precision", "vibrant-pop": "beauty_maison",
};

export function isStorefrontPreset(value: unknown): value is StorefrontPreset {
  return typeof value === "string" && Object.hasOwn(storefrontPresets, value);
}

export function resolveStorefrontPreset(value: unknown, template?: unknown): StorefrontPreset {
  if (isStorefrontPreset(value)) return value;
  return typeof template === "string" && Object.hasOwn(legacyPresets, template)
    ? legacyPresets[template as TemplateId] : "commerce_signature";
}
