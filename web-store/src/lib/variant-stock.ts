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

export function quantityLimitHint(lang: Lang) {
  return lang === "en" ? "Quantity limit reached for this order." : "بلغت الحد المتاح لهذا المنتج في الطلب.";
}

export function orderLimitError(lang: Lang, allowed?: number) {
  if (allowed === undefined) return quantityLimitHint(lang);
  return lang === "en" ? `Reduce the quantity in your cart to ${allowed} or fewer.`
    : `خفّض الكمية في سلتك إلى ${allowed} أو أقل.`;
}

type InventoryLine = {
  id: string; size: string; color: string; stock: number;
  variantStock?: boolean; productStock?: number; max_order_qty?: number | null;
};

export function remainingQuantity(rows: readonly { id: string; size: string; color: string; quantity: number }[], line: InventoryLine, defaultLimit: number | null) {
  const productLimit = Math.min(line.productStock ?? (line.variantStock ? Infinity : line.stock),
    line.max_order_qty ?? defaultLimit ?? Infinity);
  let total = 0, selected = 0;
  for (const row of rows) {
    if (row.id !== line.id) continue;
    total += row.quantity;
    if (row.size === line.size && row.color === line.color) selected += row.quantity;
  }
  return Math.min(productLimit - total, line.stock - (line.variantStock ? selected : total));
}
