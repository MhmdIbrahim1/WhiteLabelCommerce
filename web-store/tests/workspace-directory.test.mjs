import test from "node:test";
import assert from "node:assert/strict";
import { directoryHref, isRecordId, orderIdBounds, searchText, statusTone } from "../src/lib/workspace-directory.ts";
import { focusBoundary, openWorkspaceDialog } from "../src/lib/workspace-dialog.ts";
import { quickProductChange } from "../src/lib/catalog-quick-edit.ts";
import { defaultTheme } from "../src/lib/platform-theme.ts";
import { resolveWorkspaceTokens } from "../src/lib/workspace-theme.ts";
import { contrastRatio } from "../src/lib/theme-contrast.ts";

test("status dots cover catalog, fulfillment, subscription, domain and build states", () => {
  const groups = {
    good: ["active", "completed", "verified", "delivered", "succeeded"],
    waiting: ["pending", "pending_dns", "trialing", "queued"],
    progress: ["processing", "confirmed", "shipped", "building"],
    danger: ["cancelled", "canceled", "past_due", "failed", "error"],
    neutral: ["draft", "expired", "unknown", "", "__proto__", "constructor"],
  };
  for (const [tone, states] of Object.entries(groups)) for (const state of states) assert.equal(statusTone(state), tone, state);
});

test("dot colors remain readable on all workspace surfaces in both modes", () => {
  for (const mode of ["light", "dark"]) {
    const tokens = resolveWorkspaceTokens(defaultTheme, mode);
    for (const color of ["--ws-good", "--ws-warn", "--ws-info", "--ws-danger", "--pt-muted"])
      for (const bg of ["--pt-surface", "--pt-card", "--ws-canvas"])
        assert.ok(contrastRatio(tokens[color], tokens[bg]) >= 4.5, [mode, color, bg].join(" "));
  }
});

test("opening and dismissing an inspection round-trips the exact directory state", () => {
  const id = "abcdef12-3456-7890-abcd-ef1234567890";
  for (const path of ["/admin/products", "/admin/orders"]) {
    const filters = { q: "عباءة & 50% + #1", status: "draft", page: 3 };
    const open = new URL(directoryHref(path, { ...filters, inspect: id }), "https://example.invalid");
    assert.equal(open.searchParams.get("q"), filters.q);
    assert.equal(open.searchParams.get("inspect"), id);
    open.searchParams.delete("inspect");
    assert.equal(open.pathname + open.search, directoryHref(path, filters));
    assert.equal(directoryHref(path, { page: 1, q: "", status: "" }), path);
  }
});

test("directory search ignores non-scalar parameters and caps the search term", () => {
  assert.equal(searchText(["one", "two"]), "");
  assert.equal(searchText("  القاهرة  "), "القاهرة");
  assert.equal(searchText("x".repeat(110)).length, 100);
  assert.equal(searchText(undefined), "");
});

test("short order IDs search the full UUID interval including both boundaries", () => {
  const id = "12ab6789-3456-7890-abcd-ef1234567890";
  assert.deepEqual(orderIdBounds("#12AB6789"), { first: "12ab6789-0000-0000-0000-000000000000", last: "12ab6789-ffff-ffff-ffff-ffffffffffff" });
  assert.deepEqual(orderIdBounds(id), { first: id, last: id });
  for (const prefix of ["1", "12ab6789-3456", id.replaceAll("-", "")]) {
    const range = orderIdBounds(prefix);
    assert.ok(range.first <= id && range.last >= id);
  }
  for (const term of ["", "ليلى", "phone,or", "%", "a".repeat(33)]) assert.equal(orderIdBounds(term), null);
  assert.ok(isRecordId(id));
  for (const invalid of [id + "\n", [id], "12ab6789", "new", "../orders"]) assert.equal(isRecordId(invalid), false);
});

test("Tab and Shift+Tab wrap only at a drawer boundary", () => {
  assert.equal(focusBoundary(0, 4, true), 3);
  assert.equal(focusBoundary(3, 4, false), 0);
  for (const reverse of [true, false]) {
    assert.equal(focusBoundary(1, 4, reverse), null);
    assert.equal(focusBoundary(0, 1, reverse), 0);
    assert.equal(focusBoundary(-1, 0, reverse), null);
  }
  assert.equal(focusBoundary(-1, 3, true), 2);
  assert.equal(focusBoundary(-1, 3, false), 0);
});

function dialogFixture() {
  const events = [];
  const element = name => ({ isConnected: true, matches: selector => selector !== ":disabled",
    focus: options => events.push([name, options]) });
  const opener = element("original button");
  const targets = new Map([["record", element("record")], ["directory-search", element("search")]]);
  const dialog = { ownerDocument: { activeElement: opener, getElementById: id => targets.get(id) ?? null },
    showModal: () => events.push("showModal"), close: () => events.push("close") };
  const release = openWorkspaceDialog(dialog, element("close button"), "record");
  return { events, opener, targets, release };
}

test("a native modal focuses its close control and returns focus to the actual opener without scrolling", () => {
  const { events, release } = dialogFixture();
  release();
  assert.deepEqual(events, ["showModal", ["close button", { preventScroll: true }], "close", ["original button", { preventScroll: true }]]);
});

test("closing a drawer handles a replaced row and a row removed by the current filter", () => {
  for (const remove of [false, true]) {
    const { events, opener, targets, release } = dialogFixture();
    opener.isConnected = false;
    if (remove) targets.delete("record");
    release();
    assert.deepEqual(events.at(-1), [remove ? "search" : "record", { preventScroll: true }]);
  }
});

const inventory = { stock: 5, flash_sale_price: null, product_variants: [] };
function productForm(patch = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: " قميص ", name_en: "Shirt", price: "90.50", original_stock: "5", stock: "4", visibility: "active", ...patch })) {
    if (value !== undefined) form.set(key, value);
  }
  return form;
}

test("quick edit projects only editable fields into the catalog RPC", () => {
  const change = quickProductChange(inventory, productForm({ cost_price: "1", slug: "different", variants: "[]", category_id: "other" }));
  assert.deepEqual(change.fields, { name: "قميص", name_en: "Shirt", price: 90.5, stock: 4, is_active: true });
  assert.equal(quickProductChange(inventory, productForm({ visibility: "draft", stock: "0" })).fields.is_active, false);
});

test("variant totals stay read-only and stale inventory cannot enter the quick-save payload", () => {
  const tracked = { ...inventory, product_variants: [{ size: "M", color: "blue", stock: 5 }] };
  const change = quickProductChange(tracked, productForm({ stock: undefined }));
  assert.equal(change.stock, 5);
  assert.equal(Object.hasOwn(change.fields, "stock"), false);
  assert.equal(quickProductChange(tracked, productForm()), "inventory_changed");
  assert.equal(quickProductChange(inventory, productForm({ original_stock: "3" })), "inventory_changed");
  assert.equal(quickProductChange(inventory, productForm({ stock: undefined })), "inventory_changed");
});

test("quick prices respect flash offers and shared stock is a nonnegative PostgreSQL integer", () => {
  assert.equal(quickProductChange({ ...inventory, flash_sale_price: 91 }, productForm()), "flash_price");
  for (const patch of [{ price: "" }, { price: "-1" }, { name: " " }, { stock: "0.5" }, { stock: "2147483648" }, { visibility: "" }])
    assert.equal(quickProductChange(inventory, productForm(patch)), "invalid");
});
