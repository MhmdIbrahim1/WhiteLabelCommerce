import type { Lang } from "./i18n";

export type Variant = { color: string; size: string; stock: number };
export const variantKey = (color: string, size: string) => JSON.stringify([color, size]);

export function indexVariants(rows: Variant[] = []) {
  const pairs = new Map<string, number>();
  const colors = new Map<string, number>();
  const sizes = new Map<string, number>();
  for (const { color, size, stock } of rows) {
    pairs.set(variantKey(color, size), stock);
    colors.set(color, (colors.get(color) ?? 0) + stock);
    sizes.set(size, (sizes.get(size) ?? 0) + stock);
  }
  return { pairs, colors, sizes };
}

export function stockLabel(stock: number, lang: Lang) {
  if (stock <= 0) return lang === "en" ? "Out of Stock" : "نفذت الكمية";
  if (stock <= 5) return lang === "en" ? "Almost gone" : "على وشك النفاد";
  return lang === "en" ? "In Stock" : "متوفر";
}
