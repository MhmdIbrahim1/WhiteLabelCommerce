import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { verifyPaymobQueryHmac } from "@/lib/paymob";

type OrderCallbackRow = {
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const paymobOrderId = params.get("order")?.trim() ?? "";

  let order: OrderCallbackRow | null = null;
  let hmacVerified = false;

  try {
    const db = adminDb();

    // Resolve strictly via signed paymob_order_id (NEVER via unsigned merchant_order_id)
    if (paymobOrderId) {
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
          .maybeSingle<OrderCallbackRow>();
        order = data;
      }

      if (!order) {
        const { data } = await db
          .from("orders")
          .select("id,store_id,status,total,currency,payment_status")
          .eq("paymob_order_id", paymobOrderId)
          .maybeSingle<OrderCallbackRow>();
        order = data;
      }
    }

    if (order && params.get("hmac")) {
      const { data: secrets } = await db
        .from("store_payment_secrets")
        .select("paymob_hmac_secret")
        .eq("store_id", order.store_id)
        .maybeSingle<{ paymob_hmac_secret: string | null }>();
      const hmacSecret = secrets?.paymob_hmac_secret?.trim() ?? "";
      if (hmacSecret) {
        hmacVerified = verifyPaymobQueryHmac(params, hmacSecret);
      }
    }

    // Only persist payment_status when the 20-field Paymob HMAC-SHA512 signature is
    // cryptographically verified, transaction is not voided/refunded/errored,
    // and amount/currency match the DB order exactly.
    if (
      order &&
      hmacVerified &&
      order.payment_status !== "paid" &&
      order.status !== "cancelled"
    ) {
      const expectedCurrency = (order.currency || "EGP").trim().toUpperCase();
      const currency = (params.get("currency") ?? "").trim().toUpperCase();
      const amountCents = Number(params.get("amount_cents"));
      const expectedCents = Math.round(Number(order.total) * 100);
      const successRaw = (params.get("success") ?? "").trim().toLowerCase();
      const isSuccess = successRaw === "true";
      const isExplicitFailure = successRaw === "false";
      const isPending =
        (params.get("pending") ?? "").trim().toLowerCase() === "true";
      const isVoided =
        (params.get("is_voided") ?? "").trim().toLowerCase() === "true";
      const isRefunded =
        (params.get("is_refunded") ?? "").trim().toLowerCase() === "true";
      const isErrorOccured =
        (params.get("error_occured") ?? "").trim().toLowerCase() === "true";
      const transactionId = params.get("id")?.trim() || null;

      let txAlreadyUsed = false;
      if (transactionId) {
        const { data: dupTx } = await db
          .from("orders")
          .select("id")
          .eq("store_id", order.store_id)
          .eq("payment_transaction_id", transactionId)
          .neq("id", order.id)
          .maybeSingle<{ id: string }>();
        txAlreadyUsed = Boolean(dupTx);
      }

      if (
        !txAlreadyUsed &&
        currency === expectedCurrency &&
        Number.isFinite(amountCents) &&
        amountCents === expectedCents
      ) {
        if (
          isSuccess &&
          !isPending &&
          !isVoided &&
          !isRefunded &&
          !isErrorOccured
        ) {
          const { error: updateErr } = await db
            .from("orders")
            .update({
              payment_status: "paid",
              payment_transaction_id: transactionId,
              paymob_order_id: paymobOrderId,
            })
            .eq("id", order.id)
            .eq("store_id", order.store_id)
            .neq("payment_status", "paid")
            .neq("status", "cancelled");
          if (!updateErr) {
            order = { ...order, payment_status: "paid" };
          }
        } else if (
          (isExplicitFailure || isVoided || isRefunded || isErrorOccured) &&
          !isPending &&
          order.payment_status === "pending"
        ) {
          const { error: updateErr } = await db
            .from("orders")
            .update({
              payment_status: "failed",
              payment_transaction_id: transactionId,
              paymob_order_id: paymobOrderId,
            })
            .eq("id", order.id)
            .eq("store_id", order.store_id)
            .neq("payment_status", "paid")
            .neq("status", "cancelled");
          if (!updateErr) {
            order = { ...order, payment_status: "failed" };
          }
        }
      }
    }
  } catch {
    // Fall through to safe internal redirect without exposing errors
  }

  // Never trust unverified query parameters to mark an order paid.
  let paymentOutcome: "success" | "pending" | "failed" = "pending";
  if (order?.payment_status === "paid") {
    paymentOutcome = "success";
  } else if (order?.payment_status === "failed") {
    paymentOutcome = "failed";
  } else if (hmacVerified) {
    const successRaw = (params.get("success") ?? "").trim().toLowerCase();
    const isPending =
      (params.get("pending") ?? "").trim().toLowerCase() === "true";
    const isVoided =
      (params.get("is_voided") ?? "").trim().toLowerCase() === "true";
    const isRefunded =
      (params.get("is_refunded") ?? "").trim().toLowerCase() === "true";
    const isErrorOccured =
      (params.get("error_occured") ?? "").trim().toLowerCase() === "true";
    if (
      successRaw === "false" ||
      isVoided ||
      isRefunded ||
      isErrorOccured
    ) {
      paymentOutcome = "failed";
    } else if (isPending) {
      paymentOutcome = "pending";
    }
  }

  const safePath = order
    ? `/orders?payment=${paymentOutcome}&order=${encodeURIComponent(order.id)}`
    : `/orders?payment=${paymentOutcome}`;

  return NextResponse.redirect(new URL(safePath, url.origin), 302);
}
