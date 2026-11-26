export type SearchMatchType = "exact" | "synonym" | "spec" | "description" | "fuzzy";

export type SearchMetadata = {
  effective_query: string;
  corrected_from: string | null;
  correction_reason: "spell" | "layout" | "franco" | null;
  was_auto_corrected: boolean;
  match_tier: number | null;
};

export type SmartSearchHit = SearchMetadata & {
  id: string;
  name: string;
  name_en: string;
  price: number;
  old_price: number | null;
  image_url: string | null;
  currency: string;
  match_type: SearchMatchType;
  rank: number;
};

type Entry = { hits: SmartSearchHit[]; expiresAt: number };
const cache = new Map<string, Entry>();

// Preserve keyboard punctuation and the shopper's spelling in correction metadata.
const keyFor = (storeId: string, query: string) => JSON.stringify([storeId, query.trim()]);

export function getCachedSearchHits(storeId: string, query: string): SmartSearchHit[] | null {
  const key = keyFor(storeId, query);
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  if (entry.expiresAt <= Date.now()) return null;
  cache.set(key, entry);
  return entry.hits;
}

export async function searchCatalogCached(storeId: string, slug: string, query: string, signal: AbortSignal) {
  const cached = getCachedSearchHits(storeId, query);
  if (cached) return cached;
  const params = new URLSearchParams({ q: query.trim(), limit: "8" });
  const res = await fetch(`/s/${encodeURIComponent(slug)}/api/catalog-search?${params}`, { signal });
  if (!res.ok) throw new Error("Catalog search unavailable");
  const hits: SmartSearchHit[] = await res.json();
  if (!signal.aborted) {
    cache.set(keyFor(storeId, query), { hits, expiresAt: Date.now() + 60_000 });
    const oldest = cache.keys().next();
    if (cache.size > 50 && !oldest.done) cache.delete(oldest.value);
  }
  return hits;
}
