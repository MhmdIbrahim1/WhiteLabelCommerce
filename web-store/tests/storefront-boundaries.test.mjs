import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as settled } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import * as numbers from "../src/lib/order-number.ts";
import * as wishlist from "../src/lib/reviews-wishlist.ts";
import * as phones from "../src/lib/phone.ts";
import * as locations from "../src/lib/egypt-locations.ts";
import { loadSource } from "./helpers/load-source.mjs";

const nova = "00000000-0000-0000-0000-000000000001";
const omar = "b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c";
const order = "8879a56d-9c49-44b7-8847-5e743e1d473c";
const sql = readFileSync(new URL("../../supabase/migrations/20261127090000_tenant_storefront_boundaries.sql", import.meta.url), "utf8");

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children)] : [];
}
function label(tree) {
  if (Array.isArray(tree)) return tree.map(label).join("");
  return typeof tree === "string" ? tree : tree?.props ? label(tree.props.children) : "";
}
function button(tree, name) {
  return elements(tree).find(e => e.type === "button" && (label(e) === name || e.props["aria-label"] === name));
}

// Invoke a component's event handlers and inspect its next element tree, without a browser.
function stateful(file, name, imports, props) {
  const slots = [];
  let next;
  function useState(initial) {
    const i = next++;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
  }
  const component = loadSource(file, { ...imports, react: { useState, useRef: value => useState({ current: value })[0] } })[name];
  return () => { next = 0; return component(props); };
}

test("order grants explicitly allow buyer receipts and exclude tokens and costs", () => {
  const grants = [...sql.matchAll(/grant select\s*\(([^)]+)\)\s*on public\.(orders|order_items) to authenticated/gi)];
  const fields = Object.fromEntries(grants.map(([, list, table]) => [table, list.split(",").map(x => x.trim())]));
  assert.ok(["id", "store_id", "user_id", "customer_id", "payment_status", "guest_tracking"].every(x => fields.orders.includes(x)));
  assert.ok(["id", "product_id", "quantity", "unit_price", "order_id"].every(x => fields.order_items.includes(x)));
  assert.ok(!fields.orders.includes("delivery_token") && !fields.order_items.includes("unit_cost"));
  assert.match(sql, /revoke select on public.orders, public.order_items from public, anon, authenticated/i);
  assert.match(sql, /has_store_permission\(p_store_id, 'manage_orders'\)/);
  assert.match(sql, /where o.store_id = p_store_id and o.id = p_order_id/);
});

test("guest tracking accepts the displayed UUID and normalized phone in either language and always uses the request's tenant", async () => {
  assert.equal(numbers.trackingReference(" " + order.toUpperCase() + " "), order);
  for (const invalid of [order.slice(0, 8), numbers.formatOrderNumber(order), "#" + order, order + "0", ""]) {
    assert.equal(numbers.trackingReference(invalid), null);
  }
  assert.match(sql, /drop function if exists public.track_guest_order\(uuid, text\)/);
  assert.match(sql, /where o.store_id = p_store_id and o.id = order_number\s+and o.guest_tracking and o.user_id is null and o.phone = customer_phone/);
  for (const lang of ["ar", "en"]) {
    const calls = [];
    let resolved = nova;
    const { track } = loadSource("app/(shop)/orders/actions.ts", {
      "next/navigation": {}, "next/cache": {}, "@/lib/returns": {}, "@/lib/phone": phones, "@/lib/order-number": numbers,
      "@/lib/i18n-server": { getServerLang: () => lang },
      "@/lib/tenant": { resolveActiveStoreOrDefault: () => ({ id: resolved }) },
      "@/lib/db": { serverDb: () => ({ rpc(name, args) {
        assert.equal(name, "track_guest_order");
        calls.push(args);
        const found = args.p_store_id === nova && args.order_number === order && args.customer_phone === "01000000027";
        return { maybeSingle: () => ({ error: null, data: found ? { id: order, status: "shipped" } : null }) };
      } }) },
    });
    const form = new FormData();
    form.set("number", numbers.trackingReference(order));
    form.set("phone", lang === "ar" ? "٠١٠٠٠٠٠٠٠٢٧" : "01000000027");
    form.set("storeId", nova);
    assert.equal((await track({}, form)).row.id, order);
    resolved = omar;
    const otherStore = await track({}, form);
    resolved = nova;
    form.set("phone", "01000000028");
    assert.deepEqual(await track({}, form), otherStore);
    assert.deepEqual(Object.keys(otherStore), ["error"]);
    form.set("number", order.slice(0, 8));
    assert.ok((await track({}, form)).error);
    assert.deepEqual(calls.map(c => c.p_store_id), [nova, omar, nova]);
  }
});

