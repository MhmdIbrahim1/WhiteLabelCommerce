import { NextResponse } from "next/server";
import { serverDb } from "@/lib/db";
import { photo } from "@/lib/shop";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UpsellRpcRow = {
  id: string;
  name: string;
  name_en: string | null;
  price: number;
  old_price: number | null;
  flash_sale_price: number | null;
  flash_sale_starts_at: string | null;
  flash_sale_ends_at: string | null;
  stock: number;
  sizes: string[] | null;
  colors: string[] | null;
  image_path: string | null;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const excludeRaw = url.searchParams.get("exclude") ?? "";
    const excludeIds = excludeRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => UUID_RE.test(s))
      .slice(0, 100);

    const gapNum = Number(url.searchParams.get("gap") ?? 0);
    const gapAmount = Number.isFinite(gapNum) && gapNum > 0 ? gapNum : 0;

    const limitNum = Number(url.searchParams.get("limit") ?? 4);
    const limit =
      Number.isFinite(limitNum) && limitNum >= 1
        ? Math.min(8, Math.floor(limitNum))
        : 4;

    const [db, store] = await Promise.all([
      serverDb(),
      resolveActiveStoreOrDefault(),
    ]);

    const { data, error } = await db.rpc("get_cart_upsell_products", {
      p_store_id: store.id,
      p_cart_product_ids: excludeIds,
      p_gap_amount: gapAmount,
      p_limit: limit,
    });

    if (error) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const rows = ((data ?? []) as UpsellRpcRow[]).map((p) => ({
      id: p.id,
      name: p.name,
      name_en: p.name_en,
      price: Number(p.price),
      old_price: p.old_price !== null ? Number(p.old_price) : null,
      flash_sale_price:
        p.flash_sale_price !== null ? Number(p.flash_sale_price) : null,
      flash_sale_starts_at: p.flash_sale_starts_at,
      flash_sale_ends_at: p.flash_sale_ends_at,
      stock: Number(p.stock),
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      colors: Array.isArray(p.colors) ? p.colors : [],
      image_url: photo(p.image_path),
    }));

    return NextResponse.json(
      { items: rows },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
