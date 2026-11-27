import { createHmac, timingSafeEqual } from "node:crypto";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EGYPT_WALLET_PHONE_RE = /^01[0125][0-9]{8}$/;

const PAYMOB_BASE_URL = "https://accept.paymob.com/api";

function toPaymobScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function safeHexEqual(aHex: string, bHex: string): boolean {
  const cleanA = aHex.trim().toLowerCase();
  const cleanB = bHex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(cleanA) || !/^[0-9a-f]+$/.test(cleanB)) {
    return false;
  }
  if (cleanA.length !== cleanB.length) return false;
  const bufA = Buffer.from(cleanA, "hex");
  const bufB = Buffer.from(cleanB, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type PaymobTransactionObj = {
  amount_cents?: number | string;
  created_at?: string;
  currency?: string;
  error_occured?: boolean | string;
  has_parent_transaction?: boolean | string;
  id?: number | string;
  integration_id?: number | string;
  is_3d_secure?: boolean | string;
  is_auth?: boolean | string;
  is_capture?: boolean | string;
  is_refunded?: boolean | string;
  is_standalone_payment?: boolean | string;
  is_voided?: boolean | string;
  order?: {
    id?: number | string;
    merchant_order_id?: string | null;
  };
  owner?: number | string;
  pending?: boolean | string;
  source_data?: {
    pan?: string | number | null;
    sub_type?: string | null;
    type?: string | null;
  };
  success?: boolean | string;
};

/**
 * Verifies Paymob Transaction Processed POST Webhook HMAC-SHA512 using the exact
 * 20 alphabetically sorted fields and constant-time comparison.
 */
export function verifyPaymobTransactionHmac(
  obj: PaymobTransactionObj,
  receivedHmac: string,
  hmacSecret: string,
): boolean {
  if (!receivedHmac || !hmacSecret) return false;
  const concatenated = [
    toPaymobScalar(obj.amount_cents),
    toPaymobScalar(obj.created_at),
    toPaymobScalar(obj.currency),
    toPaymobScalar(obj.error_occured),
    toPaymobScalar(obj.has_parent_transaction),
    toPaymobScalar(obj.id),
    toPaymobScalar(obj.integration_id),
    toPaymobScalar(obj.is_3d_secure),
    toPaymobScalar(obj.is_auth),
    toPaymobScalar(obj.is_capture),
    toPaymobScalar(obj.is_refunded),
    toPaymobScalar(obj.is_standalone_payment),
    toPaymobScalar(obj.is_voided),
    toPaymobScalar(obj.order?.id),
    toPaymobScalar(obj.owner),
    toPaymobScalar(obj.pending),
    toPaymobScalar(obj.source_data?.pan),
    toPaymobScalar(obj.source_data?.sub_type),
    toPaymobScalar(obj.source_data?.type),
    toPaymobScalar(obj.success),
  ].join("");

  const expected = createHmac("sha512", hmacSecret)
    .update(concatenated)
    .digest("hex");

  return safeHexEqual(expected, receivedHmac);
}

/**
 * Verifies Paymob GET Redirect Callback query string HMAC-SHA512 using the exact
 * 20 alphabetically sorted query parameter keys and constant-time comparison.
 */
export function verifyPaymobQueryHmac(
  params: URLSearchParams,
  hmacSecret: string,
): boolean {
  const receivedHmac = params.get("hmac") ?? "";
  if (!receivedHmac || !hmacSecret) return false;

  const keys = [
    "amount_cents",
    "created_at",
    "currency",
    "error_occured",
    "has_parent_transaction",
    "id",
    "integration_id",
    "is_3d_secure",
    "is_auth",
    "is_capture",
    "is_refunded",
    "is_standalone_payment",
    "is_voided",
    "order",
    "owner",
    "pending",
    "source_data.pan",
    "source_data.sub_type",
    "source_data.type",
    "success",
  ];

  const concatenated = keys.map((k) => params.get(k) ?? "").join("");
  const expected = createHmac("sha512", hmacSecret)
    .update(concatenated)
    .digest("hex");

  return safeHexEqual(expected, receivedHmac);
}

export function extractOrderUuidFromMerchantOrderId(
  merchantOrderId?: string | null,
): string | null {
  if (!merchantOrderId) return null;
  const candidate = merchantOrderId.split("__")[0]?.trim() ?? "";
  return UUID_RE.test(candidate) ? candidate : null;
}

export function formatPaymobPhone(rawPhone?: string | null): string {
  const digits = (rawPhone ?? "").replace(/\D+/g, "");
  if (/^01[0125][0-9]{8}$/.test(digits)) return `+2${digits}`;
  if (/^201[0125][0-9]{8}$/.test(digits)) return `+${digits}`;
  if (digits.length >= 8) return `+${digits}`;
  return "+201000000000";
}

export function splitBillingName(fullName?: string | null): {
  firstName: string;
  lastName: string;
} {
  const clean = (fullName ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "Store", lastName: "Customer" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export async function authenticatePaymob(apiKey: string): Promise<string> {
  const res = await fetch(`${PAYMOB_BASE_URL}/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) {
    throw new Error("paymob_auth_failed");
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new Error("paymob_auth_failed");
  }
  return data.token;
}

export async function registerPaymobOrder(params: {
  authToken: string;
  amountCents: number;
  merchantOrderId: string;
  currency?: string;
}): Promise<string> {
  const res = await fetch(`${PAYMOB_BASE_URL}/ecommerce/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: params.authToken,
      delivery_needed: "false",
      amount_cents: String(params.amountCents),
      currency: params.currency ?? "EGP",
      merchant_order_id: params.merchantOrderId,
      items: [],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) {
    // A registration response can be lost. Only recover a provider mapping with the
    // same merchant reference, currency and amount from the authenticated inquiry.
    const inquiry = await fetch(`${PAYMOB_BASE_URL}/ecommerce/orders/transaction_inquiry`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(7000),
      body: JSON.stringify({ auth_token: params.authToken, merchant_order_id: params.merchantOrderId }),
    });
    const existing = inquiry.ok ? (await inquiry.json()).order : null;
    if (existing?.merchant_order_id === params.merchantOrderId && Number(existing.amount_cents) === params.amountCents &&
      existing.currency === (params.currency ?? "EGP") && /^\d{1,30}$/.test(String(existing.id))) return String(existing.id);
    throw new Error("paymob_order_failed");
  }
  const data = (await res.json()) as { id?: number | string };
  if (!/^\d{1,30}$/.test(String(data.id ?? ""))) {
    throw new Error("paymob_order_failed");
  }
  return String(data.id);
}

export async function requestPaymobPaymentKey(params: {
  authToken: string;
  amountCents: number;
  paymobOrderId: string;
  integrationId: string;
  expiration?: number;
  currency?: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  shippingAddress?: string | null;
}): Promise<string> {
  const { firstName, lastName } = splitBillingName(params.customerName);
  const email =
    params.customerEmail && params.customerEmail.includes("@")
      ? params.customerEmail.trim()
      : "customer@novastore.local";
  const street = (params.shippingAddress ?? "").trim().slice(0, 120) || "NA";

  const res = await fetch(`${PAYMOB_BASE_URL}/acceptance/payment_keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: params.authToken,
      amount_cents: String(params.amountCents),
      expiration: Math.max(1, Math.min(900, params.expiration ?? 900)),
      order_id: params.paymobOrderId,
      currency: params.currency ?? "EGP",
      integration_id: Number(params.integrationId),
      lock_order_when_paid: "true",
      billing_data: {
        apartment: "NA",
        email,
        floor: "NA",
        first_name: firstName,
        street,
        building: "NA",
        phone_number: formatPaymobPhone(params.customerPhone),
        shipping_method: "NA",
        postal_code: "NA",
        city: "Cairo",
        country: "EG",
        last_name: lastName,
        state: "Cairo",
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) {
    throw new Error("paymob_payment_key_failed");
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new Error("paymob_payment_key_failed");
  }
  return data.token;
}

export async function payPaymobWallet(params: {
  paymentToken: string;
  walletPhone: string;
}) {
  if (!EGYPT_WALLET_PHONE_RE.test(params.walletPhone)) throw new Error("invalid_wallet_phone");
  const res = await fetch(`${PAYMOB_BASE_URL}/acceptance/payments/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: {
        identifier: params.walletPhone,
        subtype: "WALLET",
      },
      payment_token: params.paymentToken,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok && (res.status >= 500 || res.status === 429 || res.status === 408)) throw new Error("wallet_result_unknown");
  if (!res.ok) return { state: "failed" as const };
  const data = await res.json();
  if (data.pending !== true && data.pending !== "true" && (data.success === false || data.success === "false")) {
    return { state: "failed" as const };
  }
  const redirect = data.redirect_url || data.iframe_redirection_url || data.redirection_url;
  if (typeof redirect === "string" && URL.canParse(redirect)) {
    const url = new URL(redirect);
    if (url.protocol === "https:" && !url.username && !url.password) return { state: "ready" as const, url: url.href };
  }
  if (data.pending === true || data.pending === "true" || data.success === true || data.success === "true") {
    return { state: "prompt" as const };
  }
  if (data.pending === false || data.pending === "false") return { state: "failed" as const };
  throw new Error("wallet_result_unknown");
}
