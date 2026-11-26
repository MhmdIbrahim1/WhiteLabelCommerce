import test from "node:test";
import assert from "node:assert/strict";
import { annualSavings, cycleName, limitLabel, limitReached, parsePlan, parseSubscription, quotaFailure,
  quotaKeys, quotaMessage, resolveEntitlements, statusNames } from "../src/lib/billing.ts";

const defaults = { max_products: 50, max_monthly_orders: 100, max_monthly_apk_builds: 2, custom_domains_enabled: false };
function planForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    code: "starter", name_ar: "البداية", name_en: "Starter", description_ar: "متجرك الأول", description_en: "Your first store",
    monthly_price_egp: "0", annual_price_egp: "0", sort_order: "1", trial_days: "0", is_active: "on",
  })) form.set(key, value);
  for (const key of quotaKeys) { form.set(key + "_mode", "custom"); form.set(key, String(defaults[key])); }
  return form;
}
function subscriptionForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ plan_code: "pro", billing_cycle: "monthly", status: "active",
    trial_end: "", admin_notes: "", custom_domains_enabled: "inherit" })) form.set(key, value);
  for (const key of quotaKeys) form.set(key + "_mode", "inherit");
  return form;
}

test("inherited limits immediately follow the catalog, including an unlimited plan", () => {
  assert.deepEqual(resolveEntitlements(defaults, {}), defaults);
  const edited = { ...defaults, max_products: null, max_monthly_orders: 300, custom_domains_enabled: true };
  assert.deepEqual(resolveEntitlements(edited, { max_monthly_apk_builds: 5 }), { ...edited, max_monthly_apk_builds: 5 });
});
test("a store can set a zero cap, override to unlimited, and turn off an included domain", () => {
  const pro = { ...defaults, custom_domains_enabled: true };
  const overrides = { max_products: null, max_monthly_orders: 0, custom_domains_enabled: false };
  assert.deepEqual(resolveEntitlements(pro, overrides), { ...overrides, max_monthly_apk_builds: 2 });
  assert.equal(resolveEntitlements({ ...pro, max_products: 500 }, overrides).max_products, null);
  assert.equal(pro.max_products, 50);
});
test("admitting the last unit succeeds, and admission at or above the cap fails", () => {
  for (const [current, cap, reached] of [[0, 0, true], [0, 1, false], [1, 1, true], [2, 1, true],
    [99, 100, false], [100, 100, true], [2147483647, null, false]]) {
    assert.equal(limitReached(current, cap), reached);
  }
});
test("plan editor keeps explicit null caps and accepts free plans and signed display order", () => {
  const form = planForm();
  for (const key of quotaKeys) { form.set(key + "_mode", "unlimited"); form.delete(key); }
  form.set("sort_order", "-1");
  const plan = parsePlan(form);
  assert.equal(plan.is_active, true); assert.equal(plan.custom_domains_enabled, false);
  assert.equal(plan.monthly_price_egp, 0); assert.equal(plan.sort_order, -1);
  for (const key of quotaKeys) assert.equal(plan[key], null);
});
test("plan validation rejects malformed prices, quota modes, limits, text and codes", () => {
  for (const [key, value] of [["code", "enterprise"], ["name_en", " "], ["description_ar", "x".repeat(1001)],
    ["monthly_price_egp", "-1"], ["annual_price_egp", "1.5"], ["trial_days", ""], ["trial_days", "1e2"],
    ["sort_order", "2147483648"], ["max_products_mode", "inherit"], ["max_monthly_apk_builds", "2.5"],
    ["max_monthly_orders", "2147483648"], ["max_products", "-1"], ["max_products", "NaN"], ["custom_domains_enabled", "false"]]) {
    const form = planForm(); form.set(key, value); assert.throws(() => parsePlan(form), Error, key + "=" + value);
  }
  const missing = planForm(); missing.delete("max_products_mode"); assert.throws(() => parsePlan(missing));
});
test("subscription editor serializes inheritance as absence, preserving false, zero and JSON null", () => {
  const form = subscriptionForm();
  assert.deepEqual(parseSubscription(form).p_overrides, {});
  form.set("max_products_mode", "unlimited"); form.set("max_products", "500");
  form.set("max_monthly_orders_mode", "custom"); form.set("max_monthly_orders", "0");
  form.set("max_monthly_apk_builds", "17");
  form.set("custom_domains_enabled", "disabled"); form.set("admin_notes", "  Pilot  ");
  const args = parseSubscription(form);
  assert.deepEqual(args.p_overrides, { max_products: null, max_monthly_orders: 0, custom_domains_enabled: false });
  assert.equal(args.p_notes, "Pilot");
  form.set("max_products_mode", "inherit"); form.set("custom_domains_enabled", "enabled");
  assert.deepEqual(parseSubscription(form).p_overrides, { max_monthly_orders: 0, custom_domains_enabled: true });
});
test("subscription validation checks dates and requires a trial end for trialing stores", () => {
  const form = subscriptionForm();
  assert.equal(parseSubscription(form).p_trial_end, null);
  form.set("status", "trialing"); assert.throws(() => parseSubscription(form), /trial_end/);
  form.set("trial_end", "2026-02-29"); assert.throws(() => parseSubscription(form), /trial_end/);
  form.set("trial_end", "2028-02-29"); assert.equal(parseSubscription(form).p_trial_end, "2028-02-29T23:59:59.999Z");
  for (const [key, value] of [["billing_cycle","weekly"], ["plan_code","free"], ["status","trial"], ["custom_domains_enabled","null"],
    ["admin_notes","a".repeat(4001)], ["max_products_mode","custom"]]) {
    const invalid = subscriptionForm(); invalid.set(key, value); assert.throws(() => parseSubscription(invalid));
  }
});
test("annual savings are actual EGP savings against twelve monthly payments", () => {
  for (const [monthly, annual, expected] of [[0,0,0],[499,4990,998],[1499,14990,2998],[499,5988,0],[1,20,0]]) {
    assert.equal(annualSavings({ monthly_price_egp: monthly, annual_price_egp: annual }), expected);
  }
});
test("PostgREST details and the mobile API response map to the same structured error", () => {
  for (const resource of ["products", "orders", "apk_builds", "custom_domains"]) {
    const code = resource === "custom_domains" ? "feature_not_in_plan" : "plan_limit_reached";
    const detail = { code, resource, current: 2, limit: resource === "custom_domains" ? 0 : 2 };
    assert.deepEqual(quotaFailure({ message: code, details: JSON.stringify(detail) }), detail);
    assert.deepEqual(quotaFailure({ message: code, details: { ...detail, error: code } }), detail);
  }
});
test("unrelated or malformed errors remain ordinary failures", () => {
  const detail = { code: "plan_limit_reached", resource: "products", current: 1, limit: 0 };
  for (const error of [null, { message: "stock_unavailable", details: detail }, { message: detail.code, details: "{" },
    ...[{ code: "other" }, { current: -1 }, { current: "1" }, { limit: null }, { resource: "toString" }].map(change =>
      ({ message: detail.code, details: { ...detail, ...change } }))]) assert.equal(quotaFailure(error), null);
});
test("usage, status, cycle and quota prompts have merchant and shopper copy in both languages", () => {
  assert.equal(limitLabel(null, "ar"), "بلا حد"); assert.equal(limitLabel(null, "en"), "Unlimited");
  assert.notEqual(cycleName("annual", "ar"), cycleName("annual", "en"));
  for (const status of Object.values(statusNames)) assert.notEqual(status.ar, status.en);
  for (const key of ["products", "orders", "apk_builds", "custom_domains"]) {
    assert.match(quotaMessage(key, "ar"), /[\u0600-\u06ff]/);
    assert.notEqual(quotaMessage(key, "en"), quotaMessage(key, "ar"));
  }
  assert.notEqual(quotaMessage("apk_builds", "en", true), quotaMessage("apk_builds", "en"));
});
