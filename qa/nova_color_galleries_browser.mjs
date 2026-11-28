// Run after the production web build and Nova catalog seed.
// NODE_PATH must include playwright-core. EDGE_EXECUTABLE_PATH can select another Chromium binary.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { guard, sql } from "../scripts/seed-nova-catalog.mjs";

const nova = "00000000-0000-0000-0000-000000000001";
const base = "http://localhost:3000";
const web = path.resolve("web-store");
const require = createRequire(path.join(web, "package.json"));
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");
const envFile = await readFile(path.join(web, ".env.local"), "utf8");
const config = parseEnv(envFile.replace(/^\uFEFF/, ""));
const url = config.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, "zpabcnskkbpplurngtle.supabase.co");
const anon = config.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID();
const evidence = path.join(tmpdir(), "nova-gallery-qa-" + runId);
const errors = [];
const coverage = [];
const authorization = {};
const literal = s => "'" + s.replaceAll("'", "''") + "'";
const session = "web-gallery-" + runId, guest = "guest-gallery-" + runId;
let next, proxy, browser, merchant, original, mutated, cartUsed = false;

async function startServer() {
  try {
    const live = await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    await live.body?.cancel();
    return;
  } catch { /* Start the built storefront on loopback. */ }
  const probe = net.createServer().listen(0, "localhost");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  next = spawn(process.execPath, [path.join(web, "node_modules/next/dist/bin/next"), "start", "-H", "localhost", "-p", String(port)],
    { cwd: web, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...config, ...process.env, NODE_ENV: "production", PLATFORM_ROOT_DOMAIN: "shopstage.live", VERCEL_ENV: "preview" } });
  let ready = false;
  next.stdout.on("data", b => { if (/ready/i.test(b.toString())) ready = true; });
  next.stderr.on("data", b => { if (/Store data could not be loaded|^[\s⨯]*(?:TypeError|Error):/m.test(b.toString())) errors.push("Next server error"); });
  for (let i = 0; !ready; i++) {
    if (i > 300 || next.exitCode !== null) throw Error("Local production server did not start");
    await delay(100);
  }
  // Exercise production platform-host routing through the mandated localhost URL.
  proxy = http.createServer((req, res) => {
    const host = "shopstage.live";
    const headers = { ...req.headers, host, "x-forwarded-host": host, "x-forwarded-proto": "http" };
    if (headers.origin === base) headers.origin = "https://" + host;
    const upstream = http.request({ hostname: "localhost", port, path: req.url, method: req.method, headers }, r => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  }).listen(3000, "localhost");
  await once(proxy, "listening");
}

async function pageFor(lang, mode, width, login = []) {
  const context = await browser.newContext({ locale: lang === "en" ? "en-US" : "ar-EG", colorScheme: mode,
    viewport: { width, height: width === 390 ? 844 : 900 }, hasTouch: width === 390, serviceWorkers: "block" });
  await context.addCookies([...login, ...[["nova_lang", lang], ["shop_theme", mode], ["wlc_workspace_mode", mode],
    ["nova_admin_store_id", nova]].map(([name, value]) => ({ name, value, url: base }))]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", e => errors.push("Page exception: " + e.name));
  page.on("console", m => { if (m.type() === "error") errors.push("Browser console: " + m.text().replace(/https?:\/\/\S+|eyJ[\w.-]+/g, "[redacted]").slice(0, 180)); });
  page.on("response", r => { if (r.status() >= 400) errors.push("HTTP " + r.status() + " " + new URL(r.url()).pathname); });
  page.on("requestfailed", r => {
    const code = r.failure()?.errorText;
    // Chromium cancels pending image/prefetch requests when React replaces the element or navigates.
    if (code !== "net::ERR_ABORTED") errors.push(String(code) + " " + new URL(r.url()).pathname);
  });
  await page.route("**/*", async route => {
    if (route.request().method() === "POST" && route.request().url().startsWith(base + "/")) {
      try { await guard(); } catch { errors.push("Pre-write tenant guard failed"); await route.abort(); return; }
    }
    await route.continue();
  });
  return { page, context };
}

async function visit(page, route) {
  const response = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 90000 });
  assert.equal(response?.status(), 200, route);
  assert.equal(new URL(page.url()).origin, base, "Escaped localhost QA");
}

