import { serverDb } from "@/lib/db";
import { photo, settings } from "@/lib/shop";
import type { SearchMatchType, SmartSearchHit } from "@/lib/smart-search";

type FastSearchRow = {
  id: string;
  name: string;
  name_en?: string | null;
  price: number;
  old_price: number | null;
  image_path: string | null;
  rank: number;
  match_type?: string | null;
};

function toMatchType(raw?: string | null): SearchMatchType {
  if (
    raw === "exact" ||
    raw === "synonym" ||
    raw === "spec" ||
    raw === "skeleton" ||
    raw === "phonetic" ||
    raw === "fuzzy"
  ) {
    return raw;
  }
  return "fuzzy";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json([], { headers: { "Cache-Control": "no-store" } });
  }

  const rawLimit = Number(searchParams.get("limit") ?? "8");
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(Math.trunc(rawLimit), 24))
    : 8;

  const rawOffset = Number(searchParams.get("offset") ?? "0");
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;

  const categoryId = searchParams.get("category")?.trim() || null;
  const validCategory =
    categoryId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      categoryId,
    )
      ? categoryId
      : null;

  const [db, store] = await Promise.all([serverDb(), settings()]);
  const { data, error } = await db.rpc("search_products_fast", {
    p_store_id: store.storeId,
    p_query: q.slice(0, 100),
    p_limit: limit,
    p_category_id: validCategory,
    p_offset: offset,
  });

  if (error) {
    return Response.json([], {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const hits: SmartSearchHit[] = ((data ?? []) as FastSearchRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    name_en: p.name_en ?? "",
    price: Number(p.price),
    old_price: p.old_price !== null ? Number(p.old_price) : null,
    image_url: photo(p.image_path),
    currency: store.currency,
    match_type: toMatchType(p.match_type),
    rank: Number(p.rank ?? 0),
  }));

  return Response.json(hits, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
