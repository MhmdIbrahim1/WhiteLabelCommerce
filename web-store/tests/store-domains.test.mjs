import test from "node:test";
import assert from "node:assert/strict";
import { classifyHost, customDomain, isStoreSlug, normalizeHost, platformOrigin, platformRootDomain, publicStoreOrigin, requestAuthority, resolveStoreBinding, storePath, subdomainOrigin } from "../src/lib/host-routing.ts";
import { HostRouteCache } from "../src/lib/host-cache.ts";
import { matchesDomainTxt, verifyDomainTxt } from "../src/lib/domain-dns.ts";
import { storeHref, tenantAuthEntry } from "../src/lib/tenant-shared.ts";

const root = "platform.example";
const name = "shop.merchant.example";
const token = "ab".repeat(32);
const txt = "wlc-verification=" + token;

test("normalizes DNS case and a single root dot, retaining local ports", () => {
  assert.deepEqual(normalizeHost("Nova-Store.Localhost.:3000"), { hostname: "nova-store.localhost", authority: "nova-store.localhost:3000" });
  assert.equal(normalizeHost("XN--BCHER-KVA.Example.").hostname, "xn--bcher-kva.example");
  assert.equal(normalizeHost("[::1]:3000").authority, "[::1]:3000");
  assert.equal(normalizeHost("127.0.0.1:3000").authority, "127.0.0.1:3000");
});

test("requires one ASCII authority with DNS labels and a valid port", () => {
  for (const input of [null, "", " shop.example", "shop.example\t", "a,b.example", "shop.example/path",
    "https://shop.example", "user@shop.example", "shop.example#x", "shop.example\\path",
    "shop%2Eexample", "bad..example", "host.example..", "-shop.example", "shop-.example", "a".repeat(64) + ".example",
    "shop.example:3000", "localhost:65536", "localhost:0", "localhost:", "localhost:2:3", "127.1", "127.0.0.2",
    "[2001:db8::1]", "shöp.example", "a_b.example", "localhost\r\n"]) {
    assert.equal(normalizeHost(input), null, JSON.stringify(input));
  }
});

test("forwarded authority must agree with Host, including the local port", () => {
  assert.equal(requestAuthority(name, null)?.hostname, name);
  assert.equal(requestAuthority(name, name.toUpperCase() + ".")?.hostname, name);
  for (const [host, forwarded] of [[null, name], [name, root], [name, name + ", " + root], [name, ""],
    ["localhost:3000", "localhost:4000"]]) assert.equal(requestAuthority(host, forwarded), null);
});

test("explicit root configuration is strict and the legacy root accepts its previous origin form", () => {
  assert.equal(platformRootDomain("", ""), "localhost");
  assert.equal(platformRootDomain("Platform.Example.", "legacy.example"), root);
  assert.equal(platformRootDomain("", "https://Platform.Example/app"), root);
  assert.throws(() => platformRootDomain("https://" + root, ""));
  assert.throws(() => platformRootDomain("", "https://user@" + root));
});

test("each reserved label is blocked on platform and local subdomains", () => {
  for (const label of ["www", "app", "admin", "api", "auth", "mail", "billing", "support", "docs", "status", "cdn", "static", "assets"]) {
    assert.equal(isStoreSlug(label), false);
    assert.equal(classifyHost(label + "." + root, root, true), null);
    assert.equal(classifyHost(label + ".localhost", root, true), null);
    assert.equal(storePath("/store/" + label), "invalid");
  }
});

test("classifies only exact apexes, single tenant labels and full custom DNS names", () => {
  assert.equal(classifyHost(root, root, false), "platform");
  assert.equal(classifyHost("localhost", root, true), "platform");
  assert.equal(classifyHost("localhost", root, false), null);
  for (const suffix of [root, "localhost"]) {
    assert.deepEqual(classifyHost("nova-store." + suffix, root, true), { kind: "slug", value: "nova-store" });
    assert.equal(classifyHost("one.two." + suffix, root, true), null);
  }
  const unrelated = "nova-store." + name;
  assert.deepEqual(classifyHost(unrelated, root, true), { kind: "domain", value: unrelated });
  assert.equal(classifyHost("nova-store.localhost", root, false), null);
});

