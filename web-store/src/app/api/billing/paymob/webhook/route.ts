import { reconcileSubscriptionPayment } from "@/lib/subscription-paymob";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  const body = await request.json().catch(() => null);
  try {
    const result = await reconcileSubscriptionPayment(body?.obj, body?.hmac ?? new URL(request.url).searchParams.get("hmac") ?? "");
    if (!result) return Response.json({ ok: false }, { status: 401, headers });
    return Response.json({ ok: true, invoiceId: result.invoiceId, status: result.status }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
