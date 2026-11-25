import type { Lang } from "./i18n";

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

/**
 * Returns true ONLY when a flash sale price is set, strictly lower than regular price,
 * has a valid future end timestamp, and (if a start timestamp is set) has already started.
 */
export function isFlashSaleActive(
  input: FlashSalePriceInput,
  nowMs: number = Date.now(),
): boolean {
  const regular = Number(input.price);
  const flash =
    input.flash_sale_price === null || input.flash_sale_price === undefined
      ? NaN
      : Number(input.flash_sale_price);

  if (!Number.isFinite(regular) || !Number.isFinite(flash)) return false;
  if (flash <= 0 || flash >= regular) return false;

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

/**
 * Returns integer percentage savings (1..99) for an active flash sale compared to regular price,
 * or null if the flash sale is not active.
 */
export function getFlashSavingsPercent(
  input: FlashSalePriceInput,
  nowMs: number = Date.now(),
): number | null {
  if (!isFlashSaleActive(input, nowMs)) return null;
  const regular = Number(input.price);
  const flash = Number(input.flash_sale_price);
  if (regular <= 0 || flash >= regular) return null;
  const pct = Math.round(((regular - flash) / regular) * 100);
  return Math.max(1, Math.min(99, pct));
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
