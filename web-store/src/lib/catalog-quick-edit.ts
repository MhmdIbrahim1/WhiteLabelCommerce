import type { Variant } from "./variant-stock";
import { flashCompareAt } from "./flash-sale.ts";

export function numberField(value: string, integer = false) {
  const n = Number(value);
  return value && Number.isFinite(n) && n >= 0 && (!integer || Number.isSafeInteger(n)) ? n : null;
}

type Inventory = { stock: number; old_price: number | null; flash_sale_price: number | null; product_variants: Variant[] };

export function quickProductChange(current: Inventory, form: FormData) {
  const field = (key: string) => String(form.get(key) ?? "").trim();
  const name = field("name");
  const price = numberField(field("price"));
  const originalStock = numberField(field("original_stock"), true);
  const visibility = field("visibility");
  if (!name || price === null || originalStock === null || !["active", "draft"].includes(visibility)) return "invalid";
  const shared = current.product_variants.length === 0;
  if (originalStock !== current.stock || shared !== form.has("stock")) return "inventory_changed";
  if (current.flash_sale_price != null && flashCompareAt({ ...current, price }) === null) return "flash_price";
  const stock = shared ? numberField(field("stock"), true) : current.stock;
  if (stock === null || stock > 2147483647) return "invalid";
  // Omitted fields are preserved by jsonb_populate_record on the locked product.
  return { price, stock, fields: { name, name_en: field("name_en"), price, is_active: visibility === "active", ...(shared && { stock }) } };
}
