import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { loadSource } from "./helpers/load-source.mjs";
import * as paymob from "../src/lib/paymob.ts";
import * as billing from "../src/lib/billing.ts";
import * as tenant from "../src/lib/tenant-shared.ts";

const invoice = randomUUID();
const attempt = randomUUID();
const store = randomUUID();
const key = "unit-fixture";
const paymentOrigin = "https://billing.example";
const ok = data => ({ data, error: null });
function table(row) {
  return { select() { return this; }, eq() { return this; }, single: () => ok(row), maybeSingle: () => ok(row) };
}
function signed(overrides = {}) {
  const fields = { amount_cents: "2000", created_at: "2026-11-27T12:00:00Z", currency: "EGP", error_occured: "false",
    has_parent_transaction: "false", id: "2401", integration_id: "905", is_3d_secure: "true", is_auth: "false", is_capture: "false",
    is_refunded: "false", is_standalone_payment: "true", is_voided: "false", order: "5001", owner: "55", pending: "false",
    "source_data.pan": "0000", "source_data.sub_type": "Visa", "source_data.type": "card", success: "true", ...overrides };
  return new URLSearchParams({ ...fields, hmac: createHmac("sha512", key).update(Object.values(fields).join("")).digest("hex") });
}
function reconciliation() {
  const calls = [];
  const db = {
    from(name) { assert.equal(name, "platform_billing_secrets"); return table({ paymob_hmac_secret: key }); },
    rpc(name, args) {
      assert.equal(name, "reconcile_subscription_paymob");
      calls.push(args);
      if (args.p_amount_cents !== 2000 || args.p_paymob_order_id !== "5001") return { data: null, error: { code: "PT400" } };
      const status = args.p_voided ? "voided" : args.p_refunded ? "refunded" : args.p_pending ? "pending" : args.p_success ? "paid" : "failed";
      return ok({ invoice_id: invoice, status });
    },
  };
  const service = loadSource("lib/subscription-paymob.ts", { "./paymob": paymob, "./supabase/admin": { adminDb: () => db } });
  const shared = { "@/lib/paymob": paymob, "@/lib/subscription-paymob": service };
  const { POST } = loadSource("app/api/billing/paymob/webhook/route.ts", shared);
  const { GET } = loadSource("app/api/billing/paymob/callback/route.ts", shared);
  const post = params => POST(new Request(paymentOrigin + "/api/billing/paymob/webhook", { method: "POST", body: JSON.stringify({
    obj: { ...paymob.queryTransaction(params), unrelated: "discard" }, hmac: params.get("hmac"),
  }) }));
  const get = params => GET(new Request(paymentOrigin + "/api/billing/paymob/callback?" + params));
  return { calls, get, post, service };
}

test("both billing endpoints authenticate the same Paymob fields and reconcile authoritative ledger outcomes", async () => {
  const { get, post, calls } = reconciliation();
  for (const [fields, status, outcome] of [[{}, "paid", "success"], [{ is_auth: "true" }, "pending", "pending"],
    [{ success: "false" }, "failed", "failed"], [{ is_refunded: "true" }, "refunded", "failed"], [{ is_voided: "true" }, "voided", "failed"]]) {
    const params = signed(fields);
    assert.deepEqual(await (await post(params)).json(), { ok: true, invoiceId: invoice, status });
    const callback = await get(params);
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/admin/billing?payment=" + outcome + "&invoice=" + invoice);
    assert.deepEqual(calls.at(-1), calls.at(-2));
    assert.equal(calls.at(-1).p_payload.event, status);
    assert.equal("unrelated" in calls.at(-1).p_payload, false);
    assert.equal("source_data" in calls.at(-1).p_payload, false);
  }
});

