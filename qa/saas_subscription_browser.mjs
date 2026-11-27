/**
 * From the repository root after npm run build in web-store:
 *   node qa/saas_subscription_browser.mjs
 * Supply SUPABASE_ACCESS_TOKEN and, for external playwright-core, NODE_PATH.
 * The local preview ingress preserves the production platform-only routing rules.
 */
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
assert.ok(process.env.SUPABASE_ACCESS_TOKEN, "Set SUPABASE_ACCESS_TOKEN before running billing QA.");
const service = createClient(url, cfg.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const base = "http://localhost:3000";
const tenant = randomUUID();
const runId = "billing-qa-" + tenant.slice(0, 12);
const users = [];
const receipts = new Set();
const errors = [];
let child, ingress, browser, originalSettings, originalVault, settingsChanged, vaultChange;
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
  const host = "wlc-billing-qa.vercel.app";
  ingress = http.createServer((req, res) => {
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
const baselineQuery = `select s.slug, s.id, md5(to_jsonb(s)::text) store_hash,
  md5(to_jsonb(b)::text) subscription_hash,
  (select md5(jsonb_agg(jsonb_build_array(p.id,p.stock) order by p.id)::text)
    from public.products p where p.store_id=s.id) stock_hash,
  (select md5(jsonb_agg(to_jsonb(v) order by v.product_id,v.color,v.size)::text)
    from public.product_variants v where v.store_id=s.id) variant_hash,
  (select md5(jsonb_agg(to_jsonb(t) order by t.id)::text) from public.platform_theme_settings t) theme_hash
  from public.stores s join public.store_subscriptions b on b.store_id=s.id
  where s.slug in ('nova-store','omar-a7a') order by s.slug`;
const settingRow =
  "select id, revision, manual_transfer_enabled, instapay_handle, updated_at, md5(to_jsonb(s)::text) fingerprint from public.platform_billing_settings s where id=1";
const vaultRow =
  "select id, updated_at, nullif(paymob_hmac_secret,'') is not null configured, paymob_hmac_secret is null was_null, md5(to_jsonb(v)::text) fingerprint from public.platform_billing_secrets v where id=1";

async function setup(staff, admin) {
  await sql(`begin;
    insert into public.stores(id,slug,name_en,name_ar) values (${literal(tenant)},${literal(runId)},'Billing QA','متجر اختبار');
    insert into public.store_settings(store_id,id,store_name,currency,locale,primary_color,secondary_color,
      surface_color,border_radius,whatsapp_number,support_email,shipping_fee)
      values(${literal(tenant)},false,'Billing QA','EGP','ar-EG','#0b0b0c','#111315','#ffffff',12,'','billing@example.invalid',0);
    insert into public.store_members(store_id,user_id,role,permissions)
      values (${literal(tenant)},${literal(staff.id)},'custom','{"manage_billing":true}');
    insert into public.platform_admins(user_id) values (${literal(admin.id)});
    commit`);
  [originalSettings] = await rawSql(settingRow);
  [originalVault] = await rawSql(vaultRow);
  assert.ok(originalSettings);
}

async function configureTransfers(page) {
  await visit(page, true);
  const html = await (await page.request.get(page.url())).text();
  const fallback = await page.evaluate((markup) => {
    const document = new DOMParser().parseFromString(markup, "text/html");
    const field = document.querySelector('input[name="paymob_api_key"]');
    return {
      method: field?.form?.method,
      disabled: field?.matches(":disabled"),
      submitDisabled: field?.form?.querySelector('button[type="submit"]')?.disabled,
    };
  }, html);
  assert.deepEqual(fallback, { method: "post", disabled: true, submitDisabled: true });
  for (const field of ["paymob_api_key", "paymob_hmac_secret"]) {
    assert.equal(await page.locator('[name="' + field + '"]').inputValue(), "");
    assert.equal(await page.locator('[name="' + field + '"]').getAttribute("type"), "password");
  }
  for (const endpoint of ["callback", "webhook"]) {
    const node = page.locator(".payment-endpoint bdi").filter({ hasText: "/api/billing/paymob/" + endpoint });
    const address = new URL(await node.innerText());
    assert.equal(address.pathname, "/api/billing/paymob/" + endpoint);
  }
  await page.locator('[name="manual_transfer_enabled"]').check();
  const handle = originalSettings.instapay_handle || "QA ONLY - do not transfer";
  await page.locator('[name="instapay_handle"]').fill(handle);
  await submit(page.getByRole("button", { name: "Save payment settings", exact: true }));
  const saved = await state(
    settingRow,
    (r) =>
      r.revision === originalSettings.revision + 1 &&
      r.manual_transfer_enabled &&
      r.instapay_handle === handle,
    "payment settings",
  );
  settingsChanged = saved.fingerprint;
  try {
    await page.getByText("Changes saved.", { exact: true }).first().waitFor({ timeout: 15000 });
  } catch {
    const feedback = await page.locator("form [role=status],form [role=alert]").allTextContents();
    throw Error(
      "Settings form feedback: " +
        JSON.stringify(feedback.filter(Boolean)) +
        "; query field names: " +
        [...new URL(page.url()).searchParams.keys()].join(",") +
        "; browser diagnostics: " +
        JSON.stringify(errors),
    );
  }
  assert.equal(
    (await rawSql(vaultRow))[0]?.fingerprint,
    originalVault?.fingerprint,
    "empty credential fields modified the vault",
  );
}

async function cleanup() {
  // Delete by the generated store UUID, including any upload whose RPC failed before returning its path.
  const objects = await rawSql(`select name from storage.objects where bucket_id='billing-receipts'
    and split_part(name,'/',1)=${literal(tenant)}`);
  for (const { name } of objects) receipts.add(name);
  if (receipts.size) {
    await guard();
    const { error } = await service.storage.from("billing-receipts").remove([...receipts]);
    if (error) throw Error("Receipt cleanup failed");
  }
  if (vaultChange) {
    const filter = "where id=1 and md5(to_jsonb(v)::text)=" + literal(vaultChange);
    const restored = originalVault
      ? await sql(`update public.platform_billing_secrets v set paymob_hmac_secret=${originalVault.was_null ? "null" : "''"},
          updated_at=${literal(originalVault.updated_at)} ${filter} returning id`)
      : await sql("delete from public.platform_billing_secrets v " + filter + " returning id");
    assert.equal(restored.length, 1, "vault changed concurrently");
  }
  if (settingsChanged) {
    const restored = await sql(`update public.platform_billing_settings s set
      manual_transfer_enabled=${originalSettings.manual_transfer_enabled},
      instapay_handle=${originalSettings.instapay_handle === null ? "null" : literal(originalSettings.instapay_handle)},
      revision=${originalSettings.revision},updated_at=${literal(originalSettings.updated_at)}
      where id=1 and md5(to_jsonb(s)::text)=${literal(settingsChanged)} returning id`);
    assert.equal(restored.length, 1, "billing settings changed concurrently");
  }
  await sql(`delete from public.stores where id=${literal(tenant)} and slug=${literal(runId)}`);
  for (const { id, email } of users) {
    const found = await service.auth.admin.getUserById(id);
    assert.equal(found.data.user?.email, email);
    await guard();
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw Error("Auth cleanup failed");
  }
  const [remaining] = await rawSql(`select (select count(*) from public.stores where id=${literal(tenant)})
    +(select count(*) from public.store_members where ${storeWhere})
    +(select count(*) from public.store_settings where ${storeWhere})
    +(select count(*) from public.subscription_invoices where ${storeWhere})
    +(select count(*) from public.subscription_payment_attempts where ${storeWhere})
    +(select count(*) from public.store_subscriptions where ${storeWhere})
    +(select count(*) from storage.objects where bucket_id='billing-receipts' and split_part(name,'/',1)=${literal(tenant)})
    +(select count(*) from auth.users where id=any(array[${users.map((u) => literal(u.id)).join(",")}]::uuid[]))
    as count`);
  assert.equal(Number(remaining.count), 0);
  if (originalSettings)
    assert.equal((await rawSql(settingRow))[0]?.fingerprint, originalSettings.fingerprint);
  if (originalSettings) assert.equal((await rawSql(vaultRow))[0]?.fingerprint, originalVault?.fingerprint);
  console.log(
    "Cleanup verified: store, accounts, invoices, attempts and receipts absent; settings and vault match baseline.",
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
  page.on("console", (msg) => {
    if (msg.type() === "error")
      errors.push(
        "console " +
          msg
            .text()
            .replace(/https?:\/\/\S+/g, "[URL]")
            .slice(0, 100),
      );
  });
  page.on("pageerror", (e) => errors.push("page " + e.name));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + new URL(r.url()).pathname);
  });
  page.on("requestfailed", (r) => {
    if (r.failure()?.errorText !== "net::ERR_ABORTED") errors.push("request " + new URL(r.url()).pathname);
  });
  return page;
}
async function visit(page, manage = false, suffix = "") {
  const r = await page.goto(base + "/admin/billing" + (manage ? "?tab=manage&store=" + tenant : suffix), {
    waitUntil: "load",
    timeout: 90000,
  });
  assert.equal(r.status(), 200);
  await page.locator(".billing-page").waitFor();
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
async function state(query, predicate, label) {
  const end = Date.now() + 35000;
  do {
    const [row] = await rawSql(query);
    if (row && predicate(row)) return row;
    await delay(350);
  } while (Date.now() < end);
  throw Error("Database verification failed: " + label);
}
async function submit(button) {
  await guard();
  await button.click();
}
const subscription = "select * from public.store_subscriptions where " + storeWhere;
const planCard = (p, code) => p.locator('article[data-plan="' + code + '"]');
async function requestTransfer(p, reference, receipt) {
  await planCard(p, "business")
    .getByRole("button", { name: /Upgrade to/ })
    .click();
  const panel = p.getByRole("dialog");
  await panel.locator('[name="paymentMethod"]').selectOption("instapay");
  await panel.locator('[name="reference"]').fill(reference);
  await panel.locator('[name="sender"]').fill("QA sender");
  if (receipt)
    await panel.locator('[name="receipt"]').setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await panel.locator('[name="note"]').fill("Temporary billing verification");
  await submit(panel.getByRole("button", { name: /Submit transfer for review/ }));
  await panel.waitFor({ state: "hidden", timeout: 25000 }).catch(async () => {
    throw Error(
      "Transfer submission feedback: " + (await panel.locator('[role="alert"]').allTextContents()).join(" "),
    );
  });
  const row = await state(
    `select * from public.subscription_invoices where ${storeWhere} and transfer_reference=${literal(reference)}`,
    (r) => r.status === "awaiting_review",
    "manual receipt",
  );
  if (receipt) {
    assert.ok(row.receipt_path.startsWith(tenant + "/"));
    receipts.add(row.receipt_path);
  }
  await p.getByRole("button", { name: "Cancel request" }).waitFor();
  await p.getByText(reference, { exact: true }).last().waitFor();
  return row;
}
async function workflow(staff, admin) {
  const q = await pageFor(admin);
  await configureTransfers(q);
  const p = await pageFor(staff);
  await visit(p);
  await submit(planCard(p, "pro").getByRole("button", { name: /Start.*14.*free trial/ }));
  await state(
    subscription,
    (r) =>
      r.status === "trialing" &&
      r.plan_code === "pro" &&
      Date.parse(r.trial_ends_at) - Date.parse(r.trial_used_at) === 14 * 86400000,
    "start trial",
  );
  await p
    .getByRole("button", { name: /free trial/i })
    .first()
    .waitFor({ state: "hidden" });
  await p.locator(".plan-cycles button").nth(1).click();
  const first = await requestTransfer(p, runId + "-review", true);
  assert.equal(first.target_billing_cycle, "annual");
  await p.locator(".plan-cycles button").first().click();
  await submit(planCard(p, "starter").getByRole("button", { name: "Schedule downgrade" }));
  await state(
    subscription,
    (r) => r.scheduled_plan_code === "starter" && r.scheduled_effective_at === r.current_period_end,
    "scheduled downgrade",
  );
  await submit(p.getByRole("button", { name: "Cancel scheduled change" }));
  await state(subscription, (r) => r.scheduled_plan_code === null, "cancel downgrade");
  console.log("Merchant trial, transfer with receipt, downgrade and cancellation persisted.");
  await visit(q, true);
  const article = q.locator('[data-invoice-id="' + first.id + '"]');
  const link = article.getByRole("link", { name: /View receipt/i });
  const href = await link.getAttribute("href");
  const preview = await q.request.get(new URL(href, base).href);
  assert.equal(preview.status(), 200);
  assert.match(preview.headers()["content-type"], /^image\/png/);
  assert.equal((await preview.body()).subarray(1, 4).toString(), "PNG");
  await article.locator('[name="review_note"]').fill("Reference not found in QA statement");
  await submit(article.getByRole("button", { name: "Reject", exact: true }));
  await state(
    "select status from public.subscription_invoices where id=" + literal(first.id),
    (r) => r.status === "rejected",
    "reject",
  );
  await visit(p);
  await p.getByText("Reference not found in QA statement", { exact: false }).first().waitFor();
  for (const lang of ["ar", "en"])
    for (const mode of ["light", "dark"])
      for (const width of [390, 1440]) {
        const merchantPage = await pageFor(staff, lang, mode, width);
        const adminPage = await pageFor(admin, lang, mode, width);
        await Promise.all([visit(merchantPage), visit(adminPage, true)]);
        await adminPage.locator(".billing-reviewed summary").click();
        await adminPage.locator('[data-invoice-id="' + first.id + '"]').waitFor();
        await Promise.all([layout(merchantPage, lang, mode, width), layout(adminPage, lang, mode, width)]);
        // On the same trial plan the paid activation panel remains available.
        await merchantPage.locator("#checkout-pro").click();
        await merchantPage.getByRole("dialog").waitFor();
        await merchantPage.getByRole("dialog").locator('[name="paymentMethod"]').selectOption("instapay");
        if (width === 390 && lang === "ar" && mode === "dark") {
          const file = merchantPage.locator('input[name="receipt"]');
          await merchantPage.locator('input[name="sender"]').focus();
          await merchantPage.keyboard.press("Tab");
          assert.ok(
            await file.evaluate(
              (input) =>
                document.activeElement === input &&
                getComputedStyle(input.parentElement).outlineStyle !== "none",
            ),
          );
          const [chooser] = await Promise.all([merchantPage.waitForEvent("filechooser"), file.tap()]);
          await chooser.setFiles([]);
          await merchantPage.getByText("لم تُحدّد صورة", { exact: true }).waitFor();
          await merchantPage.getByText("اختر صورة", { exact: true }).waitFor();
          await merchantPage.locator('[name="paymentMethod"]').focus();
        }
        await layout(merchantPage, lang, mode, width);
        if (
          process.env.BILLING_QA_SCREENSHOTS &&
          ((lang === "ar" && mode === "dark" && width === 390) ||
            (lang === "en" && mode === "light" && width === 1440))
        ) {
          for (const [name, page] of [
            ["checkout", merchantPage],
            ["review", adminPage],
          ]) {
            await page.screenshot({
              path: path.join(process.env.BILLING_QA_SCREENSHOTS, `${name}-${lang}.png`),
            });
          }
        }
        await Promise.all([merchantPage.context().close(), adminPage.context().close()]);
        console.log("Layout verified", lang, mode, width);
      }
  const cancelled = await requestTransfer(p, runId + "-cancel", false);
  await submit(p.getByRole("button", { name: "Cancel request" }));
  await state(
    "select status from public.subscription_invoices where id=" + literal(cancelled.id),
    (r) => r.status === "cancelled",
    "cancel request",
  );
  await p.getByRole("button", { name: "Cancel request" }).waitFor({ state: "hidden" });
  const second = await requestTransfer(p, runId + "-approve", false);
  const arabicAdmin = await pageFor(admin, "ar", "dark", 390);
  await visit(arabicAdmin, true);
  await submit(
    arabicAdmin
      .locator('[data-invoice-id="' + second.id + '"]')
      .getByRole("button", { name: "الموافقة وتفعيل الاشتراك" }),
  );
  await state(
    "select status from public.subscription_invoices where id=" + literal(second.id),
    (r) => r.status === "paid",
    "approve",
  );
  await state(
    subscription,
    (r) =>
      r.plan_code === "business" &&
      r.billing_cycle === second.target_billing_cycle &&
      r.status === "active" &&
      !r.trial_ends_at &&
      !r.scheduled_plan_code,
    "approved subscription",
  );
  console.log("Receipt preview, rejection, approval and subscription activation verified.");
  await Promise.all([p.context().close(), q.context().close(), arabicAdmin.context().close()]);
}

async function providerChecks(staff) {
  const webhook = base + "/api/billing/paymob/webhook";
  const callback = base + "/api/billing/paymob/callback";
  const post = async (url, body) =>
    fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const bad = await post(webhook, { obj: {}, hmac: "invalid" });
  assert.equal(bad.status, 401);
  const unverified = await fetch(callback, { redirect: "manual" });
  assert.equal(unverified.status, 303);
  assert.equal(new URL(unverified.headers.get("location"), base).search, "?payment=unverified");
  assert.match(unverified.headers.get("cache-control"), /private/);
  assert.match(unverified.headers.get("cache-control"), /no-store/);
  assert.equal(unverified.headers.get("referrer-policy"), "no-referrer");
  // Sign only this QA invoice. Existing HMAC material stays inside the database.
  if (!originalVault?.configured) {
    const secret = literal(randomBytes(40).toString("hex"));
    const [changed] = originalVault
      ? await sql(`update public.platform_billing_secrets v set paymob_hmac_secret=${secret}
          where id=1 and md5(to_jsonb(v)::text)=${literal(originalVault.fingerprint)} returning md5(to_jsonb(v)::text) fingerprint`)
      : await sql(`insert into public.platform_billing_secrets as v(id,paymob_hmac_secret) values(1,${secret})
          on conflict do nothing returning md5(to_jsonb(v)::text) fingerprint`);
    assert.ok(changed, "vault changed concurrently");
    vaultChange = changed.fingerprint;
  }
  const invoice = randomUUID(),
    key = randomUUID();
  const order = String(Date.now()) + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const tx = order + "1";
  const [row] = await sql(`begin;
    insert into public.subscription_invoices(id,store_id,requested_by,target_plan_code,target_billing_cycle,
      amount_egp,payment_channel,idempotency_key,paymob_order_id)
    select ${literal(invoice)},${literal(tenant)},${literal(staff.id)},code,'annual',
      annual_price_egp,'paymob_card',${literal(key)},${literal(order)} from public.saas_plans where code='business';
    insert into public.subscription_payment_attempts(invoice_id,store_id,idempotency_key,payment_method,amount_cents,paymob_order_id,status)
    select id,store_id,idempotency_key,'paymob_card',amount_egp*100,paymob_order_id,'initiated'
      from public.subscription_invoices where id=${literal(invoice)};
    commit; select amount_cents from public.subscription_payment_attempts where invoice_id=${literal(invoice)}`);
  const obj = {
    amount_cents: row.amount_cents,
    created_at: new Date().toISOString(),
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    id: tx,
    integration_id: "123",
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: order },
    owner: "456",
    pending: false,
    source_data: { pan: "1234", sub_type: "MasterCard", type: "card" },
    success: true,
  };
  const fields = {
    ...obj,
    order,
    "source_data.pan": "1234",
    "source_data.sub_type": "MasterCard",
    "source_data.type": "card",
  };
  delete fields.source_data;
  async function sign(event) {
    const message = Object.keys(event)
      .sort()
      .map((k) => String(event[k]))
      .join("");
    const [{ signature }] =
      await rawSql(`select encode(extensions.hmac(${literal(message)},paymob_hmac_secret,'sha512'),'hex') signature
      from public.platform_billing_secrets where id=1`);
    return signature;
  }
  const page = await pageFor(staff);
  await visit(page, false, "?payment=unverified");
  await page.getByRole("status").filter({ hasText: "verify this payment" }).waitFor();
  for (const [outcome, pending, banner] of [
    ["pending", true, "Your payment is processing"],
    ["failed", false, "The payment did not complete"],
  ]) {
    const event = { ...fields, pending, success: false };
    const hmac = await sign(event);
    await guard();
    const result = await fetch(callback + "?" + new URLSearchParams({ ...event, hmac }), {
      redirect: "manual",
    });
    assert.equal(result.status, 303);
    const returnUrl = new URL(result.headers.get("location"), base);
    assert.equal(returnUrl.searchParams.get("payment"), outcome);
    assert.equal(returnUrl.searchParams.get("invoice"), invoice);
    await visit(page, false, returnUrl.search);
    await page.getByRole("status").filter({ hasText: banner }).waitFor();
  }
  const signature = await sign(fields);
  await guard();
  const response = await post(webhook + "?hmac=" + signature, { type: "TRANSACTION", obj });
  assert.equal(response.status, 200, "signed webhook");
  const [before] = await rawSql(subscription);
  assert.equal(before.billing_cycle, "annual");
  assert.equal(before.status, "active");
  await guard();
  const replay = await fetch(callback + "?" + new URLSearchParams({ ...fields, hmac: signature }), {
    redirect: "manual",
  });
  assert.equal(replay.status, 303);
  const location = new URL(replay.headers.get("location"), base);
  assert.equal(location.pathname, "/admin/billing");
  assert.equal(location.searchParams.get("payment"), "success");
  assert.equal(location.searchParams.get("invoice"), invoice);
  assert.deepEqual(await rawSql(subscription), [before], "callback activated the subscription twice");
  const [paid] =
    await rawSql(`select i.status invoice_status, a.status attempt_status from public.subscription_invoices i
    join public.subscription_payment_attempts a on a.invoice_id=i.id where i.id=${literal(invoice)}`);
  assert.deepEqual(paid, { invoice_status: "paid", attempt_status: "paid" });
  await visit(page, false, location.search);
  await page.getByRole("status").filter({ hasText: "Payment received" }).waitFor();
  await page.context().close();
  console.log("Unsigned notifications rejected; signed webhook and callback settled the QA invoice once.");
}

async function contracts() {
  const files = readdirSync("qa")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const source = readFileSync(path.join("qa", file), "utf8").replace(/^\uFEFF/, "");
    const ending = source.slice(source.lastIndexOf("rollback;")).trim();
    assert.ok(/^rollback;(?:\s+select '[^'\n]*' as (?:result|verified);)?$/i.test(ending), file);
    await sql(source);
    console.log("SQL PASS", file);
  }
  console.log(files.length + "/" + files.length + " SQL contracts passed.");
}

async function run() {
  await guard();
  const baseline = await rawSql(baselineQuery);
  try {
    const contractsOnly = process.argv.includes("--contracts-only");
    if (!contractsOnly) await startServer();
    const buyer = await identity("buyer"),
      staff = await identity("staff"),
      admin = await identity("reviewer");
    await setup(staff, admin);
    await audit("BEFORE", buyer, staff);
    await contracts();
    if (!contractsOnly) {
      await workflow(staff, admin);
      await providerChecks(staff);
    }
    await audit("AFTER", buyer, staff);
    assert.deepEqual(errors, [], "Unexpected browser/server errors: " + JSON.stringify(errors));
  } finally {
    await browser?.close();
    if (ingress?.listening) {
      ingress.closeAllConnections();
      await new Promise((resolve) => ingress.close(resolve));
    }
    child?.kill();
    await cleanup();
    assert.deepEqual(await rawSql(baselineQuery), baseline, "tenant or theme baseline drift");
    console.log("Nova, Omar, subscriptions and platform theme match their original fingerprints.");
  }
}
await run();
