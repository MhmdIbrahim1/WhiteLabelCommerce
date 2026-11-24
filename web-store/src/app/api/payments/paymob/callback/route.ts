import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import {
  extractOrderUuidFromMerchantOrderId,
  verifyPaymobQueryHmac,
} from "@/lib/paymob";

type OrderCallbackRow = {
  id: string;
  store_id: string;
  total: number;
  currency: string;
  payment_status: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const paymobOrderId = params.get("order")?.trim() ?? "";
  const merchantOrderId = params.get("merchant_order_id")?.trim() ?? "";
  const merchantUuid = extractOrderUuidFromMerchantOrderId(merchantOrderId);

  let order: OrderCallbackRow | null = null;
  let hmacVerified = false;

  try {
    const db = adminDb();
    if (paymobOrderId) {
      const { data } = await db
        .from("orders")
        .select("id,store_id,total,currency,payment_status")
        .eq("paymob_order_id", paymobOrderId)
        .maybeSingle<OrderCallbackRow>();
      order = data;
    }
    if (!order && merchantUuid) {
      const { data } = await db
        .from("orders")
        .select("id,store_id,total,currency,payment_status")
        .eq("id", merchantUuid)
        .maybeSingle<OrderCallbackRow>();
      order = data;
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
    // cryptographically verified and amount/currency match the DB order exactly.
    if (order && hmacVerified && order.payment_status !== "paid") {
      const currency = (params.get("currency") ?? "").trim().toUpperCase();
      const amountCents = Number(params.get("amount_cents"));
      const expectedCents = Math.round(Number(order.total) * 100);
      const successRaw = (params.get("success") ?? "").trim().toLowerCase();
      const isSuccess = successRaw === "true";
      const isExplicitFailure = successRaw === "false";
      const isPending = (params.get("pending") ?? "").trim().toLowerCase() === "true";
      const transactionId = params.get("id")?.trim() || null;

      if (
        currency === "EGP" &&
        Number.isFinite(amountCents) &&
        amountCents === expectedCents
      ) {
        if (isSuccess && !isPending) {
          const { error: updateErr } = await db
            .from("orders")
            .update({
              payment_status: "paid",
              payment_transaction_id: transactionId,
            })
            .eq("id", order.id)
            .eq("store_id", order.store_id);
          if (!updateErr) {
            order = { ...order, payment_status: "paid" };
          }
        } else if (isExplicitFailure && !isPending && order.payment_status === "pending") {
          const { error: updateErr } = await db
            .from("orders")
            .update({
              payment_status: "failed",
              payment_transaction_id: transactionId,
            })
            .eq("id", order.id)
            .eq("store_id", order.store_id);
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
  } else if (hmacVerified) {
    const successRaw = (params.get("success") ?? "").trim().toLowerCase();
    const isPending = (params.get("pending") ?? "").trim().toLowerCase() === "true";
    if (successRaw === "true" && !isPending) {
      paymentOutcome = "success";
    } else if (successRaw === "false" && !isPending) {
      paymentOutcome = "failed";
    } else {
      paymentOutcome = "pending";
    }
  } else if (order?.payment_status === "failed") {
    paymentOutcome = "failed";
  }

  const safePath = order
    ? `/orders?payment=${paymentOutcome}&order=${encodeURIComponent(order.id)}`
    : `/orders?payment=${paymentOutcome}`;

  return NextResponse.redirect(new URL(safePath, url.origin), 302);
}