async function loadedSources(locator, expected) {
  await locator.first().scrollIntoViewIfNeeded();
  const end = Date.now() + 45000;
  let actual = [];
  while (Date.now() < end) {
    actual = await locator.evaluateAll(images => images.map(img => {
      if (!img.complete || !img.naturalWidth) return null;
      const resolved = new URL(img.currentSrc);
      return resolved.pathname === "/_next/image" ? resolved.searchParams.get("url") : resolved.href;
    }));
    if (actual.length === expected.length && actual.every((url, i) => url === expected[i])) return;
    await delay(100);
  }
  assert.deepEqual(actual, expected, "Displayed photograph differs or failed to load");
}

async function photo(page, scope, index, views) {
  const stage = page.locator(scope);
  await page.waitForFunction(({ scope, index }) => document.querySelector(scope + " .gallery-counter bdi")?.textContent === index + 1 + " / 3",
    { scope, index });
  assert.equal(await stage.locator(".gallery-counter bdi").getAttribute("dir"), "ltr");
  await loadedSources(stage.locator("img"), [views[index]]);
  assert.equal(await page.locator(".gallery-thumb").nth(index).getAttribute("aria-pressed"), "true");
}

async function cartCheck(page, p) {
  const colorIndex = p.colors.findIndex((c, i) => i > 0 && p.variants.some(v => v.color === c && v.stock > 0));
  assert.ok(colorIndex > 0);
  const color = p.colors[colorIndex], cover = p.color_galleries[color][0];
  await page.locator('[data-option="color"] button').nth(colorIndex).click();
  const scopeKey = nova + ":guest";
  await page.evaluate(({ scopeKey, session, guest }) => {
    localStorage.setItem("wlc.cart_session." + scopeKey, session);
    localStorage.setItem("wlc.guest_session." + scopeKey, guest);
  }, { scopeKey, session, guest });
  cartUsed = true;
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith("/api/abandoned-cart") && r.status() === 200),
    page.waitForResponse(r => r.url().endsWith("/api/notifications/cart-heartbeat") && r.status() === 200),
    page.locator(".detail-buy button[type=submit]").click(),
  ]);
  console.log("Cart endpoints returned HTTP 200");
  const [persisted] = await sql(`select (select count(*) from public.abandoned_carts where store_id='${nova}' and session_key=${literal(session)})
    + (select count(*) from public.cart_sessions where store_id='${nova}' and guest_session_id=${literal(guest)} and item_count=1) as records`);
  assert.equal(Number(persisted.records), 2, "Test cart did not persist");
  console.log("Both cart records persisted");
  const lines = await page.evaluate(key => JSON.parse(localStorage.getItem("wlc.cart.v4." + key)).lines, scopeKey);
  assert.ok(lines.some(l => l.id === p.id && l.color === color && l.image_path === cover), "Cart line lost selected primary");
  await visit(page, "/s/nova-store/cart");
  console.log("Opened cart page");
  const rowImage = page.locator("img").filter({ visible: true });
  await page.waitForFunction(cover => [...document.images].some(img => img.naturalWidth &&
    (new URL(img.currentSrc).searchParams.get("url") === cover || img.currentSrc === cover)), cover);
  assert.ok(await rowImage.count());
}

