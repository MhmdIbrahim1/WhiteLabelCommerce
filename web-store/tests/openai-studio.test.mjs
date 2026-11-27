import test from "node:test";
import assert from "node:assert/strict";
import * as security from "../src/lib/security.ts";
import { quotaFailure } from "../src/lib/billing.ts";
import { loadSource } from "./helpers/load-source.mjs";

const studio = loadSource("lib/openai-studio.ts", { "server-only": {}, "./security": security });
const category = { id: crypto.randomUUID(), name: "حقائب", name_en: "Bags", slug: "bags" };
const draft = {
  name_ar: "حقيبة سوداء", name_en: "Black bag", slug: " Black  BAG -- Mini! ",
  description_ar: "حقيبة سوداء بمقبضين.", description_en: "A black bag with two handles.",
  category_id: category.id, colors_ar: ["أسود"], colors_en: ["Black", " Black "],
  specifications: [
    { key_ar: " اللون ", key_en: " Color ", value_ar: " أسود ", value_en: " Black " },
    { key_ar: "المقابض", key_en: "Handles", value_ar: "مقبضان", value_en: " Two   handles " },
  ],
};
const parse = (overrides = {}) => studio.parseProductStudioDraft(JSON.stringify({ ...draft, ...overrides }), [category]);

test("studio drafts normalize bilingual copy, slug, colors and specification rows", () => {
  const parsed = parse();
  assert.equal(parsed.slug, "black-bag-mini");
  assert.deepEqual(parsed.colors_en, ["Black"]);
  assert.equal(parsed.specifications[0].key_ar, "اللون");
  assert.equal(parsed.specifications[1].value_en, "Two handles");
  assert.equal(parsed.category_id, category.id);
  assert.equal(parse({ category_id: crypto.randomUUID() }).category_id, null);
  assert.deepEqual(parse({ category_id: null, colors_ar: undefined }).colors_ar, []);
});

test("schema validation rejects malformed, incomplete, oversized and wrongly typed draft output", () => {
  assert.throws(() => studio.parseProductStudioDraft("broken", [category]));
  assert.throws(() => studio.parseProductStudioDraft("null", [category]));
  for (const change of [
    { name_en: "x" }, { name_ar: "م".repeat(101) }, { slug: "!!!" }, { description_en: "e".repeat(601) },
    { category_id: 5 }, { colors_ar: ["أحمر", {}] }, { id: "unexpected" }, { specifications: [{}] },
    { specifications: [draft.specifications[0], { ...draft.specifications[1], value_ar: null }] },
    { specifications: Array(7).fill(draft.specifications[0]) },
  ]) assert.throws(() => parse(change), JSON.stringify(change));
});

test("studio accepts precisely the three curated preset values", () => {
  for (const value of ["crisp_white", "warm_editorial", "executive_dark"]) assert.equal(studio.isStudioPreset(value), true);
  for (const value of [null, {}, "constructor", "__proto__", "", " warm_editorial", "autumn"]) {
    assert.equal(studio.isStudioPreset(value), false);
  }
});

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jArcAAAAASUVORK5CYII=", "base64");
const image = () => new File([png], "photo.png", { type: "image/png" });

test("provider wire requests include their deadlines, strict vision schema and selected studio lighting", async t => {
  const calls = [];
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", ms => { calls.push(ms); return timeout(ms); });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, "error");
    if (url.endsWith("/chat/completions")) {
      const body = JSON.parse(options.body);
      const schema = body.response_format.json_schema;
      assert.equal(schema.strict, true);
      assert.equal(schema.schema.additionalProperties, false);
      assert.ok(schema.schema.required.includes("specifications"));
      const content = body.messages[1].content;
      assert.equal(JSON.parse(content[0].text).categories[0].id, category.id);
      assert.equal(content[1].image_url.url, "data:image/png;base64," + png.toString("base64"));
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(draft) } }] });
    }
    assert.ok(url.endsWith("/images/edits"));
    assert.equal(options.body.get("size"), "1024x1024");
    assert.equal(options.body.get("output_format"), "webp");
    assert.match(options.body.get("prompt"), /charcoal/);
    assert.equal(options.body.get("image").type, "image/png");
    return Response.json({ data: [{ b64_json: png.toString("base64") }] });
  });
  assert.deepEqual(await studio.generateProductDraft(image(), "Two handles", [category]), parse());
  assert.deepEqual(await studio.generateStudioPhoto(image(), "executive_dark"), {
    mime: "image/png", imageDataUrl: "data:image/png;base64," + png.toString("base64"),
  });
  assert.deepEqual(calls, [45_000, 90_000]);
});

test("refused and truncated vision results or invalid image bytes are provider failures", async t => {
  let result;
  t.mock.method(globalThis, "fetch", async () => Response.json(result));
  for (const choice of [
    { finish_reason: "length", message: { content: JSON.stringify(draft) } },
    { finish_reason: "stop", message: { refusal: "declined" } },
    { finish_reason: "stop", message: { content: "not JSON" } },
  ]) {
    result = { choices: [choice] };
    await assert.rejects(studio.generateProductDraft(image(), "", []));
  }
  for (const value of ["", "PHN2Zy8+", png.toString("base64") + "%"]) {
    result = { data: [{ b64_json: value }] };
    await assert.rejects(studio.generateStudioPhoto(image(), "crisp_white"));
  }
});

