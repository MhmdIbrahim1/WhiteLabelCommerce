import { adminDb } from "@/lib/supabase/admin";
import {
  extractOrderUuidFromMerchantOrderId,
  verifyPaymobTransactionHmac,
  type PaymobTransactionObj,
} from "@/lib/paymob";

type WebhookPayload = {
  obj?: PaymobTransactionObj;
  hmac?: string;
};

type OrderLookupRow = {
  id: string;
  store_id: string;
  total: number;
  currency: string;
  payment_status: string;
};

function isTruthyFlag(val: unknown): boolean {
  return val === true || val === "true";
}

export async function POST(req: Request) {
  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  const obj = payload?.obj;
  if (!obj || typeof obj !== "object") {
    return Response.json({ error: "Missing transaction object." }, { status: 400 });
  }

  const url = new URL(req.url);
  const receivedHmac =
    (typeof payload.hmac === "string" && payload.hmac.trim()) ||
    url.searchParams.get("hmac")?.trim() ||
    "";

  if (!receivedHmac) {
    return Response.json({ error: "Missing HMAC signature." }, { status: 401 });
  }

  try {
    const db = adminDb();
    const paymobOrderId =
      obj.order?.id !== undefined && obj.order?.id !== null
        ? String(obj.order.id)
        : null;
    const merchantUuid = extractOrderUuidFromMerchantOrderId(
      obj.order?.merchant_order_id,
    );

    let order: OrderLookupRow | null = null;
    if (paymobOrderId) {
      const { data } = await db
        .from("orders")
        .select("id,store_id,total,currency,payment_status")
        .eq("paymob_order_id", paymobOrderId)
        .maybeSingle<OrderLookupRow>();
      order = data;
    }

    if (!order && merchantUuid) {
      const { data } = await db
        .from("orders")
        .select("id,store_id,total,currency,payment_status")
        .eq("id", merchantUuid)
        .maybeSingle<OrderLookupRow>();
      order = data;
    }

    if (!order) {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    const { data: secrets } = await db
      .from("store_payment_secrets")
      .select("paymob_hmac_secret")
      .eq("store_id", order.store_id)
      .maybeSingle<{ paymob_hmac_secret: string | null }>();

    const hmacSecret = secrets?.paymob_hmac_secret?.trim() ?? "";
    if (!hmacSecret || !verifyPaymobTransactionHmac(obj, receivedHmac, hmacSecret)) {
      return Response.json({ error: "Invalid HMAC signature." }, { status: 401 });
    }

    // Idempotency: already paid orders are acknowledged without re-processing
    if (order.payment_status === "paid") {
      return Response.json({ ok: true, idempotent: true }, { status: 200 });
    }

    const isSuccess = isTruthyFlag(obj.success);
    const isPending = isTruthyFlag(obj.pending);
    const txCurrency = String(obj.currency ?? "").toUpperCase();
    const expectedAmountCents = Math.round(Number(order.total) * 100);
    const receivedAmountCents = Number(obj.amount_cents);

    // Anti-tampering check on currency & exact amount_cents before marking paid
    if (isSuccess && !isPending) {
      if (txCurrency !== "EGP" || receivedAmountCents !== expectedAmountCents) {
        return Response.json(
          { error: "Transaction amount or currency mismatch." },
          { status: 400 },
        );
      }
    }

    const nextPaymentStatus =
      isSuccess && !isPending ? "paid" : isPending ? "pending" : "failed";

    const updatePayload: Record<string, unknown> = {
      payment_status: nextPaymentStatus,
    };
    if (obj.id !== undefined && obj.id !== null) {
      updatePayload.payment_transaction_id = String(obj.id);
    }
    if (paymobOrderId) {
      updatePayload.paymob_order_id = paymobOrderId;
    }

    const { error: updateErr } = await db
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id)
      .eq("store_id", order.store_id)
      .neq("payment_status", "paid");

    if (updateErr) {
      return Response.json(
        { error: "Failed to record payment status." },
        { status: 500 },
      );
    }

    return Response.json(
      { ok: true, order_id: order.id, payment_status: nextPaymentStatus },
      { status: 200 },
    );
  } catch (err) {
    console.error("Paymob webhook error", {
      code: err instanceof Error ? err.message : "unknown",
    });
    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