test("unverified, unsupported and mismatched billing notifications cannot activate or disclose an invoice", async () => {
  const { post, get, calls } = reconciliation();
  const tampered = signed();
  tampered.set("id", "999");
  const extraHex = signed();
  extraHex.set("hmac", extraHex.get("hmac") + "f");
  assert.equal(paymob.verifyPaymobQueryHmac(extraHex, key), false);
  for (const params of [new URLSearchParams(), tampered, extraHex, signed({ amount_cents: "1e3" }), signed({ currency: "USD" }),
    signed({ success: "invalid" }), signed({ amount_cents: "2147483648" }), signed({ amount_cents: "1900" }), signed({ order: "5002" })]) {
    assert.equal((await post(params)).status, 401);
    const response = await get(params);
    assert.equal(response.headers.get("location"), "/admin/billing?payment=unverified");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(calls.length, 4);
});

function initiation({ reserved = {}, bound = true, walletResult } = {}) {
  const calls = [];
  const db = {
    from(name) {
      if (name === "platform_billing_settings") return table({ paymob_enabled: true, paymob_wallet_enabled: true, paymob_card_enabled: true });
      assert.equal(name, "platform_billing_secrets");
      return table({ paymob_api_key: "fixture", paymob_hmac_secret: key, paymob_card_iframe_id: "9",
        paymob_card_integration_id: "10", paymob_wallet_integration_id: "11" });
    },
    rpc(name, args) {
      calls.push([name, args]);
      if (name === "reserve_subscription_paymob") return ok({ invoice_id: invoice, attempt_id: attempt, status: "reserved",
        amount_cents: 2000, created: true, expires_at: new Date(Date.now() + 900000).toISOString(), ...reserved });
      return ok(name === "bind_subscription_paymob" ? bound : true);
    },
  };
  const authenticated = [];
  const { POST } = loadSource("app/api/billing/paymob/initiate/route.ts", {
    "@/lib/billing": billing, "@/lib/password-policy": loadSource("lib/password-policy.ts", { "./tenant-shared": tenant }),
    "@/lib/db": { requireAdmin: permission => { authenticated.push(permission); return { storeId: store, user: { id: "merchant" } }; } },
    "@/lib/subscription-paymob": reconciliation().service, "@/lib/supabase/admin": { adminDb: () => db },
    "@/lib/paymob": { ...paymob, authenticatePaymob: () => { calls.push(["authenticate"]); return "token"; },
      registerPaymobOrder: input => { calls.push(["register", input]); return "5001"; },
      requestPaymobPaymentKey: input => { calls.push(["payment_key", input]); return "payment"; },
      payPaymobWallet: async () => { calls.push(["wallet"]); return walletResult(); } },
  });
  function send(input = {}, origin = paymentOrigin) {
    const headers = origin === null ? {} : { origin };
    return POST(new Request(paymentOrigin + "/api/billing/paymob/initiate", { method: "POST", headers,
      body: JSON.stringify({ planCode: "business", billingCycle: "annual", paymentMethod: "paymob_card",
        idempotencyKey: "test-attempt", storeId: store, ...input }) }));
  }
  return { send, calls, authenticated };
}

test("billing initiation checks origin, input and active store before provider access", async () => {
  const { send, calls, authenticated } = initiation();
  for (const origin of [null, "https://elsewhere.example"]) assert.equal((await send({}, origin)).status, 403);
  for (const input of [{ planCode: "unknown" }, { billingCycle: "weekly" }, { idempotencyKey: "x" },
    { expectedAmountEGP: -1 }, { paymentMethod: "paymob_wallet", walletPhone: "01823456789" }]) assert.equal((await send(input)).status, 400);
  assert.equal((await send({ storeId: randomUUID() })).status, 409);
  assert.deepEqual(authenticated, ["manage_billing"]);
  assert.deepEqual(calls, []);
});

test("billing card checkout binds first, uses the invoice price, and reuses an existing checkout", async () => {
  const { send, calls } = initiation();
  const response = await (await send({ amount: 1, expectedAmountEGP: 20 })).json();
  assert.equal(response.invoiceId, invoice);
  assert.match(response.iframeUrl, /iframes\/9\?payment_token=payment$/);
  assert.deepEqual(calls.map(([name]) => name), ["reserve_subscription_paymob", "authenticate", "register", "bind_subscription_paymob", "payment_key", "billing_paymob_checkout_ready"]);
  assert.equal(calls[2][1].amountCents, 2000);
  assert.equal(calls[0][1].p_expected_amount, 20);
  const retry = initiation({ reserved: { created: false, status: "initiated", checkout_url: response.iframeUrl } });
  assert.deepEqual(await (await retry.send()).json(), response);
  assert.equal(retry.calls.length, 1);
  const failed = initiation({ bound: false });
  assert.equal((await failed.send()).status, 502);
  assert.equal(failed.calls.at(-1)[0], "fail_subscription_paymob");
  assert.ok(!failed.calls.some(([name]) => name === "payment_key"));
});

test("billing wallet attempts preserve ambiguous charges and close explicit declines", async () => {
  const method = { paymentMethod: "paymob_wallet", walletPhone: "01123456789" };
  for (const outcome of [() => ({ state: "prompt" }), () => { throw new Error("Provider timeout"); }]) {
    const pending = initiation({ walletResult: outcome });
    const res = await pending.send(method);
    assert.equal(res.status, 202);
    assert.equal((await res.json()).redirectUrl, "/admin/billing?payment=pending&invoice=" + invoice);
    assert.equal(pending.calls.at(-1)[0], "wallet");
  }
  const failed = initiation({ walletResult: () => ({ state: "failed" }) });
  assert.equal((await failed.send(method)).status, 502);
  assert.equal(failed.calls.at(-1)[0], "fail_subscription_paymob");
});

test("receipt links sign the merchant upload layout only after a scoped invoice lookup", async () => {
  const object = store + "/" + randomUUID() + "/" + "e".repeat(64) + ".webp";
  const signed = [];
  let row;
  const { GET } = loadSource("app/api/admin/billing/receipts/[invoice]/route.ts", {
    "@/lib/paymob": paymob,
    "@/lib/db": { serverDb: async () => ({ from: name => { assert.equal(name, "subscription_invoices"); return table(row); } }) },
    "@/lib/supabase/admin": { adminDb: () => ({ storage: { from(name) {
      assert.equal(name, "billing-receipts");
      return { createSignedUrl(path, expiry) { signed.push([path, expiry]); return ok({ signedUrl: "https://storage.example/temporary" }); } };
    } } }) },
  });
  const get = () => GET(new Request(paymentOrigin), { params: Promise.resolve({ invoice }) });
  for (const path of [null, randomUUID() + "/" + object, store + "/../bad.png", object + ".html"]) {
    row = path ? { store_id: store, receipt_path: path } : null;
    assert.equal((await get()).status, 404);
  }
  row = { store_id: store, receipt_path: object };
  const response = await get();
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(signed, [[object, 120]]);
});