test("each guest receipt displays and copies the same isolated reference in AR and EN", async t => {
  const copies = [];
  const old = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => copies.push(value) } });
  t.after(() => { if (old) Object.defineProperty(navigator, "clipboard", old); else delete navigator.clipboard; });
  for (const lang of ["ar", "en"]) {
    const { OrdersPaymentSync } = loadSource("components/shop/orders-payment-sync.tsx", {
      react: { useEffect() {} }, "@/lib/order-number": numbers, "@/components/floating-toast": { showToast() {} },
      "./cart-store": { useCartTenant: () => nova }, "@/lib/analytics": {},
      "@/components/language-provider": { useLanguage: () => ({ lang, t: key => key }) },
    });
    for (const flags of [{ placedCod: true }, { placedWallet: true }, { paymentCallback: "success" }]) {
      const banner = OrdersPaymentSync({ callbackOrder: order.toUpperCase(), guest: true, paidOrderIds: [], ...flags });
      const reference = banner.props.children.at(-1);
      const block = reference.type(reference.props);
      const code = elements(block).find(el => el.type === "bdi");
      assert.equal(code.props.dir, "ltr");
      assert.equal(code.props.className, "tabular-nums");
      assert.equal(label(code), order);
      button(block, lang === "en" ? "Copy reference" : "نسخ رقم التتبع").props.onClick();
    }
  }
  assert.deepEqual(copies, Array(6).fill(order));
});

test("homepage requests earliest eligible deals and batches distinct category sections before their limits", async () => {
  const requests = [];
  const rare = "6247c225-718c-47c5-949c-d97d22429cdb";
  const common = "6a5d54a1-f1a4-4e23-be2b-990e8553ca49";
  const deal = { id: "rank-53", category_id: rare };
  const db = createClient("https://catalog.example", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(input);
      const table = url.pathname.split("/").at(-1);
      requests.push([table, url.searchParams]);
      const data = { storefront_flash_deals: [deal], products: [{ id: "latest" }],
        categories: [{ id: rare, products: [deal] }, { id: common, products: [] }] }[table];
      return Response.json(data);
    } },
  });
  const { homeProducts } = loadSource("lib/home-products.ts", {
    "./shop": { productFields: "id,category_id,max_order_qty" },
    "./db": { checked(result) { assert.equal(result.error, null); return result.data; } },
  });
  const section = (categoryId, limit, visible = true) => ({ type: "featured_products", categoryId, limit, visible });
  const result = await homeProducts(db, nova, [section("", 6), section(rare, 2), section(rare, 4), section(common, 8),
    section(order, 12, false), { type: "hero_banner", visible: true }]);
  assert.equal(requests.length, 3);
  const params = Object.fromEntries(requests);
  for (const query of Object.values(params)) assert.equal(query.get("store_id"), "eq." + nova);
  assert.equal(params.storefront_flash_deals.get("order"), "flash_sale_ends_at.asc,id.asc");
  assert.equal(params.storefront_flash_deals.get("limit"), "8");
  assert.equal(params.products.get("is_active"), "eq.true");
  assert.equal(params.products.get("limit"), "6");
  assert.equal(params.products.get("order"), "created_at.desc,id.asc");
  assert.equal(params.categories.get("id"), "in.(" + rare + "," + common + ")");
  assert.match(params.categories.get("select"), /products!products_category_store_fk/);
  assert.equal(params.categories.get("products.store_id"), "eq." + nova);
  assert.equal(params.categories.get("products.is_active"), "eq.true");
  assert.equal(params.categories.get("products.order"), "created_at.desc,id.asc");
  assert.equal(params.categories.get("products.limit"), "8");
  assert.deepEqual(result.flashDeals, [deal]);
  assert.deepEqual(result.featured.get(rare), [deal]);
  assert.deepEqual(result.featured.get(""), [{ id: "latest" }]);
  assert.match(sql, /security_invoker = true/);
  assert.match(sql, /p.is_active and p.stock > 0 and p.flash_sale_price > 0 and p.flash_sale_price < p.price/);
  assert.match(sql, /p.flash_sale_starts_at is null or p.flash_sale_starts_at <= statement_timestamp\(\)/);
  assert.match(sql, /p.flash_sale_ends_at > statement_timestamp\(\)/);
  requests.length = 0;
  await homeProducts(db, omar, []);
  assert.deepEqual(requests.map(([table]) => table), ["storefront_flash_deals"]);
});

test("wishlist failures restore the last saved state, including failed sign-in and lost responses", async () => {
  for (const wasSaved of [false, true]) {
    for (const persist of [async () => ({ ok: false, requiresAuth: true, error: "auth_required" }), async () => { throw Error("offline"); }]) {
      const displayed = [];
      const result = await wishlist.persistWishlistChange(wasSaved, !wasSaved, value => displayed.push(value), persist);
      assert.equal(result.ok, false);
      assert.deepEqual(displayed, [!wasSaved, wasSaved]);
    }
  }
});