test("custom domain validation reserves the platform namespace and DNS challenge label space", () => {
  assert.equal(customDomain("WWW.Merchant.Example.", root), "www.merchant.example");
  for (const invalid of [root, "nova-store." + root, "deep.nova." + root, "localhost", "shop.local",
    "shop.internal", "home.arpa", "a.home.arpa", "192.0.2.1", "www", "localhost:3000", name + ":443"]) {
    assert.equal(customDomain(invalid, root), null, invalid);
  }
  const prefix = ("a".repeat(63) + ".").repeat(3);
  assert.equal(customDomain(prefix + "b".repeat(49), root)?.length, 241);
  assert.equal(customDomain(prefix + "b".repeat(50), root), null);
});

test("canonical subdomain origins preserve the dev port and use the configured public apex", () => {
  assert.equal(subdomainOrigin("omar-a7a", platformOrigin(normalizeHost("nova-store.localhost:3000"), root)), "http://omar-a7a.localhost:3000");
  assert.equal(subdomainOrigin("omar-a7a", platformOrigin(normalizeHost(name), root)), "https://omar-a7a." + root);
});

test("only an eligible primary changes the public share and canonical origin", () => {
  const route = { id: "1", slug: "omar-a7a", primaryDomain: name };
  assert.equal(publicStoreOrigin(route, "https://" + root, root), "https://" + name);
  for (const primaryDomain of [null, root, "admin." + root, "https://" + name]) {
    assert.equal(publicStoreOrigin({ ...route, primaryDomain }, "https://" + root, root), "https://omar-a7a." + root);
  }
});

test("an unknown custom host cannot fall through to a path, cookie or the default tenant", async () => {
  const key = { kind: "domain", value: name };
  const calls = [];
  const lookup = async target => { calls.push(target); return null; };
  assert.equal(await resolveStoreBinding(key, "nova-store", "omar-a7a", lookup), null);
  assert.deepEqual(calls, [key]);
});

test("tenant host ownership takes precedence and a path alias must identify the same store", async () => {
  const route = { id: "1", slug: "omar-a7a", primaryDomain: null };
  const host = { kind: "domain", value: name };
  const lookup = async key => { assert.deepEqual(key, host); return route; };
  assert.equal(await resolveStoreBinding(host, undefined, "nova-store", lookup), route);
  assert.equal(await resolveStoreBinding(host, "omar-a7a", "nova-store", lookup), route);
  assert.equal(await resolveStoreBinding(host, "nova-store", "nova-store", lookup), null);
  const pathLookup = async key => { assert.deepEqual(key, { kind: "slug", value: "omar-a7a" }); return route; };
  assert.equal(await resolveStoreBinding("platform", "omar-a7a", "nova-store", pathLookup), route);
  assert.equal(await resolveStoreBinding("platform", undefined, "admin", async () => assert.fail("unexpected lookup")), null);
});

test("both fallback prefixes preserve shopper navigation, search and auth return paths", () => {
  for (const prefix of ["/store", "/s"]) {
    const base = prefix + "/omar-a7a";
    assert.deepEqual(storePath(base), { slug: "omar-a7a", pathname: "/", basePath: base });
    assert.equal(storePath(base + "/api/catalog-search").pathname, "/api/catalog-search");
    assert.equal(storeHref(base, "/cart"), base + "/cart");
    assert.equal(storeHref(base, "/"), base);
    assert.equal(tenantAuthEntry("", "/login", base + "/orders"), base + "/login?next=" + encodeURIComponent(base + "/orders"));
    assert.equal(tenantAuthEntry(base, "/login", base + "/orders"), null);
    for (const path of ["/admin/settings", "/api/admin/mobile-builds", "/super-admin", "/create-store", "//other", "/platform-landing", "/platform-redirect"]) {
      assert.equal(storePath(base + path), "invalid");
    }
  }
  assert.equal(storePath("/admin"), null);
  assert.equal(storePath("/store"), "invalid");
});

function database() {
  let revision = 1;
  const values = new Map();
  const lookups = [];
  return {
    lookups,
    mutate(key, slug, primary = null) { values.set(key, slug && { slug, primary }); revision++; },
    read(key, known) {
      const unchanged = known === String(revision);
      if (!unchanged) lookups.push(key);
      const row = unchanged ? null : values.get(key);
      return { route_revision: String(revision), unchanged, store_id: row ? "id-" + row.slug : null,
        slug: row?.slug ?? null, primary_domain: row?.primary ?? null };
    },
  };
}