async function gallery(p, kind, lang, mode, width) {
  const { page, context } = await pageFor(lang, mode, width);
  const shot = [kind, lang, mode, width].join("-");
  try {
    await visit(page, "/s/nova-store/products/" + p.slug);
    const shop = page.locator(".sf-store");
    assert.equal(await shop.getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
    assert.equal(await shop.getAttribute("lang"), lang);
    assert.equal(await page.locator("[data-storefront-mode]").getAttribute("data-shop-theme"), mode);
    const swatches = page.locator('.detail-buy [data-option="color"] button');
    const initial = p.colors.findIndex(c => p.variants.some(v => v.color === c && v.stock > 0));
    assert.equal(await swatches.count(), p.colors.length);
    assert.equal(await swatches.nth(initial).getAttribute("aria-pressed"), "true");
    await photo(page, ".gallery-stage", 0, p.color_galleries[p.colors[initial]]);
    const nextKey = lang === "ar" ? "ArrowLeft" : "ArrowRight";
    const prevKey = lang === "ar" ? "ArrowRight" : "ArrowLeft";
    for (let step = 1; step <= p.colors.length; step++) {
      const i = (initial + step) % p.colors.length, color = p.colors[i], views = p.color_galleries[color];
      await swatches.nth(i).click();
      assert.equal(await swatches.nth(i).getAttribute("aria-pressed"), "true");
      const units = p.variants.filter(v => v.color === color).reduce((n, v) => n + v.stock, 0);
      assert.equal(await swatches.nth(i).getAttribute("data-sold-out"), String(units === 0));
      assert.equal(await page.locator(".detail-buy .stock-tier").getAttribute("data-tier"), units === 0 ? "out" : units <= 5 ? "low" : "in");
      await loadedSources(page.locator(".gallery-thumb img"), views);
      await photo(page, ".gallery-stage", 0, views);
      await page.locator(".gallery-stage .gallery-next").click();
      await photo(page, ".gallery-stage", 1, views);
      await page.keyboard.press(nextKey);
      await photo(page, ".gallery-stage", 2, views);
      await page.locator(".gallery-open").click();
      await photo(page, "dialog[open]", 2, views);
      await page.locator("dialog[open] .gallery-next").click();
      await photo(page, "dialog[open]", 0, views);
      await page.keyboard.press(prevKey);
      await photo(page, "dialog[open]", 2, views);
      if (step === 1) await page.screenshot({ path: path.join(evidence, shot + "-lightbox.png") });
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      await page.locator(".gallery-stage .gallery-prev").click();
      await photo(page, ".gallery-stage", 1, views);
      await page.locator(".gallery-thumb").first().click();
      await photo(page, ".gallery-stage", 0, views);
      if (step === 1 || (lang === "ar" && mode === "dark" && width === 390)) {
        const stem = path.join(evidence, shot + "-color-" + (i + 1));
        if (width === 390) {
          await page.locator(".product-gallery").evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
          await page.screenshot({ path: stem + ".png" });
          if (lang === "ar" && mode === "dark") {
            await swatches.nth(i).evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
            await page.screenshot({ path: stem + "-stock.png" });
          }
        } else await page.locator(".sf-product").screenshot({ path: stem + ".png" });
      }
      // Leave a nonzero page active before changing color to verify the reset.
      await page.locator(".gallery-thumb").last().click();
      await photo(page, ".gallery-stage", 2, views);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Horizontal overflow");
    if (kind === "wallet" && lang === "en" && mode === "light" && width === 1440) await cartCheck(page, p);
    coverage.push({ kind, slug: p.slug, lang, mode, width, colors: p.colors.length });
    console.log("Passed " + shot);
  } finally { await context.close(); }
}

async function permissions(role, token) {
  const fields = ["products.cost_price", "store_subscriptions.admin_notes", "store_invitations.token_hash",
    "orders.delivery_token", "order_items.unit_cost", "platform_billing_secrets.paymob_api_key",
    "platform_billing_secrets.paymob_hmac_secret", "ai_usage_reservations.id"];
  const headers = { apikey: anon, Authorization: "Bearer " + token };
  const checks = {};
  for (const field of fields) {
    const [table, col] = field.split(".");
    const r = await fetch(`${url}/rest/v1/${table}?select=${col}&limit=0`, { headers });
    checks[field] = r.status;
    await r.body?.cancel();
    assert.equal(r.status, role === "anonymous" ? 401 : 403, role + " " + field);
  }
  const privateSchema = await fetch(url + "/rest/v1/ai_usage_reservations?select=id&limit=0", {
    headers: { ...headers, "Accept-Profile": "private" } });
  assert.equal(privateSchema.status, 406);
  assert.equal((await privateSchema.json()).code, "PGRST106");
  authorization[role] = { ...checks, private: 406 };
}

async function merchantCookies() {
  const email = "gallery-qa-" + runId + "@example.com";
  const password = randomBytes(32).toString("hex");
  await guard();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw Error("Could not create temporary catalog merchant");
  merchant = created.data.user.id;
  const jar = new Map();
  const client = createServerClient(url, anon, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: entries => entries.forEach(c => jar.set(c.name, c.value)),
  } });
  await guard();
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw Error("Temporary catalog merchant could not sign in");
  await permissions("anonymous", anon);
  await permissions("buyer", login.data.session.access_token);
  await sql(`insert into public.store_members(store_id,user_id,role,permissions)
    values ('${nova}',${literal(merchant)},'catalog','{"manage_products":true}')`, true);
  await permissions("merchant", login.data.session.access_token);
  return [...jar].map(([name, value]) => ({ name, value, url: base }));
}

