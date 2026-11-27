import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import * as routing from "../src/lib/host-routing.ts";
import * as tenant from "../src/lib/tenant-shared.ts";
import { createCartHeartbeat } from "../src/lib/cart-heartbeat.ts";
import { loadSource } from "./helpers/load-source.mjs";

const nova = { id: tenant.DEFAULT_STORE_ID, slug: "nova-store", primaryDomain: null };
const omar = { id: "b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c", slug: "omar-a7a", primaryDomain: null };
const preview = "shopstage-test.vercel.app";
const root = "shopstage.live";

function proxyFixture(t, env, lookup) {
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const { proxy } = loadSource("proxy.ts", {
    "@/lib/host-routing": routing, "@/lib/tenant-shared": tenant, "@/lib/host-resolver": { resolveHostRoute: lookup },
    "@/lib/access": {}, "@supabase/ssr": { createServerClient: () => ({}) },
  });
  return (host, path, method = "GET", headers = {}) => proxy(new NextRequest("https://" + host + path, {
    method, headers: { host, ...headers },
  }));
}

test("proxy serves immutable GET and HEAD assets with zero directory or revision reads", async t => {
  let calls = 0;
  const request = proxyFixture(t, { PLATFORM_ROOT_DOMAIN: root, VERCEL_ENV: "preview" }, async () => {
    calls++;
    return null;
  });
  for (const host of [preview, "shop.merchant.example", "nova-store." + root]) {
    for (const [path, method] of [["/_next/static/chunks/app-41d.js", "GET"], ["/_next/static/css/9ca.css", "HEAD"]]) {
      const res = await request(host, path, method, { "x-store-id": omar.id, cookie: "sb-test-auth-token=fixture" });
      assert.equal(res.headers.get("x-middleware-next"), "1");
      assert.equal(res.headers.get("x-middleware-request-x-store-id"), null);
    }
  }
  assert.equal((await request(preview, "/_next/static/chunks/a.js", "GET", { "x-forwarded-host": root })).status, 404);
  assert.equal((await request(preview, "/_next/static/chunks%2f..%2forders")).status, 404);
  assert.equal(calls, 0);
});

test("HTML, APIs, actions, asset lookalikes and image optimization still check the current host", async t => {
  const calls = [];
  let registered = true;
  const request = proxyFixture(t, { PLATFORM_ROOT_DOMAIN: root, VERCEL_ENV: "production" }, async key => {
    calls.push(key);
    return registered ? nova : null;
  });
  const host = "merchant.example";
  for (const [path, method, headers] of [
    ["/products", "GET"], ["/api/abandoned-cart", "POST"], ["/products", "POST", { "next-action": "example" }],
    ["/_next/staticity/chunk.js", "GET"], ["/products/chunk.js", "GET"], ["/_next/image", "GET"],
    ["/_next/static/chunk.js", "POST", { "next-action": "example" }],
  ]) {
    calls.length = 0;
    assert.equal((await request(host, path, method, headers)).status, 200);
    assert.deepEqual(calls, [{ kind: "domain", value: host }], path);
  }
  registered = false;
  assert.equal((await request(host, "/products")).status, 404);
});

