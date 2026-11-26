import test from "node:test";
import assert from "node:assert/strict";
import { canDelegate, canEditMember, canOpenAdmin, canSeeOverview, normalizeInviteEmail, permissionKeys,
  preset, readAssignment, readPermissions, validInviteToken } from "../src/lib/team.ts";
import { limitReached, parsePlan, parseSubscription, quotaFailure, quotaKeys, quotaResources,
  resolveEntitlements } from "../src/lib/billing.ts";

test("presets are independent sets and specialized staff get exactly their assigned permission", () => {
  assert.equal(permissionKeys.length, 8);
  assert.deepEqual(Object.keys(preset("owner")).sort(), [...permissionKeys].sort());
  assert.deepEqual(preset("orders"), { manage_orders: true });
  assert.deepEqual(preset("catalog"), { manage_products: true });
  assert.deepEqual(preset("custom"), {});
  const manager = preset("manager");
  assert.equal(manager.manage_staff, true);
  assert.equal(manager.manage_billing, undefined);
  delete manager.manage_staff;
  assert.equal(preset("manager").manage_staff, true);
});

test("permission input fails closed on malformed maps, unknown roles and modified fixed presets", () => {
  for (const value of [null, [], "owner", { manage_staff: "true" }, { manage_orders: false },
    { manage_staff: true, unknown: true }, JSON.parse('{"__proto__":true}')]) assert.equal(readPermissions(value), null);
  for (const role of ["owner", "manager", "orders", "catalog", "custom"])
    assert.deepEqual(readAssignment(role, preset(role)), { role, permissions: preset(role) });
  assert.equal(readAssignment("admin", {}), null);
  assert.equal(readAssignment("orders", { manage_orders: true, manage_billing: true }), null);
  assert.deepEqual(readAssignment("custom", { manage_domains: true })?.permissions, { manage_domains: true });
});

test("delegation protects self, owners, the last owner, and permissions the actor does not hold", () => {
  const manager = { id: "manager", owner: false, permissions: preset("manager") };
  const owner = { id: "primary", owner: true, permissions: preset("owner") };
  const member = (id, role) => ({ id, email: id + "@example.invalid", role, permissions: preset(role) });
  assert.equal(canEditMember(manager, member("manager", "manager"), 2), false);
  assert.equal(canEditMember(manager, member("primary", "owner"), 2), false);
  assert.equal(canEditMember(owner, member("other", "owner"), 1), false);
  assert.equal(canEditMember(owner, member("other", "owner"), 2), true);
  assert.equal(canEditMember(owner, member("primary", "owner"), 2), true);
  assert.equal(canEditMember(manager, member("colleague", "orders"), 1), true);
  assert.equal(canDelegate(manager, { role: "custom", permissions: { manage_billing: true } }), false);
  assert.equal(canDelegate({ ...manager, permissions: preset("owner") }, member("other", "owner")), false);
  assert.equal(canDelegate({ ...owner, permissions: preset("catalog") }, member("other", "catalog")), false);
});

test("navigation and the dashboard respect independent grants including domains without settings", () => {
  assert.equal(canOpenAdmin("/admin/orders/receipt", preset("orders")), true);
  assert.equal(canOpenAdmin("/admin/orders", preset("catalog")), false);
  assert.equal(canOpenAdmin("/admin/team", preset("orders")), false);
  assert.equal(canOpenAdmin("/admin/notifications", { manage_customers: true }), false);
  assert.equal(canOpenAdmin("/admin/notifications", preset("manager")), true);
  assert.equal(canOpenAdmin("/admin/settings/domains", { manage_domains: true }), true);
  assert.equal(canOpenAdmin("/admin/settings", { manage_domains: true }), false);
  assert.equal(canOpenAdmin("/admin/restricted", {}), true);
  assert.equal(canOpenAdmin("/admin/unknown", preset("owner")), false);
  assert.equal(canSeeOverview(preset("orders")), false);
  assert.equal(canSeeOverview(preset("manager")), true);
});

test("invite links accept only the wire token and normalize the recipient", () => {
  assert.equal(normalizeInviteEmail("  Member+store@EXAMPLE.invalid "), "member+store@example.invalid");
  for (const email of ["a@@x.y", "a@x", "a b@x.test", "x".repeat(250) + "@x.test"]) assert.equal(normalizeInviteEmail(email), null);
  assert.equal(validInviteToken("01ab".repeat(16)), true);
  for (const token of [null, "a".repeat(63), "A".repeat(64), "g".repeat(64), "a".repeat(64) + "\n"]) assert.equal(validInviteToken(token), false);
});

test("plan cards, plan editing, overrides and seat usage share the staff entitlement", () => {
  const plan = { max_products: 50, max_monthly_orders: 100, max_monthly_apk_builds: 2, max_staff_members: 1, custom_domains_enabled: false };
  assert.equal(quotaResources.max_staff_members, "staff_members");
  for (const cap of [0, 1, 5, null]) {
    assert.equal(resolveEntitlements({ ...plan, max_staff_members: cap }, {}).max_staff_members, cap);
    assert.equal(resolveEntitlements(plan, { max_staff_members: cap }).max_staff_members, cap);
  }
  assert.equal(limitReached(1, 1), true);
  assert.equal(limitReached(20, null), false);
  const detail = { code: "plan_limit_reached", resource: "staff_members", current: 5, limit: 5 };
  assert.deepEqual(quotaFailure({ message: detail.code, details: JSON.stringify(detail) }), detail);
  const form = new FormData();
  for (const [k, v] of Object.entries({ code: "starter", plan_code: "starter", billing_cycle: "monthly", status: "active",
    name_ar: "البداية", name_en: "Starter", description_ar: "متجر", description_en: "Store", monthly_price_egp: "0",
    annual_price_egp: "0", trial_days: "0", sort_order: "0", trial_end: "", admin_notes: "" })) form.set(k, v);
  for (const key of quotaKeys) { form.set(key + "_mode", "custom"); form.set(key, "1"); }
  assert.equal(parsePlan(form).max_staff_members, 1);
  form.set("max_staff_members", "-1"); assert.throws(() => parsePlan(form));
  form.set("max_staff_members_mode", "unlimited"); assert.equal(parsePlan(form).max_staff_members, null);
  form.set("custom_domains_enabled", "inherit");
  for (const key of quotaKeys) form.set(key + "_mode", "inherit");
  assert.deepEqual(parseSubscription(form).p_overrides, {});
  form.set("max_staff_members_mode", "custom"); form.set("max_staff_members", "0");
  assert.deepEqual(parseSubscription(form).p_overrides, { max_staff_members: 0 });
  form.set("max_staff_members_mode", "unlimited");
  assert.deepEqual(parseSubscription(form).p_overrides, { max_staff_members: null });
});
