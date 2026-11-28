import type { Lang } from "./i18n";

export function serverNowMs(): number {
  return Date.now();
}

export type FlashSalePriceInput = {
  price: number;
  old_price?: number | null;
  flash_sale_price?: number | null;
  flash_sale_starts_at?: string | null;
  flash_sale_ends_at?: string | null;
};

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value || typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A separately reduced flash price compares to the selling price. Featuring an existing
 * discount keeps its original compare-at price. */
export function flashCompareAt(input: FlashSalePriceInput): number | null {
  const regular = Number(input.price);
  const flash = Number(input.flash_sale_price);
  if (!Number.isFinite(regular) || !Number.isFinite(flash) || flash <= 0) return null;
  if (flash < regular) return regular;
  const previous = Number(input.old_price);
  return flash === regular && Number.isFinite(previous) && previous > regular ? previous : null;
}

export function parseFlashSaleForm(form: FormData, regularPrice: number | null) {
  const enabled = form.get("flash_sale_enabled");
  const priceText = String(form.get("flash_sale_price") ?? "").trim();
  // Older product forms expressed the same choice by setting or clearing the flash price.
  if (enabled === "off" || (enabled === null && !priceText)) {
    return { flash_sale_price: null, flash_sale_starts_at: null, flash_sale_ends_at: null };
  }
  if (regularPrice === null || (enabled !== null && enabled !== "on")) return null;

  const price = Number(priceText);
  const compareAt = flashCompareAt({ price: regularPrice, old_price: Number(form.get("old_price")), flash_sale_price: price });
  const startText = String(form.get("flash_sale_starts_at") ?? "").trim();
  const startsAt = parseTimestamp(startText);
  const endsAt = parseTimestamp(String(form.get("flash_sale_ends_at") ?? "").trim());
  if (compareAt === null || endsAt === null || (startText && startsAt === null) ||
      (startsAt !== null && startsAt >= endsAt)) {
    return null;
  }
  return {
    flash_sale_price: price,
    flash_sale_starts_at: startsAt === null ? null : new Date(startsAt).toISOString(),
    flash_sale_ends_at: new Date(endsAt).toISOString(),
  };
}

/**
 * A configured discount appears in Flash Sale from its optional start up to its end.
 */
export function isFlashSaleActive(
  input: FlashSalePriceInput,
  nowMs: number = Date.now(),
): boolean {
  if (flashCompareAt(input) === null) return false;

  const endsMs = parseTimestamp(input.flash_sale_ends_at);
  if (endsMs === null || endsMs <= nowMs) return false;

  const startsMs = parseTimestamp(input.flash_sale_starts_at);
  if (startsMs !== null && nowMs < startsMs) return false;

  return true;
}

/**
 * Returns the active flash sale price when within the valid window, otherwise regular price.
 */
export function resolveEffectivePrice(
  input: FlashSalePriceInput,
  nowMs: number = Date.now(),
): number {
  if (isFlashSaleActive(input, nowMs)) {
    return Number(input.flash_sale_price);
  }
  return Number(input.price);
}

export function lineEffectivePrice(
  line: { price: number; regular_price?: number | null } & Omit<FlashSalePriceInput, "price">,
  nowMs: number = Date.now(),
): number {
  const basePrice =
    typeof line.regular_price === "number" && Number.isFinite(line.regular_price)
      ? line.regular_price
      : line.price;
  if (
    line.flash_sale_price !== undefined ||
    line.flash_sale_ends_at !== undefined
  ) {
    return resolveEffectivePrice({ ...line, price: basePrice }, nowMs);
  }
  return line.price;
}

/**
 * Returns integer percentage savings (1..99) for an active flash sale.
 */
export function getFlashSavingsPercent(
  input: FlashSalePriceInput,
  nowMs: number = Date.now(),
): number | null {
  if (!isFlashSaleActive(input, nowMs)) return null;
  return getRegularSavingsPercent({ price: Number(input.flash_sale_price), old_price: flashCompareAt(input) });
}

/**
 * Returns integer percentage savings (1..99) for compare-at old_price when not on flash sale.
 */
export function getRegularSavingsPercent(
  input: FlashSalePriceInput,
): number | null {
  const regular = Number(input.price);
  const oldPrice =
    input.old_price === null || input.old_price === undefined
      ? NaN
      : Number(input.old_price);
  if (!Number.isFinite(regular) || !Number.isFinite(oldPrice)) return null;
  if (oldPrice <= 0 || oldPrice <= regular) return null;
  const pct = Math.round(((oldPrice - regular) / oldPrice) * 100);
  return Math.max(1, Math.min(99, pct));
}

export function productPricePresentation(product: FlashSalePriceInput, now: number) {
  const flash = isFlashSaleActive(product, now);
  const current = Number(flash ? product.flash_sale_price : product.price);
  const compareAt = flash ? flashCompareAt(product) : product.old_price;
  const savings = getRegularSavingsPercent({ price: current, old_price: compareAt });
  return {
    flash,
    current,
    compareAt: savings === null ? null : Number(compareAt),
    savings,
  };
}

