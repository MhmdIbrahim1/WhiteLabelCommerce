import assert from "node:assert/strict";
import test from "node:test";
import { resolveMerchantStorefrontUrl, storefrontUrlLabel } from "../src/lib/host-routing.ts";

const previewHost = "shopstage-phase-3b.vercel.app";
const previewOrigin = "https://" + previewHost;

function assertStorefront({ slug = "nova-store", primaryDomain = null, requestOrigin = previewOrigin, env = {} }, href, label) {
  const resolved = resolveMerchantStorefrontUrl(slug, primaryDomain, requestOrigin, env);
  assert.equal(resolved, href);
  assert.equal(storefrontUrlLabel(resolved), label);
}

test("the store's verified primary domain wins over the platform root and preview host", () => {
  assertStorefront({
    primaryDomain: "shop.merchant.example",
    env: { PLATFORM_ROOT_DOMAIN: "shopstage.live", VERCEL_ENV: "preview" },
  }, "https://shop.merchant.example", "shop.merchant.example");
});

test("an explicit public platform root wins on preview and local requests", () => {
  for (const requestOrigin of [previewOrigin, "http://localhost:3000"]) {
    assertStorefront({
      slug: "omar-a7a", requestOrigin, env: { PLATFORM_ROOT_DOMAIN: "shopstage.live", VERCEL_ENV: "preview" },
    }, "https://omar-a7a.shopstage.live", "omar-a7a.shopstage.live");
  }
});

test("Vercel without a configured root uses the exact request host and store path", () => {
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL: "1" }, { VERCEL_ENV: "production" }]) {
    assertStorefront({ env }, previewOrigin + "/s/nova-store", previewHost + "/s/nova-store");
  }
});

test("any public request host keeps its store path when the platform root is absent or local", () => {
  for (const env of [{}, { PLATFORM_ROOT_DOMAIN: "localhost" }, { NEXT_PUBLIC_ROOT_DOMAIN: "https://legacy.example" }]) {
    assertStorefront({
      slug: "omar-a7a", requestOrigin: "https://studio.merchant.example", env,
    }, "https://studio.merchant.example/s/omar-a7a", "studio.merchant.example/s/omar-a7a");
  }
});

test("local development uses the store subdomain and preserves the request port", () => {
  const env = { NODE_ENV: "development" };
  assertStorefront({ requestOrigin: "http://localhost:3000", env }, "http://nova-store.localhost:3000", "nova-store.localhost:3000");
  assertStorefront({ requestOrigin: "http://127.0.0.1:4100", env }, "http://nova-store.localhost:4100", "nova-store.localhost:4100");
});

test("each deployment flag suppresses localhost even when the proxy origin is loopback", () => {
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "production" }, { VERCEL: "1" }, { NODE_ENV: "production" }]) {
    for (const requestOrigin of ["http://localhost:3000", "http://nova-store.localhost:3000", "http://[::1]:3000"]) {
      assertStorefront({
        requestOrigin, primaryDomain: "nova-store.localhost", env: { ...env, PLATFORM_ROOT_DOMAIN: "localhost" },
      }, "/s/nova-store", "/s/nova-store");
    }
  }
});

test("an unavailable request origin leaves a usable relative storefront link and label", () => {
  for (const requestOrigin of [null, "invalid origin"]) {
    assertStorefront({ requestOrigin, env: { VERCEL_ENV: "preview" } }, "/s/nova-store", "/s/nova-store");
  }
});