test("wishlist grid keeps the row while saving, shows a localized retry, then removes on confirmation", async () => {
  for (const lang of ["ar", "en"]) {
    const en = lang === "en";
    let finish;
    let busy = false;
    const render = stateful("components/shop/wishlist-grid.tsx", "WishlistGrid", {
      "@/lib/variant-stock": { stockLabel: () => "" }, "@/lib/i18n": { localizedText: () => "Item" },
      "@/lib/tenant-shared": { storeHref: (_, path) => path }, "@/lib/reviews-wishlist": wishlist,
      "@/components/language-provider": { useLanguage: () => ({ lang }) }, "./buy": {}, "./flash-countdown": {},
      "./wishlist-provider": { useWishlist: () => ({ isPending: () => busy, toggle: async (id, action) => {
        assert.equal(id, order); assert.equal(action, "remove"); busy = true;
        const result = await new Promise(resolve => { finish = resolve; });
        busy = false; return result;
      } }) },
    }, { initialProducts: [{ id: order, name: "Item", stock: 2, price: 5 }], initialNow: 0, currency: "EGP" });
    const remove = en ? "Remove from wishlist" : "إزالة من المفضلة";
    button(render(), remove).props.onClick();
    assert.ok(button(render(), remove).props.disabled);
    assert.ok(elements(render()).some(e => e.type === "article"));
    finish({ ok: false, error: "write_failed" });
    await settled();
    assert.ok(elements(render()).some(e => e.props.role === "alert"));
    button(render(), en ? "Retry removal" : "إعادة محاولة الإزالة").props.onClick();
    finish({ ok: true, in_wishlist: false });
    await settled();
    assert.ok(!elements(render()).some(e => e.type === "article"));
  }
});

test("retrying wishlist removal uses the same tenant, user and product delete even when the first response was lost", async () => {
  const filters = [];
  const { toggleWishlistAction } = loadSource("app/(shop)/wishlist/actions.ts", {
    "next/cache": { revalidatePath() {} }, "@/lib/action-error": {}, "@/lib/tenant": { resolveActiveStoreOrDefault: () => ({ id: nova }) },
    "@/lib/db": { serverDb: () => ({ auth: { getUser: () => ({ data: { user: { id: omar } } }) },
      from(table) {
        assert.equal(table, "wishlists");
        return { delete() {
          const conditions = [];
          filters.push(conditions);
          return { eq(col, value) { conditions.push([col, value]); return this; }, data: null, error: null };
        } };
      } }) },
  });
  for (let i = 0; i < 2; i++) assert.deepEqual(await toggleWishlistAction(order, "remove"), { ok: true, in_wishlist: false });
  assert.deepEqual(filters, Array(2).fill([["store_id", nova], ["user_id", omar], ["product_id", order]]));
});

test("editing the stored default locks a checked checkbox and identifies how to switch in both languages", async () => {
  const address = loadSource("lib/customer-address.ts", { "./egypt-locations": locations });
  for (const lang of ["ar", "en"]) {
    const en = lang === "en";
    const rows = [true, false].map((is_default, i) => ({ ...address.emptyAddress, id: String(i), is_default }));
    const render = stateful("components/shop/address-book.tsx", "AddressBook", {
      "@/components/floating-toast": { showToast() {} }, "@/components/language-provider": { useLanguage: () => ({ lang }) },
      "@/app/(shop)/account/address-actions": { changeAddress(store, action, id) {
        assert.deepEqual([store, action, id], [nova, "default", "1"]);
        return rows.map(row => ({ ...row, is_default: row.id === id }));
      } },
      "@/lib/customer-address": address, "@/lib/egypt-locations": locations, "@/lib/phone": phones, "./address-book.css": {},
    }, { storeId: nova, initial: rows });
    const edit = i => button(elements(render()).filter(e => e.props.className === "address-row")[i], en ? "Edit" : "تعديل").props.onClick();
    const box = () => elements(render()).find(e => e.type === "input" && e.props.type === "checkbox").props;
    edit(0);
    assert.equal(box().checked, true); assert.equal(box().disabled, true);
    assert.ok(label(elements(render()).find(e => e.props.id === box()["aria-describedby"])).includes(en ? "Set default" : "تعيين كافتراضي"));
    edit(1);
    assert.equal(box().checked, false); assert.equal(box().disabled, false);
    box().onChange({ target: { checked: true } });
    assert.equal(box().checked, true); assert.equal(box().disabled, false);
    await button(render(), en ? "Set default" : "تعيين كافتراضي").props.onClick();
    edit(1);
    assert.equal(box().checked, true); assert.equal(box().disabled, true);
    edit(0);
    assert.equal(box().checked, false); assert.equal(box().disabled, false);
  }
});
