import { reconcilePaymob } from "@/lib/paymob-reconciliation";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  if (!payload?.obj || typeof payload.obj !== "object") return Response.json({ ok: false }, { status: 400 });
  const hmac = payload.hmac || new URL(req.url).searchParams.get("hmac") || "";
  try {
    const result = typeof hmac === "string" && await reconcilePaymob(payload.obj, hmac);
    if (!result) return Response.json({ ok: false }, { status: 401 });
    return Response.json({ ok: true, order_id: result.order.id, payment_status: result.status, idempotent: !result.transitioned });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
