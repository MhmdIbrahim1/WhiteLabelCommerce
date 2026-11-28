// From the repository root after building web-store, run node qa/ai_product_studio_browser.mjs.
// Headless Edge uses playwright-core from NODE_PATH and a loopback-only OpenAI provider.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const web = path.resolve("web-store"),
  require = createRequire(path.join(web, "package.json"));
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js"),
  { createServerClient } = require("@supabase/ssr");
const cfg = parseEnv(readFileSync(path.join(web, ".env.local"), "utf8").replace(/^\uFEFF/, ""));
const url = cfg.NEXT_PUBLIC_SUPABASE_URL,
  anon = cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ref = "zpabcnskkbpplurngtle",
  nova = "00000000-0000-0000-0000-000000000001",
  omar = "b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c";
assert.equal(new URL(url).hostname, ref + ".supabase.co");
assert.ok(process.env.SUPABASE_ACCESS_TOKEN, "Set SUPABASE_ACCESS_TOKEN before running studio QA.");
const service = createClient(url, cfg.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const base = "http://localhost:3000";
const tenant = randomUUID();
const runId = "studio-qa-" + tenant.slice(0, 12);
const users = [];
const category = randomUUID(), otherCategory = randomUUID();
const errors = [];
let child, ingress, browser, mock;
async function rawSql(query) {
  const response = await fetch("https://api.supabase.com/v1/projects/" + ref + "/database/query", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.SUPABASE_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      "Management SQL " +
        response.status +
        " " +
        String(data.message ?? data.error ?? "query failed").slice(0, 400),
    );
  return data;
}
async function guard() {
  const m = await rawSql(
    "select slug,id from public.stores where slug in ('nova-store','omar-a7a') order by slug",
  );
  assert.deepEqual(m, [
    { slug: "nova-store", id: nova },
    { slug: "omar-a7a", id: omar },
  ]);
}
async function sql(source) {
  await guard();
  return rawSql(source);
}
const literal = (v) => "'" + String(v).replaceAll("'", "''") + "'";

async function identity(kind) {
  const email = runId + "-" + kind + "@example.com",
    password = randomBytes(28).toString("hex");
  await guard();
  const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error) throw Error("create " + kind + " fixture: " + result.error.message);
  const id = result.data.user.id;
  users.push({ id, email });
  const cookieJar = new Map();
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: (batch) => {
        for (const c of batch) cookieJar.set(c.name, c.value);
      },
    },
  });
  await guard();
  const login = await ssr.auth.signInWithPassword({ email, password });
  if (login.error) throw Error("sign in " + kind + ": " + login.error.message);
  return {
    id,
    token: login.data.session.access_token,
    cookies: [...cookieJar].map(([name, value]) => ({ name, value, url: base })),
  };
}
async function audit(stage, buyer, staff) {
  const report = {};
  for (const pair of [
    "products.cost_price",
    "store_subscriptions.admin_notes",
    "store_invitations.token_hash",
    "orders.delivery_token",
    "order_items.unit_cost",
    "platform_billing_secrets.paymob_api_key",
    "platform_billing_secrets.paymob_hmac_secret",
    "ai_usage_reservations.id",
  ]) {
    const [table, col] = pair.split(".");
    const codes = [];
    for (const token of [anon, buyer.token, staff.token]) {
      const r = await fetch(url + "/rest/v1/" + table + "?select=" + col + "&limit=0", {
        headers: { apikey: anon, Authorization: "Bearer " + token },
      });
      codes.push(r.status);
      await r.arrayBuffer();
    }
    report[pair] = codes;
    assert.deepEqual(codes, [401, 403, 403], pair);
  }
  console.log(stage, JSON.stringify(report));
}

