import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./helpers/load-source.mjs";
import * as billing from "../src/lib/billing.ts";
import * as checkout from "../src/lib/billing-checkout.ts";
import * as security from "../src/lib/security.ts";
import { billingEligibility, downgradeImpact, parseManualTransfer, paymentChannels, receiptLimit } from "../src/lib/billing-checkout.ts";

const starter = { code: "starter", monthly_price_egp: 0, annual_price_egp: 0, trial_days: 0, is_active: true,
  max_products: 10, max_staff_members: 1, custom_domains_enabled: false };
const pro = { ...starter, code: "pro", monthly_price_egp: 500, annual_price_egp: 5000, trial_days: 14, max_products: null, custom_domains_enabled: true };
const bill = { plan: starter, status: "active", billing_cycle: "monthly", can_start_trial: true, trial_used_at: null,
  products: 11, staff_members: 2, custom_domains: 1, quota_overrides: {} };

test("higher plans offer checkout and only one eligible trial across cycles", () => {
  for (const cycle of ["annual", "monthly"]) {
    const options = billingEligibility(bill, pro, cycle);
    assert.equal(options.trial, true);
    assert.equal(options.checkout, true);
    assert.equal(options.downgrade, false);
    for (const change of [{ trial_used_at: "2026-11-27" }, { can_start_trial: false }]) {
      assert.equal(billingEligibility({ ...bill, ...change }, pro, cycle).trial, false);
    }
    assert.equal(billingEligibility(bill, { ...pro, trial_days: 0 }, cycle).trial, false);
    assert.equal(billingEligibility(bill, { ...pro, is_active: false }, cycle).checkout, false);
  }
});
test("same-plan trial conversion and discounted monthly to annual switch stay actionable", () => {
  const paid = { ...bill, plan: pro };
  assert.equal(billingEligibility(paid, pro, "monthly").checkout, false);
  assert.equal(billingEligibility({ ...paid, status: "trialing" }, pro, "monthly").checkout, true);
  assert.equal(billingEligibility(paid, pro, "annual").annualSwitch, true);
  assert.equal(billingEligibility(paid, pro, "annual").checkout, true);
  assert.equal(billingEligibility(paid, { ...pro, annual_price_egp: 6000 }, "annual").checkout, false);
  assert.equal(billingEligibility({ ...paid, billing_cycle: "annual" }, pro, "annual").checkout, false);
  assert.equal(billingEligibility({ ...paid, billing_cycle: "annual" }, pro, "monthly").checkout, false);
});
test("a downgrade compares prices over the same period and suppresses an identical scheduled change", () => {
  const paid = { ...bill, plan: pro };
  const next = billingEligibility(paid, starter, "annual");
  assert.equal(next.downgrade, true);
  assert.equal(next.checkout, false);
  assert.equal(billingEligibility({ ...paid, scheduled_plan_code: "starter", scheduled_billing_cycle: "annual" }, starter, "annual").downgrade, false);
  assert.equal(billingEligibility(bill, starter, "monthly").downgrade, false);
});
test("quota impact includes only usage above future limits and honors store overrides", () => {
  assert.deepEqual(downgradeImpact(bill, starter).map(item => item.resource), ["products", "staff_members", "custom_domains"]);
  assert.deepEqual(downgradeImpact({ ...bill, products: 10, staff_members: 1, custom_domains: 0 }, starter), []);
  assert.deepEqual(downgradeImpact({ ...bill, quota_overrides: { max_products: null, max_staff_members: 2, custom_domains_enabled: true } }, starter), []);
});
test("channel availability requires the global switch and configured manual destination", () => {
  const all = { paymob_enabled: true, paymob_card_enabled: true, paymob_wallet_enabled: true, manual_transfer_enabled: true,
    instapay_handle: "shop@instapay", wallet_transfer_number: "01000000000", bank_iban: "EG00" };
  assert.deepEqual(paymentChannels(all), ["paymob_card", "paymob_wallet", "instapay", "mobile_wallet_manual", "bank_transfer"]);
  assert.deepEqual(paymentChannels(all, true), ["paymob_card", "paymob_wallet"]);
  assert.deepEqual(paymentChannels({ ...all, paymob_enabled: false, instapay_handle: null, bank_iban: "" }), ["mobile_wallet_manual"]);
  assert.deepEqual(paymentChannels({ ...all, paymob_enabled: false, manual_transfer_enabled: false }), []);
});
function transferForm(overrides = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ reference: "  IN-123  ", paymentMethod: "instapay", sender: "  ", note: " ", idempotencyKey: crypto.randomUUID(), ...overrides })) {
    form.set(key, value);
  }
  return form;
}
test("manual transfer validation trims the reference and normalizes blank optional fields", () => {
  const result = parseManualTransfer(transferForm());
  assert.equal(result.reference, "IN-123");
  assert.equal(result.sender, null);
  assert.equal(result.receipt, null);
  assert.equal(result.note, null);
});
test("manual transfer validation rejects malformed fields, invalid channels and unsupported or oversized files", () => {
  for (const values of [{ reference: " xx " }, { reference: "x".repeat(121) }, { sender: "x".repeat(121) }, { note: "x".repeat(1001) },
    { paymentMethod: "paymob_wallet" }, { idempotencyKey: "" }, { receipt: "other-store/file" },
    { receipt: new File(["x"], "x.gif", { type: "image/gif" }) },
    { receipt: new File([new Uint8Array(receiptLimit + 1)], "x.webp", { type: "image/webp" }) }]) {
    assert.throws(() => parseManualTransfer(transferForm(values)));
  }
  assert.equal(parseManualTransfer(transferForm({ receipt: new File(["x"], "x.png", { type: "image/png" }) })).receipt.size, 1);
});

