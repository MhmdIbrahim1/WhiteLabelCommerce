import { serverDb } from "@/lib/db";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let body: {
    action?: unknown;
    session_key?: unknown;
    items?: unknown;
    subtotal?: unknown;
    currency?: unknown;
    source?: unknown;
    customer_name?: unknown;
    customer_email?: unknown;
    customer_phone?: unknown;
    order_id?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const action =
    typeof body.action === "string" && body.action.trim() === "recover"
      ? "recover"
      : "upsert";
  const sessionKey =
    typeof body.session_key === "string"
      ? body.session_key.trim().slice(0, 120)
      : "";

  if (action === "upsert" && sessionKey.length < 24) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const [db, store] = await Promise.all([
      serverDb(),
      resolveActiveStoreOrDefault(),
    ]);

    if (action === "recover") {
      const orderId =
        typeof body.order_id === "string" && UUID_RE.test(body.order_id.trim())
          ? body.order_id.trim()
          : null;
      await db.rpc("mark_abandoned_cart_recovered", {
        p_store_id: store.id,
        p_session_key: sessionKey.length >= 24 ? sessionKey : null,
        p_order_id: orderId,
      });
      return Response.json({ ok: true }, { status: 200 });
    }

    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    const subtotal = Math.max(0, Number(body.subtotal) || 0);
    const currency =
      typeof body.currency === "string" && body.currency.trim()
        ? body.currency.trim().toUpperCase().slice(0, 8)
        : "EGP";
    const source = body.source === "android" ? "android" : "web";
    const customerName =
      typeof body.customer_name === "string" && body.customer_name.trim()
        ? body.customer_name.trim().slice(0, 120)
        : null;
    const customerEmail =
      typeof body.customer_email === "string" && body.customer_email.trim()
        ? body.customer_email.trim().slice(0, 180)
        : null;
    const customerPhone =
      typeof body.customer_phone === "string" && body.customer_phone.trim()
        ? body.customer_phone.trim().slice(0, 32)
        : null;

    await db.rpc("upsert_abandoned_cart", {
      p_store_id: store.id,
      p_session_key: sessionKey,
      p_items: items,
      p_subtotal: Math.round(subtotal * 100) / 100,
      p_currency: currency,
      p_source: source,
      p_customer_name: customerName,
      p_customer_email: customerEmail,
      p_customer_phone: customerPhone,
    });

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return Response.json({ ok: false }, { status: 200 });
  }
}
