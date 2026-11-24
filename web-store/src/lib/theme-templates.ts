import type { CSSProperties } from "react";

export const templates = {
  "modern-minimal": {
    title: "عصري بسيط",
    title_en: "Modern Minimal",
    description: "أسطح بيضاء وظلال خفيفة تترك المساحة للمنتج.",
    description_en: "Clean white surfaces and soft shadows that put your products first.",
    primary: "#164E63",
    accent: "#C2410C",
    surface: "#FFFFFF",
    background: "#F6F8F9",
    line: "#DCE5E7",
    radius: 12,
    badge: "12px",
    gap: "1.25rem",
    shadow: "0 6px 22px #193B4510",
  },
  "luxury-boutique": {
    title: "بوتيك فاخر",
    title_en: "Luxury Boutique",
    description: "فحمي وذهبي مع حواف دقيقة ومساحات عرض واسعة.",
    description_en: "Charcoal and warm gold tones with refined edges and airy editorial spacing.",
    primary: "#242322",
    accent: "#856425",
    surface: "#FFFDFA",
    background: "#F5F1EA",
    line: "#C9BA9D",
    radius: 4,
    badge: "2px",
    gap: "1.75rem",
    shadow: "0 2px 5px #32251B08",
  },
  "vibrant-pop": {
    title: "حيوي ومشرق",
    title_en: "Vibrant Pop",
    description: "ألوان توتية قوية وبطاقات مستديرة بظلال بارزة.",
    description_en: "Bold berry accents and rounded cards with playful elevated shadows.",
    primary: "#752AA0",
    accent: "#B92D59",
    surface: "#FFFCFF",
    background: "#FAF2FC",
    line: "#E5C7EB",
    radius: 20,
    badge: "999px",
    gap: "1.5rem",
    shadow: "0 9px 22px #76289B29, 0 3px 0 #E9CFEB",
  },
  "tech-grid": {
    title: "تقني منظم",
    title_en: "Tech Grid",
    description: "شبكة متقاربة وحدود واضحة بدرجات النيلي والأردوازي.",
    description_en: "Crisp compact grid and structured borders in indigo and slate tones.",
    primary: "#303D87",
    accent: "#17677A",
    surface: "#FAFCFF",
    background: "#EDF1F8",
    line: "#ABB9CE",
    radius: 8,
    badge: "4px",
    gap: "0.85rem",
    shadow: "0 2px 0 #B8C5D9",
  },
} as const;
export type TemplateId = keyof typeof templates;
export function isTemplate(value: unknown): value is TemplateId {
  return typeof value === "string" && Object.hasOwn(templates, value);
}
export function templateVars(id: TemplateId): CSSProperties {
  const t = templates[id];
  return {
    "--primary": t.primary,
    "--secondary": t.accent,
    "--paper": t.surface,
    "--template-bg": t.background,
    "--template-line": t.line,
    "--radius": t.radius + "px",
    "--badge-radius": t.badge,
    "--grid-gap": t.gap,
    "--card-shadow": t.shadow,
  } as CSSProperties;
}
