import { queryTransaction } from "@/lib/paymob";
import { billingPaymentLocation, reconcileSubscriptionPayment } from "@/lib/subscription-paymob";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const result = await reconcileSubscriptionPayment(queryTransaction(query), query.get("hmac") ?? "").catch(() => null);
  return new Response(null, { status: 303, headers: {
    Location: billingPaymentLocation(result?.outcome ?? "unverified", result?.invoiceId),
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  } });
}
