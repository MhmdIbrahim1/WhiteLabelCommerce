import { walletPhonePattern } from "./order-payment";

export type InitiationState = "redirect" | "pending" | "processing" | "failed" | "unavailable";
export async function startOrderPayment(basePath: string, id: string, method: "card" | "wallet", wallet: string, phone?: string | null): Promise<InitiationState> {
  if (method === "wallet" && !walletPhonePattern.test(wallet)) return "failed";
  try {
    const res = await fetch(basePath + "/api/payments/paymob/initiate", {
      method: "POST", cache: "no-store",
      signal: AbortSignal.timeout(40000), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id, method, wallet_phone: method === "wallet" ? wallet : undefined, customer_phone: phone || undefined })
    });
    const data = await res.json();
    if (res.ok && typeof data.redirect_url === "string") {
      const url = new URL(data.redirect_url);
      if (url.protocol !== "https:" || url.username || url.password) return "unavailable";
      window.location.assign(url.href);
      return "redirect";
    }
    if (res.ok && data.state === "processing") return "processing";
    if (res.ok && (data.state === "pending" || data.pending_wallet_prompt === true)) return "pending";
    return data.state === "failed" ? "failed" : "unavailable";
  } catch { return "unavailable"; }
}

export async function paymentDeadline<T>(request: Promise<T>, milliseconds = 40000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Payment request timed out")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
