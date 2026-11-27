import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import * as flow from "../src/lib/auth-flow.ts";
import * as otp from "../src/lib/email-otp.ts";
import * as routing from "../src/lib/host-routing.ts";
import * as tenant from "../src/lib/tenant-shared.ts";
import * as i18n from "../src/lib/i18n.ts";
import { loadSource } from "./helpers/load-source.mjs";
import { replaceGlobal } from "./helpers/auth-view.mjs";

const id = tenant.DEFAULT_STORE_ID, slug = "nova-store", base = "/s/" + slug;
const user = { id: "buyer", email: "buyer@example.test", email_confirmed_at: "2026-01-01" };
const verified = { data: { user, session: { user } } };
const membership = loadSource("lib/storefront-auth.ts", {
  "next/headers": {}, "@/lib/tenant": {}, "@/lib/tenant-shared": tenant, "@/lib/auth-flow": flow,
});

test("proxy binds the actual apex, alias, subdomain or custom surface and serves legal pages independently", async t => {
  const root = process.env.PLATFORM_ROOT_DOMAIN;
  process.env.PLATFORM_ROOT_DOMAIN = "shopstage.live";
  t.after(() => { if (root === undefined) delete process.env.PLATFORM_ROOT_DOMAIN; else process.env.PLATFORM_ROOT_DOMAIN = root; });
  let lookups = 0;
  const { proxy } = loadSource("proxy.ts", { "@/lib/host-routing": routing, "@/lib/tenant-shared": tenant, "@/lib/i18n": i18n,
    "@/lib/access": {}, "@/lib/host-resolver": { resolveHostRoute: () => { lookups++; return { id, slug }; } },
    "@supabase/ssr": { createServerClient: () => ({}) } });
  for (const [host, prefix, expected] of [
    ["shopstage.live", "", "platform"], ["shopstage.live", base, "storefront"], ["shopstage.live", "/store/" + slug, "storefront"],
    ["nova-store.shopstage.live", "", "storefront"], ["merchant.example", "", "storefront"],
  ]) {
    const headers = { host, [tenant.PLATFORM_SURFACE_HEADER]: expected === "platform" ? "storefront" : "platform" };
    const response = await proxy(new NextRequest("https://" + host + prefix + "/auth/callback", { headers }));
    assert.equal(response.headers.get("x-middleware-request-" + tenant.PLATFORM_SURFACE_HEADER), expected);
    assert.equal(response.headers.get("x-middleware-request-" + tenant.STORE_BASE_PATH_HEADER), prefix);
  }
  const before = lookups;
  for (const path of ["/privacy", "/terms"]) {
    const response = await proxy(new NextRequest("https://shopstage.live" + path, { headers: { host: "shopstage.live" } }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-request-" + tenant.STORE_ID_HEADER), null);
  }
  assert.equal(lookups, before);
});

test("OAuth cancellation, invalid exchanges and completions preserve the actual storefront or platform", async () => {
  let enrolled = false, result = verified, exchanges = 0;
  const db = { auth: { exchangeCodeForSession: () => { exchanges++; return result; } },
    rpc: (method, args) => { assert.equal(method, "store_customer_membership"); assert.deepEqual(args, { p_store_id: id }); return { data: { enrolled } }; } };
  const { GET } = loadSource("app/auth/callback/route.ts", {
    "@/lib/db": { serverDb: () => db }, "next/cache": { revalidatePath() {} }, "@/lib/storefront-auth": membership,
    "@/lib/auth-destination": { postAuthDestination: (_db, _user, next) => next || "/admin" },
    "@/lib/auth-flow": flow, "@/lib/tenant-shared": tenant,
  });
  async function path(surface, prefix, params) {
    const search = new URLSearchParams(params);
    const res = await GET(new Request("https://shop.example" + prefix + "/auth/callback?" + search, {
      headers: { [tenant.PLATFORM_SURFACE_HEADER]: surface, [tenant.STORE_BASE_PATH_HEADER]: prefix,
        [tenant.STORE_SLUG_HEADER]: slug, [tenant.STORE_ID_HEADER]: id },
    }));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    return res.headers.get("location");
  }
  const code = "00112233-4455-6677-8899-aabbccddeeff";
  assert.equal(await path("platform", "", { error: "access_denied", next: "//other.example" }), "/login?error=oauth_cancelled");
  assert.equal(await path("platform", "", { code: "short" }), "/login?error=oauth_failed");
  assert.equal(exchanges, 0);
  assert.equal(await path("platform", "", { code, next: "/create-store" }), "/create-store");
  for (const prefix of [base, "/store/" + slug, ""]) {
    enrolled = false;
    assert.equal(await path("storefront", prefix, { error: "server_error", next: "/admin" }), prefix + "/login?error=oauth_failed");
    for (const next of ["/create-store", "/admin/orders", "/super-admin", "/invite/token", "/s/other-store/orders", "//other.example", "/welcome"]) {
      assert.equal(await path("storefront", prefix, { code, next }), prefix + "/welcome");
    }
    assert.equal(await path("storefront", prefix, { code, next: "/orders" }), flow.welcomeHref(prefix, prefix + "/orders"));
    enrolled = true;
    assert.equal(await path("storefront", prefix, { code, next: "/orders" }), prefix + "/orders");
  }
  result = { data: { user, session: null }, error: null };
  assert.equal(await path("storefront", base, { code }), base + "/login?error=oauth_failed");
  result = { data: {}, error: { code: "bad_code_verifier" } };
  assert.equal(await path("platform", "", { code }), "/login?error=oauth_failed");
});

test("Google initiation keeps the browser origin, callback and sanitized intent together", async t => {
  const origin = "https://merchant.example";
  replaceGlobal(t, "window", { location: { origin } });
  let call;
  const { beginGoogleAuth } = loadSource("components/shop/google-auth-button.tsx", { "@/lib/auth-flow": flow,
    "@/lib/supabase/browser": { browserDb: () => ({ auth: { signInWithOAuth: input => { call = input; return {}; } } }) } });
  for (const [platform, prefix, next, expected] of [
    [false, base, "/admin", ""], [false, "", "/orders", "/orders"], [true, "", "/create-store", "/create-store"],
  ]) {
    assert.equal((await beginGoogleAuth(platform, prefix, next)).ok, true);
    assert.equal(call.provider, "google");
    const url = new URL(call.options.redirectTo);
    assert.equal(url.origin, origin); assert.equal(url.pathname, prefix + "/auth/callback");
    assert.equal(url.searchParams.get("next") || "", expected);
  }
});

test("storefront OTP can create a shopper only after a server-bound tenant check and verifies before membership", async () => {
  let store = null;
  const requests = [];
  const db = { auth: {
    signInWithOtp: args => { requests.push(args); return {}; }, verifyOtp: args => { requests.push(args); return verified; },
  }, rpc: (_name, args) => { requests.push(args); return { data: { enrolled: false } }; } };
  const handlers = loadSource("app/login/storefront-actions.ts", {
    "@/lib/tenant-shared": tenant, "@/lib/auth-flow": flow, "@/lib/email-otp": otp, "@/lib/db": { serverDb: () => db },
    "@/lib/storefront-auth": { ...membership, authStorefront: () => store }, "next/cache": { revalidatePath() {} },
  });
  assert.equal((await handlers.sendStorefrontEmailOtpAction(user.email)).ok, false);
  assert.equal((await handlers.verifyStorefrontEmailOtpAction(user.email, "012345", "/create-store")).ok, false);
  assert.deepEqual(requests, []);
  store = { basePath: base, id, slug };
  assert.equal((await handlers.sendStorefrontEmailOtpAction(user.email)).retryAfterSeconds, 60);
  assert.equal((await handlers.verifyStorefrontEmailOtpAction(user.email, "٠١٢-٣٤٥", "/create-store")).redirectTo, base + "/welcome");
  assert.deepEqual(requests, [
    { email: user.email, options: { shouldCreateUser: true, data: { signup_store_id: id } } },
    { email: user.email, token: "012345", type: "email" }, { p_store_id: id },
  ]);
});

test("onboarding accepts trimmed names, optional or normalized Egyptian phones, and rejects invalid profiles", () => {
  assert.deepEqual(flow.onboardingProfile("  Shopper  ", ""), { fullName: "Shopper", phone: "" });
  assert.deepEqual(flow.onboardingProfile("عميل", "+٢٠ ١٠١٢٣٤٥٦٧٨"), { fullName: "عميل", phone: "01012345678" });
  for (const bad of [" ", "X", "x".repeat(101)]) assert.equal(flow.onboardingProfile(bad, "").errorCode, "name");
  for (const bad of ["+", "-", "01", "00123456789", "01412345678"]) assert.equal(flow.onboardingProfile("Buyer", bad).errorCode, "phone");
});

test("welcome submits only for the verified identity displayed by the form", async () => {
  const writes = [];
  const db = { auth: { getUser: () => ({ data: { user } }) },
    rpc: (method, args) => { writes.push({ method, args }); return { error: null }; } };
  const { completeStoreOnboardingAction } = loadSource("app/login/storefront-actions.ts", {
    "@/lib/tenant-shared": tenant, "@/lib/auth-flow": flow, "@/lib/email-otp": otp,
    "@/lib/db": { serverDb: () => db }, "@/lib/storefront-auth": { authStorefront: () => ({ id, slug, basePath: base }) },
    "next/cache": { revalidatePath() {} },
  });
  for (const expected of ["previous-user", undefined]) {
    assert.deepEqual(await completeStoreOnboardingAction("Previous Name", "", "/orders", expected), { ok: false, errorCode: "account_changed" });
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(await completeStoreOnboardingAction("Current Name", "", "/orders", user.id), { ok: true, redirectTo: base + "/orders" });
  assert.deepEqual(writes, [{ method: "complete_store_customer_onboarding", args: {
    p_store_id: id, p_full_name: "Current Name", p_phone: "",
  } }]);
});

test("welcome prefill uses verified Google identity only during a Google OAuth session", async () => {
  const identity = { provider: "google", identity_data: { email: user.email, email_verified: true, full_name: "Google Name" } };
  const shopper = { ...user, identities: [identity], user_metadata: { full_name: "Another store" } };
  let amr = [{ method: "oauth", timestamp: 5 }];
  const db = { auth: { getClaims: () => ({ data: { claims: { sub: user.id, amr } } }) } };
  assert.equal(await membership.googleProfileName(db, shopper), "Google Name");
  assert.equal(await membership.googleProfileName(db, { ...shopper, identities: [identity, { provider: "github" }] }), "");
  for (amr of [[], [{ method: "otp", timestamp: 9 }, { method: "oauth", timestamp: 5 }]]) {
    assert.equal(await membership.googleProfileName(db, shopper), "");
  }
});