function receiptSubmission(outcomes) {
  const store = crypto.randomUUID();
  const uploaded = [], removed = [], calls = [];
  const db = {
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle() { return { data: null, error: null }; } }),
    rpc(name, args) { assert.equal(name, "billing_submit_manual_upgrade"); calls.push(args); return outcomes.shift(); },
  };
  const bucket = {
    upload(path) { uploaded.push(path); return { error: null }; },
    remove(paths) { removed.push(...paths); return { error: null }; },
  };
  const { submitBillingTransfer } = loadSource("app/admin/billing/merchant-actions.ts", {
    "next/cache": { revalidatePath() {} }, "@/lib/db": { requireAdmin: () => ({ storeId: store, db }) },
    "@/lib/billing": billing, "@/lib/billing-checkout": checkout, "@/lib/security": security,
    "@/lib/supabase/admin": { adminDb: () => ({ storage: { from: () => bucket } }) },
  });
  const receipt = new File([Buffer.from("89504e470d0a1a0a00000000", "hex")], "receipt.png", { type: "image/png" });
  return { calls, uploaded, removed, submit: () => submitBillingTransfer(store, "pro", "monthly", 500, transferForm({ receipt })) };
}
test("receipt submission replays an ambiguous commit with the same upload, key and visible quote", async () => {
  const attempt = receiptSubmission([{ status: 503, error: { code: "", message: "offline" } }, { status: 200, error: null }]);
  assert.equal(await attempt.submit(), "ok");
  assert.equal(attempt.uploaded.length, 1);
  assert.equal(attempt.calls[0].p_expected_amount, 500);
  assert.deepEqual(attempt.calls[0], attempt.calls[1]);
  assert.deepEqual(attempt.removed, []);
});
test("a rejected quote cleans up only the unclaimed upload, and unresolved outcomes preserve it", async () => {
  const price = receiptSubmission([{ status: 409, error: { code: "PT409", message: "billing_price_changed" } }]);
  assert.equal(await price.submit(), "price");
  assert.deepEqual(price.removed, price.uploaded);
  const offline = { status: 503, error: { code: "", message: "offline" } };
  const interrupted = receiptSubmission([offline, offline]);
  assert.equal(await interrupted.submit(), "unavailable");
  assert.deepEqual(interrupted.removed, []);
});
