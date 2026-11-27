import { reconcilePaymob, queryTransaction } from "@/lib/paymob-reconciliation";
import { paymentStorefrontUrl } from "@/lib/host-routing";
import { resolveHostRoute } from "@/lib/host-resolver";
import { PLATFORM_ORIGIN_HEADER } from "@/lib/tenant-shared";
import { signOrderProof } from "@/lib/order-proof";
import { paymentOutcome } from "@/lib/order-payment";

const redirect = (location: string) => new Response(null, {
  status: 303, headers: {
    Location: location, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  }
});

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    const tx = queryTransaction(params);
    const result = await reconcilePaymob(tx, params.get("hmac") ?? "");
    if (result) {
      const { order } = result;
      const base = await paymentStorefrontUrl(order.store_id, result.slug, result.base, req.headers.get(PLATFORM_ORIGIN_HEADER), resolveHostRoute);
      if (base) {
        const query = new URLSearchParams({ order: order.id, payment: paymentOutcome(result.status) });
        const signedTime = Date.parse(tx.created_at ?? "");
        if (order.guest_tracking && !order.user_id && Math.abs(Date.now() - signedTime) < 86400000) {
          query.set("proof", signOrderProof("return", order.store_id, order.id));
          return redirect(base + "/orders/return?" + query);
        }
        return redirect(base + "/orders?" + query);
      }
    }
  } catch { /* Return the same response for all unresolved or unverifiable transactions. */ }
  return redirect("/api/payments/paymob/return-error");
}