async function startServer() {
  await startMock();
  const probe = net.createServer().listen(0, "localhost");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  child = spawn(
    process.execPath,
    [path.join(web, "node_modules/next/dist/bin/next"), "start", "-H", "localhost", "-p", String(port)],
    {
      cwd: web,
      env: {
        ...process.env,
        NODE_ENV: "production",
        OPENAI_API_KEY: mockKey, OPENAI_API_BASE_URL: "http://127.0.0.1:" + mock.address().port + "/v1",
        PLATFORM_ROOT_DOMAIN: "shopstage.live",
        VERCEL_ENV: "preview",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let ready = false;
  child.stdout.on("data", (b) => {
    if (b.toString().toLowerCase().includes("ready")) ready = true;
  });
  child.stderr.on("data", (b) => {
    for (const line of b.toString().split(/\r?\n/)) {
      if (/Store data could not be loaded|^[\s⨯]*(?:TypeError|Error):/.test(line)) {
        let diagnostic = line;
        for (const value of [...Object.values(cfg), process.env.SUPABASE_ACCESS_TOKEN]) {
          if (value && value.length > 5) diagnostic = diagnostic.replaceAll(value, "[redacted]");
        }
        diagnostic = diagnostic.replace(/https?:\/\/\S+|eyJ[\w.-]+/g, "[redacted]").slice(0, 240);
        errors.push("Next server error");
        console.error(diagnostic);
      }
    }
  });
  for (let i = 0; !ready; i++) {
    if (i > 200 || child.exitCode !== null) throw Error("Next did not start");
    await delay(100);
  }
  const host = "wlc-studio-qa.vercel.app";
  ingress = http.createServer(async (req, res) => {
    if (req.method === "POST") {
      try { await guard(); } catch { errors.push("Tenant identity check failed"); res.writeHead(503).end(); return; }
    }
    const headers = { ...req.headers, host, "x-forwarded-host": host, "x-forwarded-proto": "http" };
    if (headers.origin === base) headers.origin = "https://" + host;
    const up = http.request(
      { hostname: "localhost", port, path: req.url, method: req.method, headers },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  ingress.listen(3000, "localhost");
  await once(ingress, "listening");
  browser = await chromium.launch({
    executablePath:
      process.env.EDGE_EXECUTABLE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    args: ["--no-proxy-server"],
  });
}

const storeWhere = "store_id=" + literal(tenant);
const baselineQuery = `select (select md5(string_agg(to_jsonb(x)::text,',' order by x.id)) from public.platform_billing_settings x) settings_hash,
  (select md5(string_agg(to_jsonb(x)::text,',' order by x.id)) from public.platform_billing_secrets x) vault_hash,
  (select md5(string_agg(to_jsonb(x)::text,',' order by x.code)) from public.saas_plans x) plans_hash,
  s.slug, s.id, md5(to_jsonb(s)::text) store_hash,
  md5(to_jsonb(b)::text) subscription_hash,
  (select md5(jsonb_agg(jsonb_build_array(p.id,p.stock) order by p.id)::text)
    from public.products p where p.store_id=s.id) stock_hash,
  (select md5(jsonb_agg(to_jsonb(v) order by v.product_id,v.color,v.size)::text)
    from public.product_variants v where v.store_id=s.id) variant_hash,
  (select md5(jsonb_agg(to_jsonb(t) order by t.id)::text) from public.platform_theme_settings t) theme_hash
  from public.stores s join public.store_subscriptions b on b.store_id=s.id
  where s.slug in ('nova-store','omar-a7a') order by s.slug`;
async function contracts() {
  const files = readdirSync("qa")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  assert.ok(files.includes("ai_product_studio_rollback.sql"), "Missing Product Studio SQL contract");
  for (const file of files) {
    const source = readFileSync(path.join("qa", file), "utf8").replace(/^\uFEFF/, "");
    const ending = source.slice(source.lastIndexOf("rollback;")).trim();
    assert.ok(/^rollback;(?:\s+select '[^'\n]*' as (?:result|verified);)?$/i.test(ending), file);
    await sql(source);
    console.log("SQL PASS", file);
  }
  console.log(files.length + "/" + files.length + " SQL contracts passed.");
}

async function layout(page, lang, mode, width) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const panel = document.querySelector("dialog[open] .ws-inspector-panel");
    await Promise.allSettled((panel?.getAnimations() ?? []).map((animation) => animation.finished));
  });
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const dialog = document.querySelector("dialog[open]");
    return {
      lang: doc.lang,
      dir: doc.dir,
      mode: document.querySelector(".ws-surface")?.dataset.mode,
      overflow: Math.max(
        0,
        doc.scrollWidth - doc.clientWidth,
        document.body.scrollWidth - doc.clientWidth,
        dialog ? dialog.scrollWidth - dialog.clientWidth : 0,
      ),
    };
  });
  if (result.overflow > 0) {
    const details = await page.evaluate(() => {
      const doc = document.documentElement;
      const dialog = document.querySelector("dialog[open]");
      const nodes = (dialog ?? document.body).querySelectorAll("*");
      return {
        viewport: doc.clientWidth,
        doc: doc.scrollWidth,
        body: document.body.scrollWidth,
        dialog: dialog?.scrollWidth,
        elements: [...nodes]
          .filter(
            (el) =>
              el.getBoundingClientRect().left < -1 || el.getBoundingClientRect().right > doc.clientWidth + 1,
          )
          .slice(0, 12)
          .map((el) => [el.tagName, el.className, Math.round(el.getBoundingClientRect().width)]),
      };
    });
    console.error("Layout overflow", JSON.stringify(details));
  }
  assert.deepEqual(
    result,
    { lang: lang === "en" ? "en" : "ar-EG", dir: lang === "en" ? "ltr" : "rtl", mode, overflow: 0 },
    JSON.stringify({ width, ...result }),
  );
}
async function pageFor(actor, lang = "en", mode = "light", width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    hasTouch: width === 390,
    locale: lang === "en" ? "en-US" : "ar-EG",
    colorScheme: mode,
    serviceWorkers: "block",
  });
  await context.addCookies([
    ...actor.cookies,
    ...[
      ["nova_admin_store_id", tenant],
      ["nova_lang", lang],
      ["wlc_workspace_mode", mode],
      ["shop_theme", mode],
    ].map(([name, value]) => ({ name, value, url: base })),
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  page.on("pageerror", err => errors.push("Page error: " + err.name + " " + err.message.slice(0, 120)));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const expected = expectedFailures.get(page);
    if (expected && message.location().url === base + expected.path &&
        message.text().startsWith("Failed to load resource: the server responded with a status of " + expected.status)) return;
    errors.push("Console error: " + message.text().slice(0, 160).replace(/https?:\/\/\S+/g, "[URL]"));
  });
  page.on("response", response => {
    if (response.status() < 400) return;
    const expected = expectedFailures.get(page);
    if (expected && response.url() === base + expected.path && response.status() === expected.status) return;
    errors.push("HTTP " + response.status() + " " + new URL(response.url()).pathname);
  });
  page.on("requestfailed", req => {
    if (req.failure()?.errorText !== "net::ERR_ABORTED") errors.push("Request failed: " + new URL(req.url()).pathname);
  });
  return page;
}