export function formatSavings(percent: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { style: "percent" }).format(-percent / 100);
}

type SaleWindow = Pick<FlashSalePriceInput, "flash_sale_starts_at" | "flash_sale_ends_at">;

export function nextSaleBoundary(products: readonly SaleWindow[], now: number) {
  let next = Infinity;
  for (const p of products) {
    for (const date of [p.flash_sale_starts_at, p.flash_sale_ends_at]) {
      const ms = parseTimestamp(date);
      if (ms !== null && ms > now) next = Math.min(next, ms);
    }
  }
  return next;
}

/**
 * Returns remaining milliseconds until flash sale ends, or 0 if expired/invalid.
 */
export function getFlashRemainingMs(
  endsAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  const endsMs = parseTimestamp(endsAt);
  if (endsMs === null) return 0;
  return Math.max(0, endsMs - nowMs);
}

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/**
 * Formats remaining duration cleanly with fixed-width numeric groups suitable for `tabular-nums`:
 * e.g. `2d 14:35:12` / `2ي 14:35:12` or `14:35:12` when < 24h.
 */
export function formatFlashCountdown(remainingMs: number, lang: Lang): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const hms = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  if (days > 0) {
    return lang === "en" ? `${days}d ${hms}` : `${days}ي ${hms}`;
  }
  return hms;
}

/**
 * Filters and sorts currently active, in-stock flash sale products by soonest expiry.
 */
export function filterActiveFlashDeals<
  T extends FlashSalePriceInput & { stock: number },
>(products: T[], nowMs: number = Date.now()): T[] {
  return products
    .filter((p) => p.stock > 0 && isFlashSaleActive(p, nowMs))
    .sort((a, b) => {
      const aEnd = a.flash_sale_ends_at
        ? Date.parse(a.flash_sale_ends_at)
        : Infinity;
      const bEnd = b.flash_sale_ends_at
        ? Date.parse(b.flash_sale_ends_at)
        : Infinity;
      return aEnd - bEnd;
    });
}

export type CatalogSortKey =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "rating"
  | "newest";

export function filterAndSortCatalogProducts<
  T extends FlashSalePriceInput & {
    stock: number;
    avg_rating?: number | null;
    review_count?: number | null;
    created_at?: string | null;
  },
>(
  products: T[],
  options: {
    flashOnly?: boolean;
    inStockOnly?: boolean;
    minPrice?: number | null;
    maxPrice?: number | null;
    sort?: CatalogSortKey;
  },
  nowMs: number = Date.now(),
): T[] {
  const {
    flashOnly = false,
    inStockOnly = false,
    minPrice = null,
    maxPrice = null,
    sort = "relevance",
  } = options;

  const filtered = products.filter((p) => {
    if (inStockOnly && Number(p.stock) <= 0) return false;
    if (flashOnly && !isFlashSaleActive(p, nowMs)) return false;
    const eff = resolveEffectivePrice(p, nowMs);
    if (minPrice !== null && Number.isFinite(minPrice) && eff < minPrice) {
      return false;
    }
    if (maxPrice !== null && Number.isFinite(maxPrice) && eff > maxPrice) {
      return false;
    }
    return true;
  });

  if (sort === "price_asc") {
    return [...filtered].sort(
      (a, b) => resolveEffectivePrice(a, nowMs) - resolveEffectivePrice(b, nowMs),
    );
  }
  if (sort === "price_desc") {
    return [...filtered].sort(
      (a, b) => resolveEffectivePrice(b, nowMs) - resolveEffectivePrice(a, nowMs),
    );
  }
  if (sort === "rating") {
    return [...filtered].sort((a, b) => {
      const rDiff = Number(b.avg_rating ?? 0) - Number(a.avg_rating ?? 0);
      if (Math.abs(rDiff) > 0.001) return rDiff;
      return Number(b.review_count ?? 0) - Number(a.review_count ?? 0);
    });
  }
  if (sort === "newest") {
    return [...filtered].sort((a, b) => {
      const aTs = a.created_at ? Date.parse(a.created_at) : 0;
      const bTs = b.created_at ? Date.parse(b.created_at) : 0;
      return bTs - aTs;
    });
  }
  if (flashOnly) {
    return [...filtered].sort((a, b) => {
      const aEnd = a.flash_sale_ends_at
        ? Date.parse(a.flash_sale_ends_at)
        : Infinity;
      const bEnd = b.flash_sale_ends_at
        ? Date.parse(b.flash_sale_ends_at)
        : Infinity;
      return aEnd - bEnd;
    });
  }
  return filtered;
}

/**
 * Converts an ISO timestamp string to local `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`.
 */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  const ms = parseTimestamp(iso);
  if (ms === null) return "";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
