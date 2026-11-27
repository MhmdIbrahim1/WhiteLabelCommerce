/**
 * Run from the repository root after a production build.
 * node qa/shopify_storefront_auth_browser.mjs [--audit-only]
 * Requires SUPABASE_ACCESS_TOKEN, web-store/.env.local, Edge and playwright-core on NODE_PATH.
 * Set NEXT_PUBLIC_EMAIL_PASSWORD_RESET_ENABLED=true for both the build and this run to exercise apex recovery.
 * The OTP test receives real email in a fresh password-protected https://mail.tm inbox.
 */
import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";

const web = path.resolve("web-store");
const require = createRequire(path.join(web, "package.json"));
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const cfg = parseEnv(readFileSync(path.join(web, ".env.local"), "utf8").replace(/^\uFEFF/, ""));
const ref = "zpabcnskkbpplurngtle";
const url = cfg.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, ref + ".supabase.co");
assert.ok(process.env.SUPABASE_ACCESS_TOKEN);
const anon = cfg.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = (key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = client(cfg.SUPABASE_SERVICE_ROLE_KEY).auth.admin;
const base = "http://localhost:3000";
const nova = "00000000-0000-0000-0000-000000000001";
const omar = "b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c";
const run = "store-auth-" + randomUUID();
const ids = new Map();
const ticket = randomUUID();
const fields = [
  "products.cost_price",
  "store_subscriptions.admin_notes",
  "store_invitations.token_hash",
  "orders.delivery_token",
  "order_items.unit_cost",
  "platform_billing_secrets.paymob_api_key",
  "platform_billing_secrets.paymob_hmac_secret",
];
const lit = (s) => "'" + String(s).replaceAll("'", "''") + "'";
let browser, ingress, child, inbox;

async function sql(query) {
  const response = await fetch("https://api.supabase.com/v1/projects/" + ref + "/database/query", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.SUPABASE_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok)
    throw Error(
      "Management SQL failed (" + response.status + "): " + (await response.json()).message?.slice(0, 280),
    );
  return response.json();
}
async function guard() {
  assert.deepEqual(
    await sql("select slug,id from public.stores where slug in ('nova-store','omar-a7a') order by slug"),
    [
      { slug: "nova-store", id: nova },
      { slug: "omar-a7a", id: omar },
    ],
  );
}
async function write(query) {
  await guard();
  return sql(query);
}
async function baseline() {
  return sql(`select s.slug,md5(to_jsonb(s)::text) store,md5(to_jsonb(b)::text) subscription,
    (select md5(jsonb_agg(jsonb_build_array(p.id,p.stock) order by p.id)::text) from public.products p where p.store_id=s.id) stock,
    (select md5(jsonb_agg(to_jsonb(v) order by v.product_id,v.color,v.size)::text) from public.product_variants v where v.store_id=s.id) variants,
    (select md5(jsonb_agg(to_jsonb(t) order by t.id)::text) from public.platform_theme_settings t) theme,
    (select md5(jsonb_agg(to_jsonb(t) order by t.id)::text) from public.platform_billing_settings t) billing,
    (select md5(jsonb_agg(to_jsonb(t) order by t.id)::text) from public.platform_billing_secrets t) vault
    from public.stores s left join public.store_subscriptions b on b.store_id=s.id
    where s.slug in ('nova-store','omar-a7a') order by s.slug`);
}
async function identity(role) {
  const email = run + "-" + role + "@example.com",
    password = randomBytes(24).toString("hex");
  await guard();
  const result = await admin.createUser({ email, password, email_confirm: true });
  if (result.error) throw Error("QA account creation failed: " + result.error.message);
  const id = result.data.user.id;
  ids.set(email, id);
  if (role === "staff")
    await write(`insert into public.store_members(store_id,user_id,role,permissions)
    values (${lit(nova)},${lit(id)},'custom','{"manage_orders":true}')`);
  await guard();
  const login = await client(anon).auth.signInWithPassword({ email, password });
  if (login.error) throw Error("QA sign-in failed: " + login.error.message);
  return { email, token: login.data.session.access_token };
}
async function audit(label, buyer, staff) {
  for (const field of fields) {
    const [table, col] = field.split(".");
    const statuses = await Promise.all(
      [anon, buyer.token, staff.token].map(async (token) => {
        const response = await fetch(url + "/rest/v1/" + table + "?select=" + col + "&limit=0", {
          headers: { apikey: anon, Authorization: "Bearer " + token },
        });
        await response.arrayBuffer();
        return response.status;
      }),
    );
    assert.deepEqual(statuses, [401, 403, 403], field);
    console.log(label, field, statuses.join("/"));
  }
}
async function mail(endpoint, method = "GET", body, token) {
  const response = await fetch("https://api.mail.tm" + endpoint, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error("Private inbox " + method + " " + endpoint.split("/")[1] + " returned " + response.status);
  return response.status === 204 ? null : response.json();
}
async function newInbox() {
  const domains = (await mail("/domains"))["hydra:member"];
  const address =
    "wlc" + randomBytes(10).toString("hex") + "@" + domains.find((d) => d.isActive && !d.isPrivate).domain;
  const credentials = { address, password: randomBytes(28).toString("hex") };
  const account = await mail("/accounts", "POST", credentials);
  inbox = { id: account.id, address, credentials, consumed: new Set() };
  inbox.token = (await mail("/token", "POST", credentials)).token;
}
async function receiveCode() {
  for (let i = 0; i < 48; i++) {
    const messages = (await mail("/messages", "GET", undefined, inbox.token))["hydra:member"];
    for (const entry of messages) {
      if (inbox.consumed.has(entry.id)) continue;
      const message = await mail("/messages/" + entry.id, "GET", undefined, inbox.token);
      if (!message.to.some((to) => to.address === inbox.address)) continue;
      const code = message.text?.match(/\b\d{6}\b/)?.[0];
      if (code) {
        inbox.consumed.add(entry.id);
        return code;
      }
    }
    await delay(2500);
  }
  throw Error("Real OTP did not arrive in the private inbox");
}
async function start() {
  const probe = net.createServer().listen(0, "localhost");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  child = spawn(
    process.execPath,
    [path.join(web, "node_modules/next/dist/bin/next"), "start", "-H", "localhost", "-p", String(port)],
    {
      cwd: web,
      windowsHide: true,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PLATFORM_ROOT_DOMAIN: "shopstage.live",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let ready = false;
  child.stdout.on("data", (data) => {
    if (/ready/i.test(String(data))) ready = true;
  });
  child.stderr.on("data", () => {});
  for (let i = 0; !ready; i++) {
    if (i > 200 || child.exitCode !== null) throw Error("next start failed");
    await delay(100);
  }
  // Model TLS termination while keeping the browser, OAuth redirect_to and cookie jar on localhost.
  ingress = http.createServer((req, res) => {
    const host = req.headers.host?.startsWith("nova-store.localhost:")
      ? "nova-store.shopstage.live"
      : "shopstage.live";
    const headers = { ...req.headers, host, "x-forwarded-host": host, "x-forwarded-proto": "https" };
    if (headers.origin === base) headers.origin = "https://" + host;
    const upstream = http.request(
      { hostname: "localhost", port, path: req.url, method: req.method, headers },
      (r) => {
        const headers = { ...r.headers };
        if (headers.location?.startsWith("https://" + host + "/"))
          headers.location =
            "http://" +
            req.headers.host +
            new URL(headers.location).pathname +
            new URL(headers.location).search;
        res.writeHead(r.statusCode, headers);
        r.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
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

async function cleanup() {
  if (inbox) {
    const [user] = await sql("select id from auth.users where email=" + lit(inbox.address));
    if (user) ids.set(inbox.address, user.id);
  }
  for (const [email, id] of ids) {
    const result = await admin.getUserById(id);
    assert.equal(result.data.user?.email, email);
    await write(`begin;
      delete from support_internal.ticket_rate_limits where ticket_id=${lit(ticket)};
      delete from public.support_tickets where id=${lit(ticket)} and customer_id=${lit(id)} and store_id=${lit(nova)};
      delete from public.store_members where user_id=${lit(id)} and store_id=${lit(nova)};
      delete from public.store_customers where user_id=${lit(id)} and store_id in (${lit(nova)},${lit(omar)});
      commit;`);
    await guard();
    const deleted = await admin.deleteUser(id);
    if (deleted.error) throw Error("QA account cleanup failed");
    const [check] = await sql(`select (select count(*) from auth.users where id=${lit(id)})
      +(select count(*) from auth.identities where user_id=${lit(id)})
      +(select count(*) from auth.sessions where user_id=${lit(id)})
      +(select count(*) from customer_auth.verified_mailboxes where user_id=${lit(id)})
      +(select count(*) from public.store_customers where user_id=${lit(id)})
      +(select count(*) from public.store_members where user_id=${lit(id)}) residual`);
    assert.equal(Number(check.residual), 0);
  }
  const [threads] = await sql(`select (select count(*) from public.support_tickets where id=${lit(ticket)})
    +(select count(*) from public.support_ticket_messages where ticket_id=${lit(ticket)})
    +(select count(*) from support_internal.ticket_rate_limits where ticket_id=${lit(ticket)}) residual`);
  assert.equal(Number(threads.residual), 0);
  if (inbox) {
    const token = inbox.token || (await mail("/token", "POST", inbox.credentials)).token;
    assert.equal(await mail("/accounts/" + inbox.id, "DELETE", undefined, token), null);
  }
  console.log(
    "Verified cleanup of",
    ids.size,
    "QA identities, their memberships and ticket fixtures" + (inbox ? ", and the private inbox." : "."),
  );
}

const errors = [];
let measurements = 0;
async function context(lang = "en", mode = "light", width = 1440) {
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    colorScheme: mode,
    locale: lang === "en" ? "en-US" : "ar-EG",
    serviceWorkers: "block",
  });
  await ctx.addCookies(
    [
      ["nova_lang", lang],
      ["shop_theme", mode],
      ["wlc_workspace_mode", mode],
    ].map(([name, value]) => ({ name, value, url: base })),
  );
  ctx.on("page", (page) => {
    page.setDefaultTimeout(25000);
    page.on("pageerror", (e) =>
      errors.push("page " + new URL(page.url()).pathname + " " + e.message.slice(0, 160)),
    );
    page.on("console", (m) => {
      if (m.type() === "error")
        errors.push(
          "console " +
            new URL(page.url()).pathname +
            " " +
            m
              .text()
              .replace(/https?:\/\/\S+/g, "[URL]")
              .slice(0, 160),
        );
    });
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(r.status() + " " + new URL(r.url()).pathname);
    });
    page.on("requestfailed", (r) => {
      if (r.failure()?.errorText !== "net::ERR_ABORTED")
        errors.push("network " + new URL(r.url()).pathname + " " + r.failure()?.errorText);
    });
  });
  return ctx;
}
async function visit(page, pathname, selector = "h1") {
  const r = await page.goto(base + pathname, { waitUntil: "domcontentloaded", timeout: 65000 });
  assert.equal(r?.status(), 200, pathname);
  await page.locator(selector).first().waitFor();
}
async function layout(page, lang, mode, width) {
  const metrics = await page.evaluate(async () => {
    await document.fonts.ready;
    const root = document.documentElement;
    return {
      lang: root.lang,
      dir: root.dir,
      width: window.innerWidth,
      mode:
        document.querySelector(".ws-surface")?.dataset.mode ??
        document.querySelector("[data-shop-theme]")?.dataset.shopTheme,
      overflow: Math.max(document.body.scrollWidth, root.scrollWidth) - root.clientWidth,
    };
  });
  assert.deepEqual(
    metrics,
    { lang: lang === "en" ? "en" : "ar-EG", dir: lang === "en" ? "ltr" : "rtl", width, mode, overflow: 0 },
    new URL(page.url()).pathname,
  );
  measurements++;
}
async function matrix() {
  for (const lang of ["en", "ar"])
    for (const mode of ["light", "dark"])
      for (const width of [1440, 390]) {
        const ctx = await context(lang, mode, width);
        const p = await ctx.newPage();
        try {
          for (const route of [
            "/login",
            "/register",
            "/s/nova-store/login",
            "/s/nova-store/register",
            "/s/nova-store/account",
            "/privacy",
            "/terms",
          ]) {
            await visit(p, route);
            if (/login|register|account/.test(route)) {
              const tenant = route.startsWith("/s/");
              await p.getByRole("button", { name: /Google/ }).waitFor();
              assert.equal(await p.locator("input[type=password]").count(), tenant ? 0 : 1, route);
              assert.equal(await p.locator("button.hybrid-auth-tab").count(), tenant ? 0 : 2, route);
              assert.equal(await p.locator("input[type=email]").count(), 1);
            } else {
              const body = await p.locator("main").innerText();
              assert.match(
                body,
                new RegExp(
                  lang === "ar" ? "[\\u0600-\\u06ff]" : route === "/privacy" ? "Privacy" : "Terms",
                  "i",
                ),
              );
              assert.ok(body.includes("noreply@shopstage.live"));
            }
            await layout(p, lang, mode, width);
          }
        } finally {
          await ctx.close();
        }
      }
  console.log("Auth/legal display matrix:", measurements, "views");
}
async function membershipMatrix(session) {
  for (const lang of ["en", "ar"])
    for (const mode of ["light", "dark"])
      for (const width of [1440, 390]) {
        const ctx = await context(lang, mode, width);
        try {
          await ctx.addCookies(session);
          const p = await ctx.newPage();
          await visit(p, "/s/nova-store/account");
          await p.getByRole("heading", { name: "QA Nova Shopper" }).waitFor();
          await layout(p, lang, mode, width);
          await visit(p, "/s/omar-a7a/orders", "input[name=full_name]");
          assert.equal(new URL(p.url()).pathname, "/s/omar-a7a/welcome");
          assert.equal(await p.locator("input[name=full_name]").inputValue(), "");
          assert.equal(await p.locator("input[name=phone]").inputValue(), "");
          await layout(p, lang, mode, width);
        } finally {
          await ctx.close();
        }
      }
}
async function oauth(p, ctx) {
  for (const prefix of ["", "/s/nova-store", "/store/omar-a7a"]) {
    const next = prefix ? prefix + "/orders" : "/create-store";
    await visit(p, prefix + "/login?next=" + encodeURIComponent(next));
    // Stop at the consent boundary. Inspect the real authorize endpoint's redirect separately.
    const endpoint = url + "/auth/v1/authorize";
    await p.route(endpoint + "**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<title>OAuth initiation captured</title>",
      }),
    );
    const pending = p.waitForRequest((r) => r.url().startsWith(endpoint));
    await p.getByRole("button", { name: /Google/ }).click();
    const target = new URL((await pending).url());
    assert.equal(target.searchParams.get("provider"), "google");
    assert.equal(target.searchParams.get("code_challenge_method")?.toLowerCase(), "s256");
    assert.ok(target.searchParams.get("code_challenge"));
    const redirect = new URL(target.searchParams.get("redirect_to"));
    assert.equal(redirect.origin, base);
    assert.equal(redirect.pathname, prefix + "/auth/callback");
    assert.equal(redirect.searchParams.get("next"), next);
    assert.ok((await ctx.cookies(base)).some((c) => c.name.includes("code-verifier")));
    await guard();
    const initiated = await fetch(target, { redirect: "manual" });
    assert.ok([302, 303].includes(initiated.status));
    assert.equal(new URL(initiated.headers.get("location")).hostname, "accounts.google.com");
    await p.unroute(endpoint + "**");
  }
  for (const lang of ["en", "ar"]) {
    await ctx.addCookies([{ name: "nova_lang", value: lang, url: base }]);
    for (const prefix of ["", "/s/nova-store"])
      for (const [params, error] of [
        ["error=access_denied&next=%2F%2Fevil.example", "oauth_cancelled"],
        ["code=bad&next=" + encodeURIComponent(prefix ? "/admin" : "//evil.example"), "oauth_failed"],
        ["code=" + randomUUID(), "oauth_failed"],
        [
          "error=server_error&next=" + encodeURIComponent(prefix ? "/create-store" : "//evil.example"),
          "oauth_failed",
        ],
      ]) {
        const route = prefix + "/auth/callback?" + params;
        const res = await ctx.request.get(base + route, { maxRedirects: 0 });
        assert.equal(res.status(), 303);
        assert.match(res.headers()["cache-control"], /private.*no-store/);
        assert.equal(res.headers()["referrer-policy"], "no-referrer");
        const dest = new URL(res.headers().location, base);
        assert.equal(dest.origin, base);
        assert.equal(dest.pathname, prefix + "/login");
        assert.equal(dest.searchParams.get("error"), error);
        assert.equal(dest.searchParams.has("next"), false);
        await visit(p, route, ".auth-error[role=alert]");
        assert.match(
          await p.locator(".auth-error[role=alert]").innerText(),
          error === "oauth_cancelled"
            ? lang === "ar"
              ? /ألغيت/
              : /cancelled/
            : lang === "ar"
              ? /تعذّر/
              : /could not be completed/,
        );
      }
  }
  await ctx.addCookies([{ name: "nova_lang", value: "en", url: base }]);
  const subdomain = await ctx.request.get(base + "/auth/callback?error=access_denied&next=/admin", {
    maxRedirects: 0,
    headers: { Host: "nova-store.localhost:3000" },
  });
  assert.equal(subdomain.status(), 303);
  const dest = new URL(subdomain.headers().location, "http://nova-store.localhost:3000");
  assert.equal(dest.pathname, "/login");
  assert.equal(dest.searchParams.has("next"), false);
  console.log("Google PKCE initiation, provider redirects and localized callback errors passed.");
}
async function duplicateRegistration(p, ctx, buyer) {
  await visit(p, "/register?next=/create-store");
  await p.locator(".auth-form .auth-submit-btn:enabled").waitFor();
  await p.locator("input[name=full_name]").fill("QA Merchant");
  await p.locator("input[name=phone]").fill("01000000000");
  await p.locator("input[name=email]").fill(buyer.email);
  await p.locator("input[type=password]").fill(randomBytes(16).toString("hex"));
  await guard();
  await p.locator(".auth-form .auth-submit-btn").click();
  await p.locator(".otp-boxes").waitFor();
  assert.equal(
    (await ctx.cookies(base)).some((c) => /-auth-token(?:\.\d+)?$/.test(c.name)),
    false,
  );
  assert.equal(new URL(p.url()).pathname, "/register");
  console.log("Existing-email platform registration stayed signed out.");
}
async function shopperJourney(page) {
  await newInbox();
  const first = "/s/nova-store",
    second = "/s/omar-a7a";
  await visit(page, first + "/register");
  await page.locator(".auth-form .auth-submit-btn:enabled").waitFor();
  await page.locator("input[type=email]").fill(inbox.address);
  await guard();
  await page.locator(".auth-form .auth-submit-btn").click();
  const firstSendTime = Date.now();
  await page.locator(".otp-boxes").waitFor();
  assert.equal(await page.locator(".otp-boxes input").count(), 6);
  assert.ok(await page.getByRole("button", { name: /resend in/i }).isDisabled());
  const code = await receiveCode();
  console.log("Received the signup code in the private QA inbox.");
  await page.locator(".otp-boxes input").first().fill(code);
  await guard();
  await page.locator(".auth-form .auth-submit-btn").click();
  await page.waitForURL((u) => u.pathname === first + "/welcome");
  const [user] = await sql("select id from auth.users where email=" + lit(inbox.address));
  assert.ok(user);
  ids.set(inbox.address, user.id);
  const id = lit(user.id);
  const phone = "010" + String(randomInt(100000000)).padStart(8, "0");
  const [available] = await sql(
    "select not exists (select from public.store_customers where store_id=" +
      lit(nova) +
      " and phone in (" +
      lit(phone) +
      "," +
      lit("20" + phone.slice(1)) +
      ")) as ok",
  );
  assert.ok(available.ok, "QA phone unavailable");
  for (const [prefix, label, number] of [
    [first, "QA Nova Shopper", phone],
    [second, "QA Omar Shopper", ""],
  ]) {
    if (prefix === second) {
      const session = (await page.context().cookies(base)).filter((c) =>
        /-auth-token(?:\.\d+)?$/.test(c.name),
      );
      assert.ok(session.length);
      await membershipMatrix(session);
      for (const path of ["/orders", "/account"]) {
        await visit(page, prefix + path, "input[name=full_name]");
        assert.equal(new URL(page.url()).pathname, prefix + "/welcome");
        assert.equal(new URL(page.url()).searchParams.get("next"), prefix + path);
      }
      const before = await sql(
        "select id from public.store_customers where user_id=" +
          id +
          " and store_id=" +
          lit(omar) +
          " and enrolled_at is not null",
      );
      assert.equal(before.length, 0);
    }
    const heading = await page.getByRole("heading", { level: 1 }).innerText();
    const brand = await page.locator(".access-store-mark bdi").first().textContent();
    assert.ok(brand?.trim() && heading.includes(brand.trim()), "Welcome uses this store's identity");
    assert.ok(await page.locator("bdi[dir=ltr]").filter({ hasText: inbox.address }).count());
    assert.equal(await page.locator("input[name=full_name]").inputValue(), "");
    assert.equal(await page.locator("input[name=phone]").inputValue(), "");
    await page.locator("input[name=full_name]").fill(label);
    if (number) await page.locator("input[name=phone]").fill(number);
    await guard();
    await page
      .locator("form")
      .filter({ has: page.locator("input[name=full_name]") })
      .locator("button")
      .click();
    await page.waitForURL((u) => u.pathname === prefix + "/account");
    await page.getByRole("heading", { name: label }).waitFor();
    console.log("Verified enrollment on", prefix);
    assert.equal(await page.locator("a[href$='/account/security']").count(), 0);
  }
  const rows = await sql(
    "select store_id,full_name,phone,enrolled_at is not null enrolled from public.store_customers where user_id=" +
      id +
      " order by store_id",
  );
  assert.deepEqual(rows, [
    { store_id: nova, full_name: "QA Nova Shopper", phone, enrolled: true },
    { store_id: omar, full_name: "QA Omar Shopper", phone: "", enrolled: true },
  ]);
  await visit(page, second + "/welcome");
  assert.equal(new URL(page.url()).pathname, second + "/account");
  await write(`begin;
    insert into public.support_tickets(id,store_id,customer_id,subject,message) values
      (${lit(ticket)},${lit(nova)},${id},'QA closed thread','QA initial question');
    insert into public.support_ticket_messages(ticket_id,store_id,sender_role,sender_user_id,body)
      values (${lit(ticket)},${lit(nova)},'customer',${id},'QA initial question'),
             (${lit(ticket)},${lit(nova)},'merchant',null,'QA resolved');
    update public.support_tickets set status='closed' where id=${lit(ticket)};
    commit;`);
  await visit(page, first + "/account/tickets");
  await page.getByRole("link", { name: /QA closed thread/ }).click();
  await page.getByText("QA resolved", { exact: true }).waitFor();
  const conversation = await page.locator(".account-thread ol").innerText();
  assert.ok(
    conversation.includes("QA initial question") &&
      conversation.indexOf("QA initial question") < conversation.indexOf("QA resolved"),
  );
  assert.equal(await page.locator(".account-thread textarea").count(), 0);
  const fresh = await context();
  const p = await fresh.newPage();
  try {
    await visit(p, second + "/login");
    await p.locator(".auth-form .auth-submit-btn:enabled").waitFor();
    await p.locator("input[type=email]").fill(inbox.address);
    await delay(Math.max(0, firstSendTime + 62000 - Date.now()));
    await guard();
    await p.locator(".auth-form .auth-submit-btn").click();
    await p.locator(".otp-boxes").waitFor();
    await p
      .locator(".otp-boxes input")
      .first()
      .fill(await receiveCode());
    await guard();
    await p.locator(".auth-form .auth-submit-btn").click();
    await p.waitForURL((u) => u.pathname === second + "/account");
    await p.getByRole("heading", { name: "QA Omar Shopper" }).waitFor();
  } catch (error) {
    console.error("Returning shopper sign-in", new URL(p.url()).pathname, await p.locator(".auth-error").allTextContents());
    throw error;
  } finally {
    await fresh.close();
  }
  console.log(
    "Resend OTP, both store enrollments, order gate, persisted isolated profiles and closed ticket history passed.",
  );
}
async function runBrowser(buyer) {
  await start();
  const ctx = await context();
  const p = await ctx.newPage();
  try {
    await oauth(p, ctx);
    for (const route of [
      "/forgot-password",
      "/reset-password",
      "/s/nova-store/forgot-password",
      "/store/nova-store/reset-password",
    ]) {
      await visit(p, route);
      if (route.startsWith("/s/") || route.startsWith("/store/")) {
        assert.equal(await p.locator("input[type=password], input[type=email]").count(), 0);
        assert.ok(await p.getByRole("link", { name: /sign in|log in|continue/i }).count());
      } else {
        const recoveryEnabled =
          (process.env.NEXT_PUBLIC_EMAIL_PASSWORD_RESET_ENABLED ??
            cfg.NEXT_PUBLIC_EMAIL_PASSWORD_RESET_ENABLED) === "true";
        if (recoveryEnabled) await p.locator("input[type=email]").waitFor();
        else await p.getByText(/email recovery is unavailable/i).waitFor();
      }
    }
    await visit(p, "/");
    for (const path of ["/privacy", "/terms"]) {
      await p.locator("footer a[href='" + path + "']").click();
      await p.waitForURL((u) => u.pathname === path);
      if (path === "/privacy") {
        await p.getByRole("button", { name: "Dark mode", exact: true }).click();
        await p.locator(".ws-surface[data-mode=dark]").waitFor();
        await p.locator("[data-lang-toggle=en]").click();
        await p.getByRole("heading", { level: 1, name: "سياسة الخصوصية" }).waitFor();
        assert.equal(await p.locator("html").getAttribute("dir"), "rtl");
        await p.locator("[data-lang-toggle=ar]").click();
        await p.getByRole("heading", { level: 1, name: "Privacy Policy" }).waitFor();
        await p.getByRole("button", { name: "Dark mode", exact: true }).click();
        await p.locator(".ws-surface[data-mode=light]").waitFor();
      }
      await p.locator("header a[href='/']").first().click();
      await p.waitForURL((u) => u.pathname === "/");
      await p.locator("footer").waitFor();
    }
    await duplicateRegistration(p, ctx, buyer);
    await shopperJourney(p);
  } catch (error) {
    const notices = await p.locator(".auth-error").allTextContents();
    console.error("Browser check at", new URL(p.url()).pathname, error.message, notices.join(" "), errors.join(" | "));
    throw error;
  } finally {
    await ctx.close();
  }
  await matrix();
  assert.deepEqual(errors, [], "Browser diagnostics: " + errors.join(" | "));
  console.log("0px horizontal overflow; 0 console, page and unexpected HTTP/network errors.");
}

const original = await baseline();
try {
  const buyer = await identity("buyer"),
    staff = await identity("staff");
  await audit("BEFORE", buyer, staff);
  if (!process.argv.includes("--audit-only")) {
    await runBrowser(buyer);
    await audit("AFTER", buyer, staff);
  }
} finally {
  await browser?.close();
  if (ingress?.listening) {
    ingress.closeAllConnections();
    await new Promise((resolve) => ingress.close(resolve));
  }
  child?.kill();
  await cleanup();
  assert.deepEqual(await baseline(), original, "store, inventory or platform baseline drift");
  console.log("Store, subscription, inventory, theme, billing settings and vault baselines match.");
}