const expectedFailures = new WeakMap();
const mockKey = randomBytes(24).toString("hex");
let failNext = false, editedPhoto;
const fixtureDraft = {
  name_ar: "مصباح مكتبي أخضر", name_en: "Green desk lamp", slug: runId + "-lamp",
  description_ar: "مصباح مكتبي بغطاء أخضر وقاعدة مستديرة.", description_en: "A desk lamp with a green shade and a round base.",
  colors_ar: ["أخضر"], colors_en: ["Green"], category_id: category,
  specifications: [
    { key_ar: "اللون", key_en: "Color", value_ar: "أخضر", value_en: "Green" },
    { key_ar: "القاعدة", key_en: "Base", value_ar: "مستديرة", value_en: "Round" },
  ],
};
async function startMock() {
  mock = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      assert.equal(req.method, "POST");
      assert.ok(req.headers.authorization === "Bearer " + mockKey, "Unexpected mock key");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (failNext) {
        failNext = false;
        res.writeHead(502).end(JSON.stringify({ error: { message: "Simulated provider error" } }));
        return;
      }
      if (req.url === "/v1/chat/completions") {
        const payload = JSON.parse(body);
        assert.equal(payload.response_format.json_schema.strict, true);
        const parts = payload.messages.find(m => m.role === "user").content;
        const { hint, categories: catalog } = JSON.parse(parts.find(p => p.type === "text").text);
        assert.equal(hint, "Green desk lamp with a round base");
        assert.deepEqual(catalog.map(c => c.id).sort(), [category, otherCategory].sort());
        const photo = parts.find(p => p.type === "image_url").image_url.url;
        assert.match(photo, /^data:image\/(jpeg|webp);base64,/);
        const page = browser.contexts().flatMap(context => context.pages())[0];
        const dimensions = await page.evaluate(async src => {
          const bitmap = await createImageBitmap(await (await fetch(src)).blob());
          const size = [bitmap.width, bitmap.height];
          bitmap.close();
          return size;
        }, photo);
        assert.deepEqual(dimensions, [1024, 576]);
        res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fixtureDraft) } }] }));
      } else {
        assert.equal(req.url, "/v1/images/edits");
        const fields = await new Response(body, { headers: { "content-type": req.headers["content-type"] } }).formData();
        assert.equal(fields.get("size"), "1024x1024");
        assert.match(fields.get("prompt"), /product/i);
        assert.ok(fields.get("image")?.size > 0);
        assert.ok(editedPhoto?.length);
        res.end(JSON.stringify({ data: [{ b64_json: editedPhoto.toString("base64") }] }));
      }
    } catch (error) {
      errors.push("Mock provider contract: " + error.message.slice(0, 180));
      res.writeHead(500).end('{"error":"mock contract"}');
    }
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
}

