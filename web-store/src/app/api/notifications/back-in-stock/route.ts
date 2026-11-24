import { serverDb } from "@/lib/db";
import { settings } from "@/lib/shop";
import { UUID_RE } from "@/lib/paymob";

type RestockBody = {
  product_id?: unknown;
  variant_key?: unknown;
  phone?: unknown;
  push_token?: unknown;
};

export async function POST(req: Request) {
  let body: RestockBody;
  try {
    body = (await req.json()) as RestockBody;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const productId =
    typeof body.product_id === "string" ? body.product_id.trim() : "";
  const variantKey =
    typeof body.variant_key === "string"
      ? body.variant_key.trim().slice(0, 100)
      : "";
  const phone =
    typeof body.phone === "string"
      ? body.phone.replace(/\D+/g, "").slice(0, 15)
      : null;
  const pushToken =
    typeof body.push_token === "string" ? body.push_token.trim() : null;

  if (!UUID_RE.test(productId)) {
    return Response.json({ error: "Invalid product_id." }, { status: 400 });
  }

  const [db, store] = await Promise.all([serverDb(), settings()]);
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user && (!phone || phone.length < 8) && !pushToken) {
    return Response.json(
      { error: "contact_required" },
      { status: 400 },
    );
  }

  const { data, error } = await db.rpc("subscribe_back_in_stock", {
    p_store_id: store.storeId,
    p_product_id: productId,
    p_variant_key: variantKey,
    p_phone: phone,
    p_push_token: pushToken,
  });

  if (error) {
    return Response.json(
      { error: error.message || "restock_subscribe_failed" },
      { status: 400 },
    );
  }

  return Response.json(
    { ok: true, id: data },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