test("positive hits skip the indexed lookup and expire exactly at 60 seconds", async () => {
  let now = 0;
  const cache = new HostRouteCache(2, () => now);
  const db = database();
  db.mutate(name, "nova-store");
  const read = () => cache.resolve(name, revision => db.read(name, revision));
  assert.equal((await read()).slug, "nova-store");
  now = 59_999;
  assert.equal((await read()).slug, "nova-store");
  now++;
  await read();
  assert.equal(db.lookups.length, 2);
});

test("negative hits expire exactly at 15 seconds", async () => {
  let now = 100;
  const cache = new HostRouteCache(2, () => now);
  const db = database();
  const read = () => cache.resolve(name, revision => db.read(name, revision));
  assert.equal(await read(), null);
  now += 14_999;
  assert.equal(await read(), null);
  now++;
  assert.equal(await read(), null);
  assert.equal(db.lookups.length, 2);
});

test("LRU evicts the least recently used entry, including negative entries", async () => {
  const db = database();
  const cache = new HostRouteCache(2);
  for (const key of ["a", "b", "a", "c", "a", "b"]) await cache.resolve(key, rev => db.read(key, rev));
  assert.deepEqual(db.lookups, ["a", "b", "c", "b"]);
});

test("committed revisions invalidate positive, negative and primary-domain entries on independent workers", async () => {
  const db = database();
  const workers = [new HostRouteCache(), new HostRouteCache()];
  const readBoth = () => Promise.all(workers.map(cache => cache.resolve(name, rev => db.read(name, rev))));
  assert.deepEqual(await readBoth(), [null, null]);
  db.mutate(name, "omar-a7a");
  for (const route of await readBoth()) assert.equal(route.slug, "omar-a7a");
  db.mutate(name, "omar-a7a", name);
  for (const route of await readBoth()) assert.equal(route.primaryDomain, name);
  db.mutate(name, null);
  assert.deepEqual(await readBoth(), [null, null]);
});

test("a late lookup cannot replace a newer cached revision and a failed check cannot serve a cached tenant", async () => {
  const db = database(), cache = new HostRouteCache();
  let finish;
  const slow = cache.resolve(name, rev => {
    const snapshot = db.read(name, rev);
    return new Promise(resolve => { finish = () => resolve(snapshot); });
  });
  db.mutate(name, "nova-store");
  await cache.resolve(name, rev => db.read(name, rev));
  finish();
  assert.equal(await slow, null);
  const read = await cache.resolve(name, rev => db.read(name, rev));
  assert.equal(read.slug, "nova-store");
  assert.equal(db.lookups.length, 2);
  await assert.rejects(cache.resolve(name, () => Promise.reject(new Error("unavailable"))), /unavailable/);
});

test("TXT parsing joins chunks inside one record and requires an exact case-sensitive match", () => {
  assert.equal(matchesDomainTxt([["unrelated"], [txt.slice(0, 19), txt.slice(19)]], token), true);
  for (const records of [[], [[txt.slice(0, 19)], [txt.slice(19)]], [[txt.toUpperCase()]], [[txt + " "]], [[token]], [[txt + "0"]]]) {
    assert.equal(matchesDomainTxt(records, token), false);
  }
  assert.equal(matchesDomainTxt([["wlc-verification="]], ""), false);
});

test("DNS verification queries only the fully qualified TXT challenge and classifies resolver errors", async () => {
  const success = { resolveTxt: async host => { assert.equal(host, "_wlc-verify." + name + "."); return [[txt]]; }, cancel() {} };
  assert.equal(await verifyDomainTxt(name, token, success), null);
  for (const [code, expected] of [["ENODATA", "txt_missing"], ["ENOTFOUND", "txt_missing"], ["ETIMEOUT", "dns_timeout"], ["ESERVFAIL", "dns_failed"]]) {
    const resolver = { resolveTxt: async () => { throw Object.assign(new Error(), { code }); }, cancel() {} };
    assert.equal(await verifyDomainTxt(name, token, resolver), expected);
  }
});

test("the DNS deadline cancels a nonresponsive resolver", async () => {
  let cancellations = 0;
  const resolver = { resolveTxt: () => new Promise(() => {}), cancel() { cancellations++; } };
  assert.equal(await verifyDomainTxt(name, token, resolver, 5), "dns_timeout");
  assert.equal(cancellations, 1);
});