async function setup(staff, admin) {
  await sql(`begin;
    insert into public.stores(id,slug,name_en,name_ar) values (${literal(tenant)},${literal(runId)},'Product Studio QA','متجر اختبار');
    insert into public.store_settings(store_id,id,store_name,currency,locale,primary_color,secondary_color,
      surface_color,border_radius,whatsapp_number,support_email,shipping_fee)
      values(${literal(tenant)},false,'Product Studio QA','EGP','ar-EG','#0b0b0c','#111315','#ffffff',12,'','studio@example.invalid',0);
    insert into public.categories(id,store_id,slug,name,name_en) values
      (${literal(category)},${literal(tenant)},${literal(runId + "-lighting")},'إضاءة','Lighting'),
      (${literal(otherCategory)},${literal(tenant)},${literal(runId + "-accessories")},'إكسسوارات','Accessories');
    insert into public.store_members(store_id,user_id,role,permissions)
      values (${literal(tenant)},${literal(staff.id)},'custom','{"manage_products":true,"manage_billing":true}');
    insert into public.platform_admins(user_id) values (${literal(admin.id)});
    commit`);
  assert.deepEqual(await rawSql(`select plan_code,quota_overrides from public.store_subscriptions where ${storeWhere}`),
    [{ plan_code: "starter", quota_overrides: {} }]);
}

function fixtureStorage() {
  return `bucket_id='product-images' and split_part(name,'/',1)=${literal(tenant)}`;
}

async function resetCase() {
  const files = await rawSql("select name from storage.objects where " + fixtureStorage());
  if (files.length) {
    const names = files.map(({ name }) => name);
    assert.ok(names.every((name) => name.startsWith(tenant + "/products/")), "Unexpected object under fixture tenant");
    await guard();
    const { error } = await service.storage.from("product-images").remove(names);
    if (error) throw Error("Studio fixture image cleanup failed");
  }
  await sql(`begin;
    delete from public.products where ${storeWhere} and slug=${literal(fixtureDraft.slug)};
    delete from private.ai_usage_reservations where ${storeWhere};
    delete from public.store_monthly_usage where ${storeWhere};
    commit`);
  const [left] = await rawSql(`select
    (select count(*) from public.products where ${storeWhere})
    +(select count(*) from public.product_variants where ${storeWhere})
    +(select count(*) from storage.objects where ${fixtureStorage()})
    +(select count(*) from private.ai_usage_reservations where ${storeWhere})
    +(select count(*) from public.store_monthly_usage where ${storeWhere})
    +(select coalesce(sum(active_products_count),0) from public.store_subscriptions where ${storeWhere}) as remaining`);
  assert.equal(Number(left.remaining), 0, "Per-case product, upload, inventory or quota residue");
}

async function cleanup() {
  await resetCase();
  await sql(`delete from public.stores where id=${literal(tenant)} and slug=${literal(runId)}`);
  for (const { id, email } of users) {
    const found = await service.auth.admin.getUserById(id);
    assert.equal(found.data.user?.email, email);
    await guard();
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw Error("Studio fixture account cleanup failed");
  }
  const fixtureUsers = "any(array[" + users.map((u) => literal(u.id)).join(",") + "]::uuid[])";
  const [left] = await rawSql(`select (select count(*) from public.stores where id=${literal(tenant)})
    +(select count(*) from public.store_settings where ${storeWhere})
    +(select count(*) from public.store_members where ${storeWhere})
    +(select count(*) from public.categories where ${storeWhere})
    +(select count(*) from public.store_subscriptions where ${storeWhere})
    +(select count(*) from public.products where ${storeWhere})
    +(select count(*) from public.product_variants where ${storeWhere})
    +(select count(*) from private.ai_usage_reservations where ${storeWhere})
    +(select count(*) from public.store_monthly_usage where ${storeWhere})
    +(select count(*) from public.platform_admins where user_id=${fixtureUsers})
    +(select count(*) from public.profiles where id=${fixtureUsers})
    +(select count(*) from auth.users where id=${fixtureUsers})
    +(select count(*) from storage.objects where ${fixtureStorage()}) as remaining`);
  assert.equal(Number(left.remaining), 0, "Temporary Studio fixtures remain");
  console.log("Cleanup verified for store, subscription, identities, categories, catalog, stock, storage, usage and ledger.");
}