async function productState(id) {
  const [state] = await sql(`select id, color_galleries, color_images,
    md5((to_jsonb(p)-'color_galleries'-'color_images')::text) as other_fields,
    (select md5(string_agg(to_jsonb(v)::text,'' order by v.color,v.size))
      from public.product_variants v where (v.store_id,v.product_id)=(p.store_id,p.id)) as inventory
    from public.products p where p.store_id='${nova}' and p.id=${literal(id)}`);
  assert.ok(state, "QA product is missing");
  return state;
}

async function editor() {
  const [candidate] = await sql(`select id,colors from public.products where store_id='${nova}' and is_active
    and flash_sale_price is null and image_path like '%/${nova}/catalog/%' order by slug limit 1`);
  assert.ok(candidate);
  const id = candidate.id, color = candidate.colors[0];
  original = await productState(id);
  const galleries = structuredClone(original.color_galleries);
  galleries[color] = [galleries[color][1], galleries[color][2], galleries[color][0]];
  mutated = { ...original, color_galleries: galleries, color_images: { ...original.color_images, [color]: galleries[color][0] } };
  const { page, context } = await pageFor("en", "light", 1440, await merchantCookies());
  const address = "/admin/products/" + id;
  async function openForm(expected) {
    await visit(page, address);
    const controls = page.locator(".admin-color-gallery textarea");
    assert.equal(await controls.count(), candidate.colors.length, "Merchant gallery fields");
    for (const [i, name] of candidate.colors.entries()) {
      assert.deepEqual((await controls.nth(i).inputValue()).split("\n"), expected.color_galleries[name], "Merchant readback");
      await loadedSources(page.locator(".admin-color-gallery").nth(i).locator("img"), expected.color_galleries[name]);
    }
    return controls.first();
  }
  async function submit(change, expected) {
    await change.fill(expected.color_galleries[color].join("\n"));
    assert.deepEqual(JSON.parse(await page.locator('input[name=color_galleries]').inputValue()), expected.color_galleries);
    assert.deepEqual(JSON.parse(await page.locator('input[name=color_images]').inputValue()), expected.color_images);
    await Promise.all([page.waitForURL(u => u.pathname === "/admin/products" && u.searchParams.get("result") === "ok", { timeout: 60000 }),
      page.getByRole("button", { name: "Save Product", exact: true }).click()]);
    assert.deepEqual(await productState(id), expected, "Saved gallery or other product/variant fields differ");
  }
  try {
    await submit(await openForm(original), mutated);
    const field = await openForm(mutated);
    await page.locator(".admin-color-galleries").screenshot({ path: path.join(evidence, "merchant-saved-galleries.png") });
    await submit(field, original);
    await openForm(original);
    console.log("Merchant saved and restored the real gallery through the editor; full product and SKU readback matched");
  } finally { await context.close(); }
}

