import { serverDb } from "@/lib/db";
import { STORE_ID_HEADER } from "@/lib/tenant-shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcError = {
  code?: string | null;
  message?: string | null;
};

function isTransientRpcError(error: RpcError | null): boolean {
  const code = String(error?.code ?? "").toUpperCase();
  return (
    code.startsWith("08") ||
    code.startsWith("53") ||
    code === "40001" ||
    code === "40P01" ||
    code === "55P03" ||
    code === "57014" ||
    code === "57P01" ||
    code === "PGRST000" ||
    code === "PGRST001" ||
    code === "PGRST002" ||
    code === "PGRST003"
  );
}

function rpcFailure(error: RpcError) {
  const code = String(error.code ?? "database_error").toUpperCase();
  const transient = isTransientRpcError(error);
  if (transient) {
    return Response.json(
      {
        ok: false,
        error: { category: "database_unavailable", code, retryable: true },
      },
      { status: 503 },
    );
  }
  if (code === "42501" || code === "PGRST301") {
    return Response.json(
      { ok: false, error: { category: "forbidden", code, retryable: false } },
      { status: 403 },
    );
  }
  if (code === "23503" || code === "23505") {
    return Response.json(
      {
        ok: false,
        error: { category: "database_conflict", code, retryable: false },
      },
      { status: 409 },
    );
  }
  if (
    code === "22023" ||
    code === "22P02" ||
    code === "23514" ||
    code === "P0001"
  ) {
    return Response.json(
      {
        ok: false,
        error: { category: "write_rejected", code, retryable: false },
      },
      { status: 422 },
    );
  }
  return Response.json(
    {
      ok: false,
      error: { category: "database_error", code, retryable: false },
    },
    { status: 500 },
  );
}

async function runRpcWithTransientRetry<T extends { error: RpcError | null }>(
  operation: () => PromiseLike<T>,
): Promise<T> {
  const first = await operation();
  if (!isTransientRpcError(first.error)) return first;
  return operation();
}

export async function POST(req: Request) {
  let body: {
    storeId?: unknown;
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
    return Response.json(
      {
        ok: false,
        error: { category: "invalid_request", code: "invalid_json", retryable: false },
      },
      { status: 400 },
    );
  }

  const storeId = req.headers.get(STORE_ID_HEADER);
  if (!storeId || body?.storeId !== storeId) {
    return Response.json({ ok: false, error: { category: "forbidden", code: "store_mismatch", retryable: false } }, { status: 403 });
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
    return Response.json(
      {
        ok: false,
        error: {
          category: "invalid_request",
          code: "invalid_session_key",
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  try {
    const db = await serverDb();

    if (action === "recover") {
      const orderId =
        typeof body.order_id === "string" && UUID_RE.test(body.order_id.trim())
          ? body.order_id.trim()
          : null;
      const result = await runRpcWithTransientRetry(() =>
        db.rpc("mark_abandoned_cart_recovered", {
          p_store_id: storeId,
          p_session_key: sessionKey.length >= 24 ? sessionKey : null,
          p_order_id: orderId,
        }),
      );
      if (result.error) return rpcFailure(result.error);
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

    const result = await runRpcWithTransientRetry(() =>
      db.rpc("upsert_abandoned_cart", {
        p_store_id: storeId,
        p_session_key: sessionKey,
        p_items: items,
        p_subtotal: Math.round(subtotal * 100) / 100,
        p_currency: currency,
        p_source: source,
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone,
      }),
    );
    if (result.error) return rpcFailure(result.error);

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return Response.json(
      {
        ok: false,
        error: { category: "internal_error", code: "unexpected", retryable: false },
      },
      { status: 500 },
    );
  }
}