test("production root, preview platform and actual loopback origins use the correct authority", () => {
  const origin = (host, domain, classification, env) =>
    routing.platformOrigin(routing.normalizeHost(host), domain, classification, env);
  const custom = { kind: "domain", value: "merchant.example" };
  const deployed = { VERCEL_ENV: "production", NODE_ENV: "production" };
  const staging = { VERCEL_ENV: "preview", VERCEL_URL: preview };
  assert.equal(origin(custom.value, root, custom, deployed), "https://" + root);
  assert.equal(origin("localhost:3000", root, "platform", deployed), "https://" + root);
  assert.equal(origin(preview, root, "platform", staging), "https://" + root);
  assert.equal(origin("branch-alias.vercel.app:443", "localhost", "platform", staging), "https://branch-alias.vercel.app");
  assert.equal(origin(custom.value, "localhost", custom, staging), "https://" + preview);
  assert.equal(origin(custom.value, "localhost", custom, deployed), null);
  assert.equal(origin("localhost:3000", "localhost", "platform", deployed), null);
  assert.equal(origin("localhost:3000", "localhost", "platform", { NODE_ENV: "production" }), null);
  for (const invalid of ["localhost", "https://bad.vercel.app/path", "user@bad.vercel.app", "bad.vercel.app.example"]) {
    assert.equal(origin(custom.value, "localhost", custom, { ...staging, VERCEL_URL: invalid }), null);
  }
  for (const local of ["localhost:3000", "nova-store.localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    assert.equal(origin(local, "localhost", "platform", {}), "http://localhost:3000");
  }
});

test("preview aliases keep usable canonical paths and merchant redirects use the deployment origin", async t => {
  const request = proxyFixture(t, { PLATFORM_ROOT_DOMAIN: "localhost", VERCEL_ENV: "preview", VERCEL_URL: preview },
    async key => key.kind === "slug" || key.value === "merchant.example" ? nova : null);
  const alias = await request(preview, "/s/nova-store/products");
  assert.equal(alias.headers.get("x-middleware-request-" + tenant.STORE_CANONICAL_HEADER), "https://" + preview + "/s/nova-store/products");
  const redirect = await request("merchant.example", "/admin");
  assert.equal(redirect.headers.get("x-middleware-request-x-wlc-platform-redirect"), "https://" + preview + "/admin");
});

test("the heartbeat alias binds the store independently of the most recently visited tab", async t => {
  const reads = [];
  const request = proxyFixture(t, { PLATFORM_ROOT_DOMAIN: root, VERCEL_ENV: "production" }, async key => {
    reads.push(key);
    return [nova, omar].find(store => store.slug === key.value) ?? null;
  });
  for (const [intended, lastTab] of [[nova, omar], [omar, nova]]) {
    const response = await request(root, "/s/" + intended.slug + "/api/abandoned-cart", "POST", {
      referer: "https://" + root + "/s/" + lastTab.slug, cookie: tenant.STORE_SLUG_COOKIE + "=" + lastTab.slug,
      [tenant.STORE_ID_HEADER]: lastTab.id,
    });
    assert.equal(response.headers.get("x-middleware-request-" + tenant.STORE_ID_HEADER), intended.id);
    assert.equal(new URL(response.headers.get("x-middleware-rewrite")).pathname, "/api/abandoned-cart");
  }
  assert.deepEqual(reads, [nova, omar].map(store => ({ kind: "slug", value: store.slug })));
});

test("a verified public storefront stays reachable without a platform origin and control-plane redirects fail closed", async t => {
  const request = proxyFixture(t, { PLATFORM_ROOT_DOMAIN: "localhost", VERCEL_ENV: "production" },
    async key => key.value === "merchant.example" ? nova : null);
  const catalog = await request("merchant.example", "/products");
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get("x-middleware-request-" + tenant.STORE_CANONICAL_HEADER), "https://merchant.example/products");
  assert.equal(catalog.headers.get("x-middleware-request-" + tenant.PLATFORM_ORIGIN_HEADER), null);
  assert.equal((await request("merchant.example", "/admin")).status, 503);
  assert.equal((await request("unregistered.example", "/products")).status, 404);
});

test("changing storefront cancels a queued heartbeat and aborts both outstanding posts", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), signal: init.signal });
    await new Promise(resolve => init.signal.addEventListener("abort", resolve, { once: true }));
    return new Response();
  });
  const payload = items => () => ({ notification: { item_count: items }, abandoned: { action: "upsert", items } });
  const a = createCartHeartbeat(nova.id, nova.slug);
  a.schedule(payload(1));
  t.mock.timers.tick(1499);
  a.cancel();
  t.mock.timers.tick(1);
  assert.equal(calls.length, 0);

  const b = createCartHeartbeat(omar.id, omar.slug);
  b.schedule(payload(2));
  b.schedule(payload(3));
  t.mock.timers.tick(1500);
  assert.deepEqual(calls.map(c => [c.url, c.body.storeId, c.body.items ?? c.body.item_count]), [
    ["/s/omar-a7a/api/notifications/cart-heartbeat", omar.id, 3], ["/s/omar-a7a/api/abandoned-cart", omar.id, 3],
  ]);
  assert.ok(calls.every(c => !c.signal.aborted));
  b.cancel();
  assert.ok(calls.every(c => c.signal.aborted));
});