function routeFixture({ enabled = true, rejected = null, providerFails = false, retrySettle = false } = {}) {
  const calls = [];
  const store = crypto.randomUUID(), user = crypto.randomUUID(), reservation = crypto.randomUUID();
  const db = {
    rpc(name, args) {
      calls.push([name, args]);
      if (name === "reserve_ai_quota") {
        return { error: rejected, data: { reservation_id: reservation, used: 2, cap: 5 } };
      }
      assert.equal(name, "settle_ai_quota");
      assert.equal(args.p_reservation_id, reservation);
      return { async abortSignal(signal) {
        assert.ok(signal instanceof AbortSignal);
        if (retrySettle && calls.filter(([name]) => name === "settle_ai_quota").length === 1) {
          throw new Error("Unacknowledged settlement");
        }
        return { error: null, data: { status: args.p_outcome } };
      } };
    },
  };
  const { studioRequest } = loadSource("app/api/admin/ai/studio-request.ts", {
    "@/app/admin/products/catalog-data": { catalogCategories: async context => {
      assert.equal(context.storeId, store);
      return [category];
    } },
    "@/lib/billing": { quotaFailure },
    "@/lib/db": { requireAdmin: async permission => {
      assert.equal(permission, "manage_products");
      return { storeId: store, user: { id: user } };
    } },
    "@/lib/openai-studio": { ...studio, isAiStudioEnabled: () => enabled,
      generateProductDraft: async () => {
        calls.push(["generate"]);
        if (providerFails) throw new Error("provider failure");
        return parse();
      },
    },
    "@/lib/password-policy": { matchesRequestOrigin: r => r.headers.get("origin") === new URL(r.url).origin },
    "@/lib/security": security,
    "@/lib/supabase/admin": { adminDb: () => db },
  });
  async function send({ resource = "ai_autofills", origin = "https://merchant.test", ...fields } = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ storeId: store, image: image(), ...fields })) form.set(key, value);
    return studioRequest(new Request("https://merchant.test/api/admin/ai", { method: "POST", headers: { origin }, body: form }), resource);
  }
  return { send, calls, store, user };
}

test("origin, key, store, image, hint and curated preset are checked before reserving any usage", async () => {
  const h = routeFixture();
  for (const [fields, status] of [
    [{ origin: "https://different.example" }, 403], [{ storeId: crypto.randomUUID() }, 409],
    [{ image: new File(["ordinary text"], "photo.png", { type: "image/png" }) }, 400],
    [{ image: new File([png], "photo.jpg", { type: "image/jpeg" }) }, 400],
    [{ image: new File([png, new Uint8Array(4 * 1024 * 1024)], "photo.png", { type: "image/png" }) }, 400],
    [{ image: new File([png, new Uint8Array(5 * 1024 * 1024)], "photo.png", { type: "image/png" }) }, 400],
    [{ hint: "x".repeat(201) }, 400], [{ resource: "ai_studio_images", preset: "unknown" }, 400],
  ]) assert.equal((await h.send(fields)).status, status);
  assert.deepEqual(h.calls, []);
  const off = routeFixture({ enabled: false });
  assert.equal((await off.send()).status, 503);
  assert.deepEqual(off.calls, []);
});

test("successful and failed AI calls settle exactly one reservation and retry an unacknowledged settlement", async () => {
  for (const failed of [false, true]) {
    const h = routeFixture({ providerFails: failed, retrySettle: true });
    const response = await h.send({ hint: " Cotton " });
    assert.equal(response.status, failed ? 502 : 200);
    const result = await response.json();
    if (failed) assert.deepEqual(result, { ok: false, code: "ai_failed" });
    else assert.deepEqual(result, { ok: true, draft: parse(), quota: { used: 2, cap: 5 } });
    assert.deepEqual(h.calls.map(([name]) => name), ["reserve_ai_quota", "generate", "settle_ai_quota", "settle_ai_quota"]);
    assert.deepEqual(h.calls[0][1], { p_store: h.store, p_user: h.user, p_resource: "ai_autofills" });
    assert.equal(h.calls[2][1].p_outcome, failed ? "refunded" : "completed");
    assert.deepEqual(h.calls[2], h.calls[3]);
  }
});

test("cap and burst rejections return actionable HTTP responses without calling the provider", async () => {
  const limited = routeFixture({ rejected: { code: "PT409", message: "plan_limit_reached",
    details: JSON.stringify({ code: "plan_limit_reached", resource: "ai_autofills", current: 5, limit: 5 }) } });
  const response = await limited.send();
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, code: "plan_limit_reached", used: 5, cap: 5 });
  const burst = routeFixture({ rejected: { code: "PT429", message: "ai_rate_limited" } });
  const rateLimited = await burst.send();
  assert.equal(rateLimited.status, 429);
  assert.deepEqual(await rateLimited.json(), { ok: false, code: "rate_limited" });
  for (const h of [limited, burst]) assert.deepEqual(h.calls.map(([name]) => name), ["reserve_ai_quota"]);
});
