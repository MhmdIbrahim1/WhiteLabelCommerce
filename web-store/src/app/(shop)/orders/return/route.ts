import { verifyOrderProof } from "@/lib/order-proof";
import { paymentOutcome } from "@/lib/order-payment";
import { rememberCheckout, currentReceipt } from "@/lib/order-receipt";
import { resolveActiveStoreOrDefault, storeHref } from "@/lib/tenant";

export async function GET(req: Request) {
  const store = await resolveActiveStoreOrDefault();
  const q = new URL(req.url).searchParams;
  const id = q.get("order") ?? "";
  let location = "/api/payments/paymob/return-error";
  if (verifyOrderProof("return", store.id, id, q.get("proof") ?? "")) {
    await rememberCheckout(store.id, id, true);
    const receipt = await currentReceipt(store.id, id);
    if (receipt) location = storeHref(store.basePath, "/orders?" + new URLSearchParams({ order: id, payment: paymentOutcome(receipt.payment_status) }));
  }
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