test("recovery supersedes the pending heartbeat, stays pinned, and aborts on unmount", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  t.mock.method(globalThis, "fetch", (url, init) => {
    calls.push({ url, ...init });
    return new Promise(resolve => init.signal.addEventListener("abort", () => resolve(new Response()), { once: true }));
  });
  const cart = createCartHeartbeat(nova.id, nova.slug);
  cart.schedule(() => assert.fail("superseded cart was sent"));
  const done = cart.recover({ session_key: "synthetic-session", order_id: omar.id });
  t.mock.timers.tick(1500);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/s/nova-store/api/abandoned-cart");
  assert.deepEqual(JSON.parse(calls[0].body), {
    session_key: "synthetic-session", order_id: omar.id, action: "recover", storeId: nova.id,
  });
  cart.cancel();
  assert.equal(calls[0].signal.aborted, true);
  await done;
});

test("the cart provider releases scheduled and in-flight work on switch, pagehide and unmount", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const window = new EventTarget();
  for (const [name, value] of [["window", window], ["document", { documentElement: { lang: "ar" } }]]) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (old) Object.defineProperty(globalThis, name, old); else delete globalThis[name]; });
  }
  const calls = [];
  t.mock.method(globalThis, "fetch", (url, init) => {
    calls.push({ url, signal: init.signal });
    return new Promise(resolve => init.signal.addEventListener("abort", () => resolve(new Response()), { once: true }));
  });
  // Provide isolated Web Storage for the cart and session IDs.
  const storage = new Map();
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    get length() { return storage.size; }, key: i => [...storage.keys()][i], getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  } });
  t.after(() => { if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage); else delete globalThis.localStorage; });
  let release;
  const { CartTenantProvider, clearCart } = loadSource("components/shop/cart-store.ts", {
    react: { createContext: () => ({}), createElement() {}, useMemo: fn => fn(), useLayoutEffect: fn => { release = fn(); } },
    "@/lib/cart-heartbeat": { createCartHeartbeat }, "@/lib/supabase/browser": {}, "@/lib/variant-stock": {},
    "@/lib/flash-sale": {}, "./studio-preview-context": {},
  });
  CartTenantProvider({ storeId: nova.id, slug: nova.slug });
  clearCart(nova.id);
  release();
  CartTenantProvider({ storeId: omar.id, slug: omar.slug });
  clearCart(nova.id);
  clearCart(omar.id);
  t.mock.timers.tick(1500);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.url.startsWith("/s/omar-a7a/") && !c.signal.aborted));
  window.dispatchEvent(new Event("pagehide"));
  assert.ok(calls.every(c => c.signal.aborted));
  clearCart(omar.id);
  t.mock.timers.tick(1500);
  assert.equal(calls.length, 4);
  release();
  assert.ok(calls.every(c => c.signal.aborted));
});

function cartRequest(boundId, body) {
  return new Request("https://store.example/api/abandoned-cart", {
    method: "POST", headers: boundId ? { [tenant.STORE_ID_HEADER]: boundId } : {}, body: JSON.stringify(body),
  });
}

test("both cart endpoints reject a missing or mismatched store before opening any database client", async () => {
  let clients = 0;
  const forbidden = () => { clients++; throw new Error("unexpected database access"); };
  const imports = { "@/lib/tenant-shared": tenant, "@/lib/db": { serverDb: forbidden }, "@/lib/supabase/admin": { adminDb: forbidden } };
  for (const file of ["api/abandoned-cart", "api/notifications/cart-heartbeat"]) {
    const { POST } = loadSource("app/" + file + "/route.ts", imports);
    for (const action of ["upsert", "recover"]) {
      for (const [bound, intended] of [[nova.id, omar.id], [null, nova.id], [nova.id, undefined], [nova.id, null]]) {
        assert.equal((await POST(cartRequest(bound, { storeId: intended, action }))).status, 403);
      }
    }
  }
  assert.equal(clients, 0);
});

test("matching cart writes and recovery pass the proxy store to their RPCs", async () => {
  const calls = [];
  const { POST } = loadSource("app/api/abandoned-cart/route.ts", {
    "@/lib/tenant-shared": tenant,
    "@/lib/db": { serverDb: async () => ({ rpc: (name, args) => { calls.push([name, args.p_store_id]); return { error: null }; } }) },
  });
  for (const store of [nova, omar]) {
    for (const action of ["upsert", "recover"]) {
      assert.equal((await POST(cartRequest(store.id, { storeId: store.id, action, session_key: "x".repeat(32) }))).status, 200);
    }
  }
  assert.deepEqual(calls, [nova, omar].flatMap(store => [
    ["upsert_abandoned_cart", store.id], ["mark_abandoned_cart_recovered", store.id],
  ]));
});
