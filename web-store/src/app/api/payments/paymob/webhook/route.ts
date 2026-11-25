import { adminDb } from "@/lib/supabase/admin";
import { notifyPaymentOutcome } from "@/lib/notifications/events";
import {
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
  status: string;
  total: number;
  currency: string;
  payment_status: string;
};

type PaymentAttemptRow = {
  order_id: string;
  store_id: string;
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
    return Response.json(
      { error: "Missing transaction object." },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const receivedHmac =
    (typeof payload.hmac === "string" && payload.hmac.trim()) ||
    url.searchParams.get("hmac")?.trim() ||
    "";

  if (!receivedHmac) {
    return Response.json({ error: "Missing HMAC signature." }, { status: 401 });
  }

  const paymobOrderId =
    obj.order?.id !== undefined && obj.order?.id !== null
      ? String(obj.order.id).trim()
      : "";

  if (!paymobOrderId) {
    return Response.json({ error: "Missing Paymob order id." }, { status: 400 });
  }

  try {
    const db = adminDb();

    // Resolve strictly via signed paymob_order_id (NEVER via unsigned merchant_order_id)
    let order: OrderLookupRow | null = null;

    const { data: attempt } = await db
      .from("payment_attempts")
      .select("order_id,store_id")
      .eq("paymob_order_id", paymobOrderId)
      .maybeSingle<PaymentAttemptRow>();

    if (attempt) {
      const { data } = await db
        .from("orders")
        .select("id,store_id,status,total,currency,payment_status")
        .eq("id", attempt.order_id)
        .eq("store_id", attempt.store_id)
        .maybeSingle<OrderLookupRow>();
      order = data;
    }

    if (!order) {
      const { data } = await db
        .from("orders")
        .select("id,store_id,status,total,currency,payment_status")
        .eq("paymob_order_id", paymobOrderId)
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
    if (
      !hmacSecret ||
      !verifyPaymobTransactionHmac(obj, receivedHmac, hmacSecret)
    ) {
      return Response.json({ error: "Invalid HMAC signature." }, { status: 401 });
    }

    // Idempotency: already paid orders are acknowledged without re-processing
    if (order.payment_status === "paid") {
      return Response.json({ ok: true, idempotent: true }, { status: 200 });
    }

    if (order.status === "cancelled") {
      return Response.json(
        { error: "Order is cancelled." },
        { status: 409 },
      );
    }

    const isSuccess = isTruthyFlag(obj.success);
    const isPending = isTruthyFlag(obj.pending);
    const isVoided = isTruthyFlag(obj.is_voided);
    const isRefunded = isTruthyFlag(obj.is_refunded);
    const isErrorOccured = isTruthyFlag(obj.error_occured);

    const expectedCurrency = (order.currency || "EGP").trim().toUpperCase();
    const txCurrency = String(obj.currency ?? "").trim().toUpperCase();
    const expectedAmountCents = Math.round(Number(order.total) * 100);
    const receivedAmountCents = Number(obj.amount_cents);
    const transactionId =
      obj.id !== undefined && obj.id !== null ? String(obj.id).trim() : null;

    const cleanSuccess =
      isSuccess &&
      !isPending &&
      !isVoided &&
      !isRefunded &&
      !isErrorOccured;

    // Anti-tampering check on currency & exact amount_cents before marking paid
    if (cleanSuccess) {
      if (
        txCurrency !== expectedCurrency ||
        !Number.isFinite(receivedAmountCents) ||
        receivedAmountCents !== expectedAmountCents
      ) {
        return Response.json(
          { error: "Transaction amount or currency mismatch." },
          { status: 400 },
        );
      }
    }

    // Prevent reusing a transaction_id already recorded on another order in this store
    if (transactionId) {
      const { data: dupTx } = await db
        .from("orders")
        .select("id")
        .eq("store_id", order.store_id)
        .eq("payment_transaction_id", transactionId)
        .neq("id", order.id)
        .maybeSingle<{ id: string }>();
      if (dupTx) {
        return Response.json(
          { error: "Transaction already consumed by another order." },
          { status: 409 },
        );
      }
    }

    const nextPaymentStatus = cleanSuccess
      ? "paid"
      : isPending && !isVoided && !isRefunded && !isErrorOccured
        ? "pending"
        : "failed";

    const updatePayload: Record<string, unknown> = {
      payment_status: nextPaymentStatus,
      paymob_order_id: paymobOrderId,
    };
    if (transactionId) {
      updatePayload.payment_transaction_id = transactionId;
    }

    const { error: updateErr } = await db
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id)
      .eq("store_id", order.store_id)
      .neq("payment_status", "paid")
      .neq("status", "cancelled");

    if (updateErr) {
      if (updateErr.code === "23505") {
        return Response.json(
          { error: "Transaction already consumed by another order." },
          { status: 409 },
        );
      }
      return Response.json(
        { error: "Failed to record payment status." },
        { status: 500 },
      );
    }

    if (nextPaymentStatus === "paid" || nextPaymentStatus === "failed") {
      void notifyPaymentOutcome(order.id, nextPaymentStatus);
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