async function cleanup() {
  if (original) {
    const state = await productState(original.id);
    if (JSON.stringify(state.color_galleries) !== JSON.stringify(original.color_galleries)) {
      // Recover a timed-out UI interaction only when both gallery columns still have the exact QA permutation.
      await sql(`update public.products set color_galleries=${literal(JSON.stringify(original.color_galleries))}::jsonb,
        color_images=${literal(JSON.stringify(original.color_images))}::jsonb where store_id='${nova}' and id=${literal(original.id)}
        and color_galleries=${literal(JSON.stringify(mutated.color_galleries))}::jsonb
        and color_images=${literal(JSON.stringify(mutated.color_images))}::jsonb`, true);
    }
  }
  if (cartUsed) {
    await sql(`begin; delete from public.abandoned_carts where store_id='${nova}' and session_key=${literal(session)};
      delete from public.cart_sessions where store_id='${nova}' and guest_session_id=${literal(guest)}; commit;`, true);
    const [r] = await sql(`select (select count(*) from public.abandoned_carts where store_id='${nova}' and session_key=${literal(session)})
      + (select count(*) from public.cart_sessions where store_id='${nova}' and guest_session_id=${literal(guest)}) as remaining`);
    assert.equal(Number(r.remaining), 0, "Test cart records remain");
  }
  if (merchant) {
    await sql(`delete from public.store_members where store_id='${nova}' and user_id=${literal(merchant)}`, true);
    await guard();
    const removed = await admin.auth.admin.deleteUser(merchant);
    if (removed.error) throw Error("Failed to delete QA merchant");
    const [r] = await sql(`select (select count(*) from public.store_members where user_id=${literal(merchant)}) +
      (select count(*) from auth.users where id=${literal(merchant)}) + (select count(*) from public.profiles where id=${literal(merchant)}) as remaining`);
    assert.equal(Number(r.remaining), 0, "Test merchant records remain");
  }
  if (original) assert.deepEqual(await productState(original.id), original, "QA product restoration failed");
}

async function main() {
  await guard();
  const rows = await sql(`select p.id,p.slug,p.name_en,p.colors,p.sizes,p.color_galleries,c.slug as category,
    (select jsonb_agg(jsonb_build_object('color',v.color,'size',v.size,'stock',v.stock)) from public.product_variants v
      where (v.store_id,v.product_id)=(p.store_id,p.id) and v.listed) as variants
    from public.products p join public.categories c on (c.store_id,c.id)=(p.store_id,p.category_id)
    where p.store_id='${nova}' and p.is_active and p.image_path like '%/${nova}/catalog/%' order by p.slug`);
  assert.equal(rows.length, 100, "Run browser QA after the complete seed");
  const tee = rows.find(p => p.category === "mens-fashion" && p.colors.length === 4 && /t[ -]?shirt|\btee\b/i.test(p.name_en));
  const wallet = rows.find(p => p.category === "leather-carry" && !p.sizes.length && /wallet|bifold/i.test(p.name_en));
  assert.ok(tee && wallet, "Expected a four-color T-shirt and a one-size wallet");
  await mkdir(evidence, { recursive: true });
  try {
    await startServer();
    browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      headless: true, args: ["--no-proxy-server"] });
    for (const [kind, product] of [["tee", tee], ["wallet", wallet]]) {
      for (const width of [1440, 390]) for (const lang of ["en", "ar"]) for (const mode of ["light", "dark"]) {
        await gallery(product, kind, lang, mode, width);
        assert.deepEqual(errors, []);
      }
    }
    await editor();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    next?.kill();
    await cleanup();
    await writeFile(path.join(evidence, "verification.json"), JSON.stringify({ coverage, errors, authorization }, null, 2));
    console.log("Evidence", evidence);
  }
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
