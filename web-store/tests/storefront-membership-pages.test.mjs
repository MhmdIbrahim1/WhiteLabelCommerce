import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./helpers/load-source.mjs";
import { nodes, label } from "./helpers/auth-view.mjs";
import * as authFlow from "../src/lib/auth-flow.ts";
import * as tenant from "../src/lib/tenant-shared.ts";

const store = { storeId: "omar-id", slug: "omar-a7a", basePath: "/s/omar-a7a", uiConfig: { defaultLanguage: "en" } };
const accountImports = {
  "@/components/shop/address-book": {}, "@/components/shop/wallet-section": {}, "@/components/floating-toast": {},
  "@/components/language-provider": {}, "@/components/shop/egypt-address-fields": {},
  "@/components/shop/hybrid-auth-panel": { HybridAuthPanel: "auth-panel" }, "@/components/auth-session": {},
  "@/lib/i18n": {}, "../../login/actions": {}, "./customer-tickets": {}, "./account.css": {},
};
const orderImports = {
  "@/lib/brand": {}, "@/lib/order-receipt": {}, "@/lib/order-proof": {}, "@/lib/order-payment": {},
  "@/components/shop/order-payment-controls": {}, "@/components/shop/tracking": {},
  "@/components/shop/orders-payment-sync": {}, "@/components/shop/order-cards": {}, "@/lib/i18n": {}, "./orders.css": {},
};
const failRedirect = path => { throw Object.assign(new Error("Redirect"), { path }); };

function pageImports(user, surface = "storefront") {
  const db = { auth: { getUser: async () => ({ data: { user } }) } };
  // Account data and order history must never be queried before this check succeeds.
  const checkedStores = [];
  const imports = {
    "next/link": "a", "next/headers": { headers: () => new Headers([[tenant.PLATFORM_SURFACE_HEADER, surface]]) },
    "next/navigation": { redirect: failRedirect }, "@/lib/tenant": tenant, "@/lib/tenant-shared": tenant,
    "@/lib/db": { serverDb: () => db }, "@/lib/auth-flow": authFlow, "@/lib/shop": { settings: () => store },
    "@/lib/i18n-server": { getServerLang: () => "en" }, "@/lib/storefront-auth": {
      async storeCustomerEnrolled(client, storeId) {
        assert.equal(client, db);
        checkedStores.push(storeId);
        return false;
      },
    },
  };
  return { imports, checkedStores };
}

test("account and orders require enrollment at the current store before loading personal data", async () => {
  const { imports, checkedStores } = pageImports({ id: "buyer", email: "buyer@example.test", email_confirmed_at: "confirmed" });
  const account = loadSource("app/(shop)/account/page.tsx", { ...imports, ...accountImports }).default;
  const orders = loadSource("app/(shop)/orders/page.tsx", { ...imports, ...orderImports }).default;
  for (const [page, query, next] of [
    [account, { section: "addresses" }, "/s/omar-a7a/account/addresses"],
    [orders, { filter: "active" }, "/s/omar-a7a/orders?filter=active"],
  ]) {
    await assert.rejects(page({ searchParams: Promise.resolve(query) }), err =>
      err.path === "/s/omar-a7a/welcome?next=" + encodeURIComponent(next));
  }
  assert.deepEqual(checkedStores, ["omar-id", "omar-id"]);
});

test("a signed-out account gate selects the store login and ignores a control-plane return path", async () => {
  const { imports, checkedStores } = pageImports(null);
  const page = loadSource("app/(shop)/account/page.tsx", { ...imports, ...accountImports }).default;
  const tree = await page({ searchParams: Promise.resolve({ section: "tickets", next: "/admin" }) });
  const panel = nodes(tree).find(node => node.type === "auth-panel");
  assert.ok(panel);
  assert.equal(panel.props.basePath, "/s/omar-a7a");
  assert.equal(panel.props.nextPath, "/s/omar-a7a/account/tickets");
  assert.ok(!panel.props.platform);
  assert.deepEqual(checkedStores, []);
});

test("an unenrolled shopper can check out without saving an address or initializing a store profile", async () => {
  const { imports, checkedStores } = pageImports({ id: "buyer", email: "buyer@example.test" });
  const db = await imports["@/lib/db"].serverDb();
  db.from = table => {
    assert.equal(table, "governorate_shipping_rates");
    return { select: () => ({ eq: () => ({ data: [] }) }) };
  };
  const checkout = loadSource("app/(shop)/checkout/page.tsx", {
    ...imports, "@/components/shop/basket": { Basket: "basket" },
    "@/lib/db": { serverDb: () => db, checked: result => result.data },
  }).default;
  const basket = await checkout();
  assert.equal(basket.props.buyer, "buyer");
  assert.equal(basket.props.signedInEmail, "buyer@example.test");
  assert.equal(basket.props.canSaveAddress, false);
  assert.deepEqual(basket.props.addresses, []);
  assert.equal(basket.props.defaultName, "");

  const { changeAddress } = loadSource("app/(shop)/account/address-actions.ts", {
    ...imports, "@/lib/phone": {}, "@/lib/tenant": { resolveActiveStoreOrDefault: () => ({ id: store.storeId }) },
  });
  assert.equal(await changeAddress(store.storeId, "add", "address-id", {}), null);
  assert.deepEqual(checkedStores, ["omar-id", "omar-id"]);
});

test("closed tickets show the complete ordered thread, with a fallback for legacy records", async () => {
  const ticketId = "d130a317-7365-4d00-b507-e50f664904cf";
  const ticket = { status: "closed", subject: "Return", message: "Original question", admin_reply: "Old reply", created_at: "2026-01-01T12:00:00Z" };
  let messages = Array.from({ length: 101 }, (_, i) => ({ id: String(i), sender_role: i ? "merchant" : "customer",
    body: "Thread message " + i, created_at: ticket.created_at }));
  const db = {
    from(table) {
      const filters = {}, ordering = [];
      return {
        select() { return this; }, eq(key, value) { filters[key] = value; return this; },
        order(key) { ordering.push(key); return this; },
        maybeSingle() {
          assert.equal(table, "support_tickets");
          assert.deepEqual(filters, { id: ticketId, store_id: store.storeId, customer_id: "buyer" });
          return { data: ticket };
        },
        range(start, end) {
          assert.equal(table, "support_ticket_messages");
          assert.deepEqual(filters, { store_id: store.storeId, ticket_id: ticketId });
          assert.deepEqual(ordering, ["created_at", "id"]);
          return { data: messages.slice(start, end + 1) };
        },
      };
    },
  };
  const { CustomerTickets } = loadSource("app/(shop)/account/customer-tickets.tsx", {
    "next/link": "a", "next/navigation": {}, "@/lib/db": { checked: result => result.data, serverDb: () => db },
    "@/lib/i18n": { ticketStatusLabel: () => "Resolved" }, "@/lib/paymob": { UUID_RE: /^[a-f\d-]{36}$/ },
    "@/lib/tenant": tenant,
  });
  const read = () => CustomerTickets({ lang: "en", userId: "buyer", storeId: store.storeId, basePath: store.basePath, ticketId });
  const full = await read();
  assert.deepEqual(nodes(full).filter(node => node.type === "p").map(label), messages.map(message => message.body));
  assert.ok(!nodes(full).some(node => node.type === "form"));
  messages = [];
  assert.deepEqual(nodes(await read()).filter(node => node.type === "p").map(label), ["Original question", "Old reply"]);
});
