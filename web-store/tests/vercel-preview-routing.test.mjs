import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHost, platformAuthScreen, requestAuthority, resolveRequestHost, resolveStoreBinding, storePath } from "../src/lib/host-routing.ts";

const root = "shopstage.live";
const deployment = "commerce-git-phase-3b-team.vercel.app";
const merchant = { id: "id-nova", slug: "nova-store", primaryDomain: null };

test("an unregistered Vercel preview host serves the landing, workspace and scoped alias under the platform classification", async () => {
  const lookups = [];
  const lookup = async key => { lookups.push(key); return key.kind === "slug" && key.value === merchant.slug ? merchant : null; };
  const normalized = requestAuthority(deployment.toUpperCase() + ":443", deployment + ":443");
  const { host } = await resolveRequestHost(normalized.hostname, root, false, "preview", lookup);
  assert.equal(host, "platform");
  assert.equal(storePath("/"), null);
  assert.equal(storePath("/admin/customizer"), null);
  assert.equal(platformAuthScreen(host === "platform", false, "/login"), "login");
  const alias = storePath("/s/nova-store/products");
  assert.equal(await resolveStoreBinding(host, alias.slug, null, lookup), merchant);
  assert.equal(await resolveStoreBinding(host, "unregistered", "nova-store", lookup), null);
  assert.deepEqual(lookups, [{ kind: "domain", value: deployment }, { kind: "slug", value: "nova-store" }, { kind: "slug", value: "unregistered" }]);
});

test("a verified merchant binding on vercel.app wins before preview fallback and rejects a foreign path alias", async () => {
  const owner = { id: "id-omar", slug: "omar-a7a", primaryDomain: deployment };
  const key = { kind: "domain", value: deployment };
  const lookup = async candidate => { assert.deepEqual(candidate, key); return owner; };
  const result = await resolveRequestHost(deployment, root, false, "preview", lookup);
  assert.deepEqual(result.host, key);
  assert.equal(result.registered, owner);
  const noSecondRead = () => assert.fail("a verified route was already returned with this request");
  assert.equal(await resolveStoreBinding(result.host, undefined, merchant.slug, noSecondRead, result.registered), owner);
  assert.equal(await resolveStoreBinding(result.host, merchant.slug, merchant.slug, noSecondRead, result.registered), null);
  await assert.rejects(resolveRequestHost(deployment, root, false, "preview", async () => { throw new Error("unavailable"); }), /unavailable/);
});

test("production, unset and development never promote an unmapped Vercel deployment; verified bindings still work", async () => {
  for (const env of ["production", undefined, "development", "Preview", ""]) {
    const result = await resolveRequestHost(deployment, root, false, env, () => assert.fail("preview lookup invoked"));
    assert.deepEqual(result.host, { kind: "domain", value: deployment });
    assert.equal(await resolveStoreBinding(result.host, merchant.slug, merchant.slug, async () => null), null);
    assert.equal(await resolveStoreBinding(result.host, undefined, null, async () => merchant), merchant);
    assert.equal((await resolveRequestHost(deployment, deployment, false, env, () => assert.fail())).host, null);
  }
});

test("the platform apex, tenant namespace, localhost and unrelated custom domains retain routing parity in every environment", async () => {
  for (const env of ["preview", "production", undefined]) {
    const lookup = () => assert.fail("only preview deployment hosts need an early ownership lookup");
    for (const [name, expected] of [[root, "platform"], ["nova-store." + root, { kind: "slug", value: merchant.slug }],
      ["unknown-shop." + root, { kind: "slug", value: "unknown-shop" }], ["www." + root, null], ["nested.tenant." + root, null],
      ["vercel.app", { kind: "domain", value: "vercel.app" }], ["notvercel.app", { kind: "domain", value: "notvercel.app" }],
      ["demo.vercel.app.example.org", { kind: "domain", value: "demo.vercel.app.example.org" }],
      ["custom.example.org", { kind: "domain", value: "custom.example.org" }], ["localhost", null]]) {
      const { host } = await resolveRequestHost(name, root, false, env, lookup);
      assert.deepEqual(host, expected);
      if (typeof host === "object" && host !== null && name !== "nova-store." + root) {
        assert.equal(await resolveStoreBinding(host, merchant.slug, merchant.slug, async () => null), null);
      }
    }
    assert.equal((await resolveRequestHost("localhost", root, true, env, lookup)).host, "platform");
  }
  assert.equal(requestAuthority(deployment, root), null);
  assert.equal(normalizeHost(deployment + "/admin"), null);
});
