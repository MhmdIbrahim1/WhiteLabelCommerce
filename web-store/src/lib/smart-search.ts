export type SearchMatchType =
  | "exact"
  | "synonym"
  | "spec"
  | "skeleton"
  | "phonetic"
  | "fuzzy";

export type SmartSearchHit = {
  id: string;
  name: string;
  name_en: string;
  price: number;
  old_price: number | null;
  image_url: string | null;
  currency: string;
  match_type: SearchMatchType;
  rank?: number;
};

const ARABIC_DIACRITICS_RE =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]+/g;
const ARABIC_CHAR_MAP: Record<string, string> = {
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ة: "ه",
  ى: "ي",
  ؤ: "و",
  ئ: "ي",
};

export function normalizeArabicText(input: string | null | undefined): string {
  const stripped = (input ?? "").replace(ARABIC_DIACRITICS_RE, "");
  let mapped = "";
  for (const ch of stripped) {
    mapped += ARABIC_CHAR_MAP[ch] ?? ch;
  }
  return mapped
    .replace(/[^\u0600-\u06FF0-9a-zA-Z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEnglishText(input: string | null | undefined): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[-'’`]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical cache key so equivalent queries ("كوتشي", "كوتشي ", "T-Shirt", "tshirt")
 * share the same 0ms client-side LRU cache entry.
 */
export function normalizeSearchCacheKey(query: string): string {
  const raw = query.trim();
  if (!raw) return "";
  const ar = normalizeArabicText(raw);
  const en = normalizeEnglishText(raw);
  return `${ar}|${en}`;
}

type CacheEntry = {
  hits: SmartSearchHit[];
  expiresAt: number;
};

/**
 * Bounded client-side LRU cache (max 50 entries, 60s TTL) for server-first
 * autocomplete queries. Repeated/backspaced queries resolve in 0ms with zero
 * network traffic.
 */
class SearchLruCache {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly store = new Map<string, CacheEntry>();

  constructor(maxEntries = 50, ttlMs = 60_000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(query: string): SmartSearchHit[] | null {
    const key = normalizeSearchCacheKey(query);
    if (!key) return null;
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Promote to most-recently-used position
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.hits;
  }

  set(query: string, hits: SmartSearchHit[]): void {
    const key = normalizeSearchCacheKey(query);
    if (!key) return;
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, {
      hits,
      expiresAt: Date.now() + this.ttlMs,
    });
    if (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
  }
}

const clientSearchCache = new SearchLruCache(50, 60_000);

export function getCachedSearchHits(query: string): SmartSearchHit[] | null {
  return clientSearchCache.get(query);
}

export async function searchCatalogCached(
  query: string,
  signal?: AbortSignal,
): Promise<{ hits: SmartSearchHit[]; fromCache: boolean }> {
  const cached = clientSearchCache.get(query);
  if (cached !== null) {
    return { hits: cached, fromCache: true };
  }

  const res = await fetch(
    "/api/catalog-search?q=" + encodeURIComponent(query.trim()) + "&limit=8",
    { signal },
  );
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  const hits = (await res.json()) as SmartSearchHit[];
  clientSearchCache.set(query, hits);
  return { hits, fromCache: false };
}