async function privateSchemaAudit(buyer, staff) {
  const statuses = [];
  for (const token of [anon, buyer.token, staff.token]) {
    const result = await fetch(url + "/rest/v1/ai_usage_reservations?select=id&limit=0", {
      headers: { apikey: anon, Authorization: "Bearer " + token, "Accept-Profile": "private" },
    });
    const payload = await result.json();
    assert.equal(result.status, 406, "Private schema advertised through PostgREST");
    assert.equal(payload.code, "PGRST106");
    statuses.push(result.status);
  }
  console.log("Private ledger schema excluded by PostgREST:", statuses.join("/"));
}

async function billingControls(admin) {
  const page = await pageFor(admin);
  const keys = ["max_monthly_ai_autofills", "max_monthly_ai_studio_images"];
  const manage = base + "/admin/billing?tab=manage&store=" + tenant;
  const caps = await rawSql("select code,max_monthly_ai_autofills,max_monthly_ai_studio_images from public.saas_plans order by code");
  const editor = page.locator("section.billing-editor").filter({ has: page.getByRole("heading", { name: "Plans editor", exact: true }) });
  const store = page.locator("#subscriptions");
  try {
    assert.equal((await page.goto(manage, { waitUntil: "load", timeout: 90000 })).status(), 200);
    await page.getByRole("button", { name: "Save plan", exact: true }).waitFor();
    // Select each plan only after hydration makes its fields interactive.
    await page.waitForFunction(() => !!document.querySelector(".billing-editor form button[type=submit]:enabled"));
    assert.deepEqual(caps.map((p) => p.code), ["business", "pro", "starter"]);
    for (const plan of caps) {
      await editor.getByLabel("Plan to edit").selectOption(plan.code);
      await editor.locator(`input[name="code"][value="${plan.code}"]`).waitFor({ state: "attached" });
      for (const key of keys) {
        const mode = await editor.locator(`[name="${key}_mode"]`).inputValue();
        assert.equal(mode, plan[key] === null ? "unlimited" : "custom");
        if (plan[key] !== null) assert.equal(await editor.locator(`input[name="${key}"]`).inputValue(), String(plan[key]));
      }
    }
    assert.equal(await store.getByLabel("Store to manage").inputValue(), tenant);
    const lookup = `select quota_overrides from public.store_subscriptions where ${storeWhere}`;
    const [original] = await rawSql(lookup);
    for (const key of keys) assert.ok(!Object.hasOwn(original.quota_overrides, key));
    const values = { max_monthly_ai_autofills: 13, max_monthly_ai_studio_images: 7 };
    for (const mode of ["custom", "inherit"]) {
      for (const key of keys) {
        await store.locator(`select[name="${key}_mode"]`).selectOption(mode);
        if (mode === "custom") await store.locator(`input[name="${key}"]`).fill(String(values[key]));
      }
      await guard();
      await store.getByRole("button", { name: "Save subscription" }).click();
      await store.getByText("Changes saved.", { exact: true }).waitFor();
      const expected = mode === "inherit" ? original.quota_overrides : { ...original.quota_overrides, ...values };
      assert.deepEqual(await rawSql(lookup), [{ quota_overrides: expected }]);
      assert.equal((await page.reload({ waitUntil: "load", timeout: 90000 })).status(), 200);
      for (const key of keys) {
        assert.equal(await store.locator(`select[name="${key}_mode"]`).inputValue(), mode);
        if (mode === "custom") assert.equal(await store.locator(`input[name="${key}"]`).inputValue(), String(values[key]));
      }
    }
    console.log("Super Admin verified all plan caps and persisted both store overrides and restored inheritance.");
  } finally {
    await page.context().close();
  }
}
async function workflow(staff, lang, mode, width) {
  const page = await pageFor(staff, lang, mode, width);
  const en = lang === "en";
  const studio = page.locator(".product-photo-studio");
  const field = name => page.locator('[name="' + name + '"]');
  const button = name => page.getByRole("button", { name });
  const auto = button(en ? /Auto-fill details with AI/ : /ملء بيانات المنتج بالذكاء الاصطناعي/);
  const create = button(en ? /Create studio photo/ : /تحويل لصورة استوديو/);
  const after = studio.getByAltText(en ? "After" : "بعد", { exact: true });
  const upgrade = studio.locator('a[href="/admin/billing#plans"]');
  const autoPath = "/api/admin/ai/product-autofill", studioPath = "/api/admin/ai/studio-background";
  const fillValues = async fields => {
    for (const [name, value] of Object.entries(fields)) {
      if (name === "category_id") await field(name).selectOption(value);
      else await field(name).fill(value);
    }
  };
  const checkValues = async fields => {
    for (const [name, value] of Object.entries(fields)) assert.equal(await field(name).inputValue(), value, name);
  };
  async function submitTool(trigger, path, status) {
    if (status >= 400) expectedFailures.set(page, { path, status });
    try {
      const [response] = await Promise.all([
        page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === path),
        trigger.click(),
      ]);
      assert.equal(response.status(), status, path);
      const body = await response.json();
      assert.equal(body.ok, status === 200);
      await page.waitForFunction(() => !document.querySelector(".product-photo-studio input[type=file]").disabled);
      return body;
    } finally { expectedFailures.delete(page); }
  }
  async function usage() {
    const [row] = await rawSql("select coalesce(sum(ai_autofills_count),0)::int fills, coalesce(sum(ai_studio_images_count),0)::int photos from public.store_monthly_usage where " + storeWhere);
    return row;
  }
  async function storedObjects() {
    return rawSql("select name from storage.objects where bucket_id='product-images' and split_part(name,'/',1)=" + literal(tenant) + " order by name");
  }
  try {
    const editorUrl = base + "/admin/products/new";
    assert.equal((await page.goto(editorUrl, { waitUntil: "load" })).status(), 200);
    await studio.waitFor();
    await layout(page, lang, mode, width);
    assert.deepEqual(await usage(), { fills: 0, photos: 0 });
    assert.deepEqual(await storedObjects(), []);
    const prior = {
      name: "اسم يدوي", name_en: "Merchant working title", slug: "merchant-working-title", category_id: otherCategory,
      description: "وصف كتبه التاجر", description_en: "Description supplied by merchant.", colors: "",
    };
    await fillValues(prior);
    await button(en ? "Add Row" : "إضافة صف").click();
    const specInputs = page.locator(".admin-spec-row input");
    const priorRow = { key_ar: "الحجم", key_en: "Size", value_ar: "صغير", value_en: "Small" };
    for (const [index, value] of Object.values(priorRow).entries()) await specInputs.nth(index).fill(value);
    assert.deepEqual(JSON.parse(await field("specifications").inputValue()), [priorRow]);

    const originalBytes = await field("image").evaluate(async input => {
      const canvas = document.createElement("canvas");
      canvas.width = 3840; canvas.height = 2160;
      const ctx = canvas.getContext("2d");
      const image = ctx.createImageData(canvas.width, canvas.height);
      let seed = 7654321;
      for (let i = 0; i < image.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        image.data[i] = seed >>> 24;
        image.data[i + 1] = (seed >>> 16) & 255;
        image.data[i + 2] = (seed >>> 8) & 255;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.98));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], "merchant-camera-4k.jpg", { type: "image/jpeg" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return blob.size;
    });
    assert.ok(originalBytes > 4 * 1024 * 1024, "4K source must exceed the request limit");
    await studio.locator(".product-studio-compression bdi").waitFor();
    assert.match(await studio.locator(".product-studio-compression bdi").innerText(), /MB\s*→\s*\d+(?:\.\d+)? (?:KB|MB)/);
    const optimized = await field("image").evaluate(async input => {
      const file = input.files[0], bitmap = await createImageBitmap(file);
      const info = { bytes: file.size, width: bitmap.width, height: bitmap.height, mime: file.type, name: file.name };
      bitmap.close();
      return info;
    });
    assert.deepEqual([optimized.width, optimized.height], [1600, 900]);
    assert.ok(optimized.bytes < 2 * 1024 * 1024);
    assert.ok(["image/jpeg", "image/webp"].includes(optimized.mime));
    assert.ok(optimized.name.endsWith(optimized.mime === "image/webp" ? ".webp" : ".jpg"));
    await studio.locator("input[maxlength='200']").fill("Green desk lamp with a round base");
    assert.deepEqual((await submitTool(auto, autoPath, 200)).quota, { used: 1, cap: 5 });
    const drafted = {
      name: fixtureDraft.name_ar, name_en: fixtureDraft.name_en, slug: fixtureDraft.slug,
      category_id: category, description: fixtureDraft.description_ar, description_en: fixtureDraft.description_en,
      colors: (en ? fixtureDraft.colors_en : fixtureDraft.colors_ar).join(en ? ", " : "، "),
    };
    await checkValues(drafted);
    assert.deepEqual(JSON.parse(await field("specifications").inputValue()), fixtureDraft.specifications);
    assert.deepEqual(await usage(), { fills: 1, photos: 0 });
    await button(en ? "Undo AI fill" : "تراجع عن التعبئة").click();
    await checkValues(prior);
    assert.deepEqual(JSON.parse(await field("specifications").inputValue()), [priorRow]);
    const merchantColor = en ? "Merchant ivory" : "عاجي";
    await field("colors").fill(merchantColor);
    assert.deepEqual((await submitTool(auto, autoPath, 200)).quota, { used: 2, cap: 5 });
    await checkValues({ ...drafted, colors: merchantColor });
    failNext = true;
    assert.equal((await submitTool(auto, autoPath, 502)).code, "ai_failed");
    assert.equal(await studio.getByRole("alert").innerText(),
      en ? "The studio couldn’t finish. Try again." : "تعذّر إكمال الطلب. حاول مرة أخرى.");
    assert.deepEqual(await usage(), { fills: 2, photos: 0 });
    const [refund] = await rawSql("select count(*)::int n from private.ai_usage_reservations where " + storeWhere + " and status='refunded' and resource='ai_autofills'");
    assert.equal(refund.n, 1);
    // Consume remaining autofills as another worker while the merchant's form remains open.
    await sql("do $$ declare receipt jsonb; begin for n in 1..3 loop receipt := public.reserve_ai_quota(" + literal(tenant) + "," + literal(staff.id) + ",'ai_autofills'); perform public.settle_ai_quota((receipt->>'reservation_id')::uuid,'completed'); end loop; end $$;");
    assert.equal(await auto.isEnabled(), true);
    const denied = await submitTool(auto, autoPath, 409);
    assert.deepEqual([denied.code, denied.used, denied.cap], ["plan_limit_reached", 5, 5]);
    await upgrade.waitFor();
    assert.equal(await auto.isDisabled(), true);
    assert.equal(await create.isEnabled(), true);
    assert.deepEqual(await usage(), { fills: 5, photos: 0 });

    editedPhoto = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1024;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fafafa"; context.fillRect(0, 0, 1024, 1024);
      context.fillStyle = "#141518"; context.fillRect(190, 175, 644, 674);
      return canvas.toDataURL("image/webp", 0.85).split(",")[1];
    }), "base64");
    await studio.locator("select").selectOption("warm_editorial");
    assert.deepEqual((await submitTool(create, studioPath, 200)).quota, { used: 1, cap: 2 });
    await after.waitFor();
    await studio.getByAltText(en ? "Before" : "قبل", { exact: true }).waitFor();
    assert.equal(await after.evaluate(img => img.decode().then(() => img.naturalWidth)), 1024);
    await layout(page, lang, mode, width);
    await button(en ? "Keep original" : "إبقاء الأصلية").click();
    assert.equal(await after.count(), 0);
    assert.equal(await field("image").evaluate(input => input.files[0].name), optimized.name);
    await studio.locator("select").selectOption("executive_dark");
    assert.deepEqual((await submitTool(create, studioPath, 200)).quota, { used: 2, cap: 2 });
    await after.waitFor();
    await button(en ? "Use studio photo" : "اعتماد صورة الاستوديو").click();
    await page.waitForFunction(() => document.querySelector('[name="image"]').files[0]?.name === "studio-product.webp");
    assert.deepEqual(await usage(), { fills: 5, photos: 2 });
    assert.deepEqual(await storedObjects(), []);
    await field("price").fill("125");
    await page.getByLabel(en ? "Set quantity for all options" : "تعيين نفس الكمية لكل الخيارات").fill("3");
    await button(en ? "Apply to all" : "تطبيق على الكل").click();
    assert.equal(await field("stock").inputValue(), "3");
    await Promise.all([page.waitForURL(u => u.pathname === "/admin/products" && u.searchParams.get("result") === "ok"),
      button(en ? "Save Product" : "حفظ المنتج").click()]);
    const rows = await rawSql("select name,name_en,description,description_en,category_id,slug,colors,specifications,stock,image_path from public.products where " + storeWhere);
    assert.equal(rows.length, 1);
    const { image_path: imagePath, ...actual } = rows[0];
    assert.deepEqual(actual, { ...drafted, colors: [merchantColor], specifications: fixtureDraft.specifications, stock: 3 });
    assert.ok(imagePath.startsWith(tenant + "/products/"));
    assert.deepEqual(await storedObjects(), [{ name: imagePath }]);
    const savedPhoto = await fetch(url + "/storage/v1/object/public/product-images/" + imagePath.split("/").map(encodeURIComponent).join("/"));
    assert.equal(savedPhoto.status, 200);
    assert.ok(editedPhoto.equals(Buffer.from(await savedPhoto.arrayBuffer())), "storage must contain exactly the accepted studio output");
    assert.equal((await page.goto(editorUrl)).status(), 200);
    await upgrade.waitFor();
    assert.equal(await auto.locator("bdi").innerText(), "5 / 5");
    assert.equal(await create.locator("bdi").innerText(), "2 / 2");
    assert.equal(await auto.isDisabled(), true);
    assert.equal(await create.isDisabled(), true);
    await upgrade.click();
    await page.waitForURL(u => u.pathname === "/admin/billing" && u.hash === "#plans");
    const plans = page.locator("#plans");
    await plans.waitFor();
    for (const [label, cap, tiers] of [
      [en ? "Monthly AI product drafts" : "مسودات المنتجات الشهرية بالذكاء الاصطناعي", 5, [5, 100, 500]],
      [en ? "Monthly AI studio photos" : "صور الاستوديو الشهرية بالذكاء الاصطناعي", 2, [2, 25, 100]],
    ]) {
      const meter = page.getByRole("progressbar", { name: label, exact: true });
      assert.equal(await meter.getAttribute("value"), String(cap));
      assert.equal(await meter.getAttribute("max"), String(cap));
      for (const [i, code] of ["starter", "pro", "business"].entries()) {
        const row = plans.locator('[data-plan="' + code + '"] dl > div').filter({ has: page.getByText(label, { exact: true }) });
        const text = await row.locator("dd bdi").innerText();
        assert.equal(text, tiers[i].toLocaleString(en ? "en-EG" : "ar-EG"));
      }
    }
    await layout(page, lang, mode, width);
    console.log("Studio workflow passed", JSON.stringify({ lang, mode, width, originalBytes, optimized }));
  } finally {
    expectedFailures.delete(page);
    await page.context().close();
  }
}
async function run() {
  await guard();
  const baseline = await rawSql(baselineQuery);
  try {
    await startServer();
    const buyer = await identity("buyer"), staff = await identity("staff"), admin = await identity("admin");
    await setup(staff, admin);
    await audit("BEFORE", buyer, staff);
    await privateSchemaAudit(buyer, staff);
    await contracts();
    await billingControls(admin);
    for (const lang of ["en", "ar"]) {
      for (const mode of ["light", "dark"]) {
        for (const width of [1440, 390]) {
          await workflow(staff, lang, mode, width);
          assert.deepEqual(errors, [], "Unexpected browser, server or provider diagnostics");
          await resetCase();
        }
      }
    }
    await audit("AFTER", buyer, staff);
    await privateSchemaAudit(buyer, staff);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    for (const server of [ingress, mock]) if (server?.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    child?.kill();
    await cleanup();
    assert.deepEqual(await rawSql(baselineQuery), baseline, "Tenant, inventory, plan or platform baseline drift");
    console.log("Baseline fingerprints matched for Nova, Omar, inventory, plans, theme, billing settings and billing secrets.");
  }
}
await run();
