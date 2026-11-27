/**
 * Run from the repository root with Node 22+ and an existing web-store production build.
 *   node qa/merchant_ops_browser.mjs
 *   node qa/merchant_ops_browser.mjs --audit-only
 *
 * Uses the project configured in web-store/.env.local and SUPABASE_ACCESS_TOKEN from the environment.
 * Install playwright-core in a separate tools directory and point NODE_PATH at its node_modules,
 * or use a copy already available to web-store. EDGE_EXECUTABLE_PATH can override the Windows Edge path.
 * The full run starts next start behind a loopback preview ingress on localhost:3000.
 * Both modes create temporary buyer and merchant accounts. The full run also creates scoped fixtures.
 * Cleanup runs in finally, including on assertion failures. Run after applying the Batch 4 migration
 * and hiding the four historical Nova reviews.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
assert.ok(process.env.SUPABASE_ACCESS_TOKEN, "Set SUPABASE_ACCESS_TOKEN before running merchant QA.");
const service = createClient(url, cfg.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const base = "http://localhost:3000",
  runId = "b4-qa-" + randomUUID(),
  customerName = runId + " Buyer",
  coupon = "B4QA20",
  orderId = randomUUID();
const users = [],
  reviewIds = [],
  columns = [
    "products.cost_price",
    "store_subscriptions.admin_notes",
    "store_invitations.token_hash",
    "orders.delivery_token",
    "order_items.unit_cost",
  ];
let child, ingress, browser;
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
  if (kind === "staff")
    await sql(
      "insert into public.store_members(store_id,user_id,role,permissions) values (" +
        literal(nova) +
        "," +
        literal(id) +
        ',\'custom\',\'{"manage_orders":true,"manage_products":true,"manage_customers":true}\')',
    );
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
  for (const pair of columns) {
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
async function setupFixtures(buyer) {
  const tenant = literal(nova);
  const buyerId = literal(buyer.id);
  const order = literal(orderId);
  await sql(`
    insert into public.store_customers (store_id, user_id, full_name)
    values (${tenant}, ${buyerId}, ${literal(customerName)})
    on conflict (store_id, user_id) where user_id is not null
    do update set full_name = excluded.full_name
  `);
  const [created] = await sql(`
    begin;
    insert into public.orders (id, store_id, user_id, customer_id, recipient_name, status, payment_status,
      payment_method, shipping_address, currency, subtotal, shipping_fee, discount_amount, coupon_code,
      wallet_discount, cashback_earned)
    select ${order}, store_id, user_id, id, null, 'pending', 'paid', 'cod', 'QA fixture', 'EGP',
      80, 10, 20, ${literal(coupon)}, 5, 2
    from public.store_customers where store_id = ${tenant} and user_id = ${buyerId};
    insert into public.order_items (order_id, product_name, unit_price, quantity)
    values (${order}, 'QA item', 50, 2);
    commit;
    select total from public.orders where id = ${order}
  `);
  assert.equal(Number(created.total), 85);
  for (let index = 0; index < 21; index++) reviewIds.push(randomUUID());
  await sql(`
    insert into public.product_reviews (id, store_id, product_id, user_id, author_name, rating, comment, status)
    select (array[${reviewIds.map(literal).join(",")}]::uuid[])[p.n], ${tenant}, p.id, ${buyerId},
      ${literal(runId)}, 3, ${literal(runId + " hidden pagination fixture")}, 'hidden'
    from (
      select id, (row_number() over (order by id))::integer n from public.products
      where store_id = ${tenant} order by id limit 21
    ) p
  `);
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
  child.stderr.on("data", () => {});
  for (let i = 0; !ready; i++) {
    if (i > 200 || child.exitCode !== null) throw Error("Next did not start");
    await delay(100);
  }
  const host = "wlc-merchant-qa.vercel.app";
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
async function cleanup() {
  const tenant = literal(nova);
  const thisRun = `left(subject, ${runId.length}) = ${literal(runId)}`;
  const captured = await sql(`
    select id from public.support_tickets where store_id = ${tenant} and ${thisRun}
  `);
  const failures = [];
  for (const { id, email } of [...users].reverse()) {
    try {
      const user = literal(id);
      const ticketScope = `store_id = ${tenant} and customer_id = ${user} and ${thisRun}`;
      const clauses = [];
      if (reviewIds.length) {
        clauses.push(
          `delete from public.product_reviews where store_id = ${tenant} and user_id = ${user}
            and id = any(array[${reviewIds.map(literal).join(",")}]::uuid[])`,
          `delete from support_internal.ticket_rate_limits where ticket_id in
            (select id from public.support_tickets where ${ticketScope})`,
        );
      }
      clauses.push(
        `delete from public.support_tickets where ${ticketScope}`,
        `delete from public.orders where store_id = ${tenant} and user_id = ${user} and id = ${literal(orderId)}`,
        `delete from public.store_customers where store_id = ${tenant} and user_id = ${user}`,
        `delete from public.store_members where store_id = ${tenant} and user_id = ${user}`,
      );
      await sql(`begin; ${clauses.join(";\n")}; commit`);
      await guard();
      const actual = await service.auth.admin.getUserById(id);
      assert.equal(actual.data.user?.email, email);
      const deletion = await service.auth.admin.deleteUser(id);
      if (deletion.error) throw Error("cleanup auth: " + deletion.error.message);
      const [check] = await sql(`
        select (select count(*) from auth.users where id = ${user})
          + (select count(*) from public.store_members where user_id = ${user})
          + (select count(*) from public.store_customers where user_id = ${user})
          + (select count(*) from public.product_reviews where user_id = ${user})
          + (select count(*) from public.support_tickets where customer_id = ${user}) as residual
      `);
      assert.equal(Number(check.residual), 0);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length) throw Error("QA cleanup: " + failures.join(" / "));
  if (captured.length) {
    const ids = captured.map(({ id }) => literal(id)).join(",");
    const [result] = await sql(`
      select (select count(*) from public.support_tickets where id in (${ids}))
        + (select count(*) from public.support_ticket_messages where ticket_id in (${ids}))
        + (select count(*) from support_internal.ticket_rate_limits where ticket_id in (${ids})) as leftover
    `);
    assert.equal(Number(result.leftover), 0);
    console.log("Ticket/thread/rate cleanup", captured.length, "tickets, 0 residual rows");
  }
  console.log("Cleanup verified for " + users.length + " fixture accounts");
}
async function run() {
  try {
    const buyer = await identity("buyer"),
      staff = await identity("staff");
    await audit("BEFORE", buyer, staff);
    if (!process.argv.includes("--audit-only")) {
      await setupFixtures(buyer);
      await startServer();
      console.log(
        "Browser checks",
        JSON.stringify(
          await browserChecks({
            browser,
            base,
            staffCookies: staff.cookies,
            buyerCookies: buyer.cookies,
            orderId,
            customerName,
            coupon,
            runId,
            sql,
            guard,
          }),
        ),
      );
      await audit("AFTER", buyer, staff);
    }
  } finally {
    await browser?.close();
    if (ingress?.listening) {
      ingress.closeAllConnections();
      await new Promise((r) => ingress.close(r));
    }
    child?.kill();
    await cleanup();
  }
}

async function browserChecks({
  browser,
  base,
  staffCookies,
  buyerCookies,
  orderId,
  customerName,
  coupon,
  runId,
  sql,
  guard,
}) {
  const store = "00000000-0000-0000-0000-000000000001";
  const lit = (v) => "'" + String(v).replaceAll("'", "''") + "'";
  const subject = runId + " linked order";
  const initialBody = runId + " delivery question";
  const reply = runId + " merchant reply";
  const rowWhere =
    "store_id = " + lit(store) + " and subject = " + lit(subject) + " and order_id = " + lit(orderId);
  const errors = [],
    measurements = [];
  const [order] = await sql(`
    select id, (created_at at time zone 'UTC')::date::text as order_day, subtotal, total,
      discount_amount, shipping_fee, wallet_discount, cashback_earned
    from public.orders where store_id = ${lit(store)} and id = ${lit(orderId)}
  `);
  assert.ok(order, "order fixture");
  const [counts] = await sql(`
    select count(*)::int total, count(*) filter (where status = 'hidden')::int hidden,
      count(*) filter (where status = 'published')::int published,
      coalesce(avg(rating) filter (where status = 'published'), 0) avg_rating,
      count(*) filter (where status = 'published' and (
        nullif(btrim(admin_reply), '') is null or (
          exists (select 1 from public.review_replies rr where rr.store_id = r.store_id
                  and rr.review_id = r.id and rr.role = 'customer')
          and not exists (select 1 from public.review_replies rr where rr.store_id = r.store_id
                          and rr.review_id = r.id and rr.role = 'merchant')
        )
      ))::int waiting
    from public.product_reviews r where store_id = ${lit(store)}
  `);
  assert.ok(Number(counts.hidden) > 20, "hidden page two fixture");
  const seeds = await sql(`
    select status, count(*)::int n from public.product_reviews
    where store_id = ${lit(store)} and user_id in (
      '10c00000-0000-4000-8000-000000000001', '10c00000-0000-4000-8000-000000000002',
      '10c00000-0000-4000-8000-000000000003', '10c00000-0000-4000-8000-000000000004'
    ) group by status
  `);
  assert.deepEqual(seeds, [{ status: "hidden", n: 4 }]);
  const digit = (str) =>
    String(str)
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
      .replaceAll("٫", ".")
      .replace(/[^0-9.-]/g, "")
      .replace(/\.(?=\D|$)/g, "");
  const numeric = (str) => Number(digit(str));
  const route = (url) => new URL(url).pathname;
  async function context(cookies, lang, mode, width) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      colorScheme: mode,
      locale: lang === "en" ? "en-US" : "ar-EG",
      serviceWorkers: "block",
    });
    await ctx.addCookies([
      ...cookies,
      ...[
        ["nova_lang", lang],
        ["wlc_workspace_mode", mode],
        ["shop_theme", mode],
      ].map(([name, value]) => ({ name, value, url: base })),
    ]);
    ctx.on("page", (p) => {
      p.setDefaultTimeout(30000);
      p.on("console", (msg) => {
        if (msg.type() === "error")
          errors.push({
            kind: "console",
            path: route(p.url()),
            text: msg
              .text()
              .replace(/https?:\/\/[^\s)]+/g, "[URL]")
              .slice(0, 180),
          });
      });
      p.on("pageerror", (e) =>
        errors.push({
          kind: "page",
          path: route(p.url()),
          text: e.message.replace(/https?:\/\/[^\s)]+/g, "[URL]").slice(0, 180),
        }),
      );
      p.on("response", (r) => {
        if (r.status() >= 400) errors.push({ kind: "http", status: r.status(), path: route(r.url()) });
      });
      p.on("requestfailed", (r) => {
        if (!["net::ERR_ABORTED", "net::ERR_BLOCKED_BY_CLIENT"].includes(r.failure()?.errorText))
          errors.push({ kind: "network", path: route(r.url()), code: r.failure()?.errorText });
      });
    });
    return ctx;
  }
  async function visit(p, path, selector) {
    const resp = await p.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 75000 });
    assert.ok(resp && resp.status() < 400, "document " + path.split("?")[0]);
    await p.locator(selector).first().waitFor();
  }
  async function layout(p, name, lang, mode, width) {
    await p.evaluate(() => document.fonts.ready);
    const metrics = await p.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      overflow: Math.max(
        0,
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
          document.documentElement.clientWidth,
      ),
      mode:
        document.querySelector(".ws-surface")?.dataset.mode ??
        document.querySelector("[data-storefront-mode]")?.dataset.shopTheme,
    }));
    assert.equal(metrics.lang, lang === "en" ? "en" : "ar-EG", name + " language");
    assert.equal(metrics.dir, lang === "en" ? "ltr" : "rtl", name + " direction");
    assert.equal(metrics.mode, mode, name + " theme");
    assert.equal(metrics.overflow, 0, name + " overflow at " + width);
    measurements.push({ name, lang, mode, width });
    if (lang === "en" && mode === "light" && width === 1440) console.log("First viewport", name);
  }
  async function pollSql(query, passes, label) {
    const stop = Date.now() + 30000;
    do {
      const rows = await sql(query);
      if (passes(rows)) return rows;
      await delay(300);
    } while (Date.now() < stop);
    throw new Error(label + " did not persist");
  }
  const contact = "/s/nova-store/contact";
  async function submitContact(p, title, message, result, tamper = false) {
    await visit(p, contact + "?order=" + orderId, "form input[name=subject]");
    const form = p.locator("form").filter({ has: p.locator("input[name=subject]") });
    await form.locator("[name=subject]").fill(title);
    const field = form.locator("textarea[name=message]");
    assert.equal(await field.getAttribute("maxlength"), "4000");
    if (tamper)
      await field.evaluate((el, value) => {
        el.value = value;
      }, message);
    else await field.fill(message);
    await guard();
    await Promise.all([
      p.waitForURL((u) => u.pathname === contact && u.searchParams.get("sent") === result, { timeout: 65000 }),
      form.locator("button").click(),
    ]);
    return (await p.locator("form [role=status]").innerText()).trim();
  }
  // All creates share one fresh buyer identity. Five successful calls exhaust only that buyer's scoped quota.
  const buyer = await context(buyerCookies, "en", "light", 1440);
  let ticket;
  try {
    const p = await buyer.newPage();
    assert.match(await submitContact(p, runId + " invalid", "X".repeat(4001), "invalid", true), /4,000/);
    assert.equal(await submitContact(p, subject, initialBody, "yes"), "We received your message.");
    for (let i = 2; i <= 5; i++) await submitContact(p, runId + " extra " + i, runId + " request " + i, "yes");
    assert.match(await submitContact(p, runId + " limited en", initialBody, "rate_limit"), /15 minutes/);
    await buyer.addCookies([{ name: "nova_lang", value: "ar", url: base }]);
    assert.match(await submitContact(p, runId + " limited ar", initialBody, "rate_limit"), /15 دقيقة/);
    const born = await sql("select id,is_read,priority,status from public.support_tickets where " + rowWhere);
    assert.equal(born.length, 1);
    ticket = born[0].id;
    assert.equal(born[0].is_read, false);
    assert.equal(born[0].priority, "normal");
    assert.equal(born[0].status, "open");
    const messages = await sql(
      "select sender_role,body from public.support_ticket_messages where ticket_id=" +
        lit(ticket) +
        " and store_id=" +
        lit(store),
    );
    assert.deepEqual(messages, [{ sender_role: "customer", body: initialBody }]);
  } finally {
    await buyer.close();
  }
  console.log("Contact form, limits and initial thread passed");
  const overview = "/admin/tickets?q=" + encodeURIComponent(subject);
  const stateQuery =
    "select id,is_read,read_at,status,priority,admin_reply from public.support_tickets where " + rowWhere;
  const staff = await context(staffCookies, "en", "light", 1440);
  try {
    const p = await staff.newPage();
    await visit(p, overview + "&filter=unread", ".si-list li");
    const first = p.locator(".si-list li").filter({ hasText: subject }).first();
    await first.locator(".si-unread").waitFor();
    await guard();
    await first.locator("a").click();
    await p.locator(".si-heading").getByText(subject, { exact: true }).waitFor();
    await pollSql(stateQuery, (r) => r[0]?.is_read === true && !!r[0]?.read_at, "opening unread");
    assert.ok(await p.locator(".si-thread a[href='/admin/orders/" + orderId + "']").isVisible());
    await p.locator(".si-messages li[data-role=customer]").getByText(initialBody, { exact: true }).waitFor();
    await guard();
    await p.locator(".si-toolbar > button").click();
    await pollSql(stateQuery, (r) => r[0]?.is_read === false && !r[0]?.read_at, "mark unread");
    await guard();
    await p.locator(".si-toolbar > button").click();
    await pollSql(stateQuery, (r) => r[0]?.is_read === true, "mark read");
    const toolbar = p.locator(".si-toolbar form");
    await toolbar.locator("[name=priority]").selectOption("high");
    await guard();
    await toolbar.locator("button").click();
    await pollSql(stateQuery, (r) => r[0]?.priority === "high", "priority");
    const compose = p.locator(".si-compose");
    await compose.locator("[name=body]").fill(reply);
    await compose.locator("[name=status]").selectOption("in_progress");
    await guard();
    await compose.locator("button").click();
    await pollSql(
      stateQuery,
      (r) => r[0]?.admin_reply === reply && r[0].status === "in_progress" && r[0].is_read === true,
      "threaded reply + legacy projection",
    );
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.locator(".si-messages li[data-role=merchant]").getByText(reply, { exact: true }).waitFor();
    assert.equal(await toolbar.locator("[name=priority]").inputValue(), "high");
    for (const [value, matching] of [
      ["all", true],
      ["unread", false],
      ["open", false],
      ["in_progress", true],
      ["closed", false],
    ]) {
      const form = p.locator(".si-filters");
      await form.locator("[name=filter]").selectOption(value);
      await form.locator("[name=priority]").selectOption("high");
      await Promise.all([
        p.waitForURL((u) => !u.searchParams.has("ticket") && u.searchParams.get("filter") === value),
        form.locator("button").click(),
      ]);
      if (matching) await p.locator(".si-list li").filter({ hasText: subject }).waitFor();
      else await p.locator(".si-list > p").waitFor();
      assert.equal(await p.locator(".si-list li").filter({ hasText: subject }).count(), matching ? 1 : 0);
    }
  } finally {
    await staff.close();
  }

  console.log("Ticket read, priority, reply and filter checks passed");
  const orderDir = "/admin/orders",
    receipt = orderDir + "/" + orderId;
  const filters = {
    q: customerName,
    status: "pending",
    payment: "paid",
    from: order.order_day,
    to: order.order_day,
  };
  const filtered = orderDir + "?" + new URLSearchParams(filters);
  async function pricing(p, selector, lang, invoice) {
    await p.locator(selector).waitFor();
    const entries = await p.locator(selector + " > div").evaluateAll((rows) =>
      rows.map((r) => ({
        key: r.querySelector("dt")?.textContent ?? "",
        value: r.querySelector("dd bdi[dir=ltr]")?.textContent ?? "",
      })),
    );
    const en = lang === "en";
    const pairs = [
      [en ? "Subtotal" : "مجموع المنتجات", order.subtotal],
      [en ? "Coupon discount" : "خصم القسيمة", -Number(order.discount_amount)],
      [en ? "Shipping" : "الشحن", order.shipping_fee],
      [en ? "Wallet credit used" : "خصم المحفظة", -Number(order.wallet_discount)],
      [en ? "Total" : "الإجمالي", order.total],
    ];
    if (!invoice) pairs.push([en ? "Cashback earned" : "الرصيد المكتسب", order.cashback_earned]);
    for (const [key, amount] of pairs) {
      const item = entries.find((e) => e.key.startsWith(key));
      assert.ok(item?.value, key + " amount isolate");
      assert.equal(numeric(item.value), Number(amount), key + " amount");
    }
    assert.ok(
      (await p.locator(selector + " dt bdi[dir=ltr]").allTextContents()).includes(coupon),
      "coupon code isolate",
    );
  }
  async function matrix(lang, mode, width) {
    const ctx = await context(staffCookies, lang, mode, width);
    const en = lang === "en",
      exercise = en && mode === "light" && width === 1440;
    try {
      const p = await ctx.newPage();
      if (exercise) {
        await visit(p, orderDir, ".ws-filters");
        const form = p.locator(".ws-filters");
        await form.locator("[name=q]").fill(customerName);
        await form.locator("[name=status]").selectOption("pending");
        await form.locator("[name=from]").fill(order.order_day);
        await form.locator("[name=to]").fill(order.order_day);
        await form.locator("[name=payment]").selectOption("failed");
        await Promise.all([
          p.waitForURL((u) => u.searchParams.get("payment") === "failed"),
          form.locator("button[type=submit]").click(),
        ]);
        await p.locator(".ws-empty-state").waitFor();
        await form.locator("[name=payment]").selectOption("paid");
        await Promise.all([
          p.waitForURL((u) => u.searchParams.get("payment") === "paid"),
          form.locator("button[type=submit]").click(),
        ]);
      } else await visit(p, filtered, ".ws-order-sheet");
      const trigger = p.locator("#inspect-" + orderId);
      await trigger.waitFor();
      const row = p.locator("tr").filter({ has: trigger });
      await row.getByText(customerName, { exact: true }).waitFor();
      assert.ok(await row.getByText(en ? "Paid" : "مدفوع", { exact: true }).isVisible());
      await layout(p, "orders", lang, mode, width);
      await trigger.click();
      await p.locator("dialog.ws-inspector[open]").waitFor();
      for (const [k, v] of Object.entries(filters))
        assert.equal(new URL(p.url()).searchParams.get(k), v, "drawer retained " + k);
      await pricing(p, "dialog .ws-order-summary", lang, false);
      await layout(p, "order drawer", lang, mode, width);
      if (exercise) {
        await p.keyboard.press("Escape");
        await p.locator("dialog.ws-inspector").waitFor({ state: "detached" });
        for (const [k, v] of Object.entries(filters))
          assert.equal(new URL(p.url()).searchParams.get(k), v, "close retained " + k);
        await trigger.click();
        await p.locator("dialog.ws-inspector[open]").waitFor();
      }
      await Promise.all([
        p.waitForURL((u) => u.pathname === receipt && !u.searchParams.has("print")),
        p.locator("dialog a[href='" + receipt + "']").click(),
      ]);
      await pricing(p, "dl.ws-order-summary", lang, false);
      await layout(p, "order", lang, mode, width);
      await p.locator("a[href='" + receipt + "?print=invoice']").click();
      await pricing(p, ".ws-invoice-totals", lang, true);
      await layout(p, "invoice", lang, mode, width);
      await visit(p, "/admin/reviews", ".ws-kpis");
      await layout(p, "reviews", lang, mode, width);
      const vals = await p.locator(".ws-kpis dd:not(.ws-kpi-note)").allTextContents();
      assert.equal(numeric(await p.locator(".ws-kpi-note bdi").innerText()), Number(counts.published));
      assert.deepEqual(vals.slice(1).map(numeric), [
        Number(counts.total),
        Number(counts.waiting),
        Number(counts.hidden),
      ]);
      if (Number(counts.published)) assert.ok(Math.abs(numeric(vals[0]) - Number(counts.avg_rating)) < 0.051);
      else assert.equal(vals[0], "—");
      if (exercise) {
        await p.locator(".ws-range a[href*='needs_reply']").click();
        await p.locator(".ws-range a[href*='needs_reply'][aria-current]").waitFor();
        await p.locator(".ws-range a[href*='hidden']").click();
        await p.locator(".ws-range a[href*='hidden'][aria-current]").waitFor();
        assert.equal(await p.locator(".ws-review").count(), 20);
        await p.locator(".ws-pager a[href*='page=2']").click();
        await p.locator(".ws-pager a[href*='filter=hidden']").first().waitFor();
        await p.waitForFunction(
          () =>
            new URL(location.href).searchParams.get("page") === "2" &&
            document.querySelector(".ws-pager > span > bdi")?.textContent === "2",
        );
        const expectedPage = await sql(
          "select author_name from public.product_reviews where store_id=" +
            lit(store) +
            " and status='hidden' order by created_at desc,id desc offset 20 limit 20",
        );
        assert.deepEqual(
          await p.locator(".ws-review-meta strong bdi").allTextContents(),
          expectedPage.map((r) => r.author_name),
        );
        await p.reload({ waitUntil: "domcontentloaded" });
        await p.locator(".ws-pager").waitFor();
        assert.equal(new URL(p.url()).searchParams.get("filter"), "hidden");
        await p.goBack();
        await p.waitForFunction(() => !new URL(location.href).searchParams.has("page"));
        await p.goForward();
        await p.waitForFunction(() => new URL(location.href).searchParams.get("page") === "2");
      }
      await visit(p, overview, ".si-list li");
      await layout(p, "ticket list", lang, mode, width);
      assert.equal(await p.locator(".si-thread").isVisible(), width > 800);
      await guard();
      await p.locator(".si-list li a").filter({ hasText: subject }).click();
      await p.locator(".si-messages li[data-role=merchant]").getByText(reply, { exact: true }).waitFor();
      assert.equal(await p.locator(".si-list").isVisible(), width > 800);
      await layout(p, "ticket thread", lang, mode, width);
      if (width === 390) {
        await p.locator(".si-back").click();
        await p.locator(".si-list li").waitFor();
        assert.equal(await p.locator(".si-thread").isVisible(), false);
      }
      await visit(p, contact, "form [name=subject]");
      await layout(p, "contact", lang, mode, width);
    } finally {
      await ctx.close();
    }
  }
  for (const lang of ["en", "ar"])
    for (const mode of ["light", "dark"])
      for (const width of [1440, 390]) {
        await matrix(lang, mode, width);
        console.log("Passed browser matrix", lang, mode, width);
      }
  assert.deepEqual(errors, [], "browser diagnostics");
  return {
    variants: 8,
    layoutMeasurements: measurements.length,
    consoleErrors: 0,
    pageErrors: 0,
    unexpectedHttpErrors: 0,
    ticketId: ticket,
    successfulSubmissions: 5,
    rateLimitFeedback: ["en", "ar"],
    reviewSeedStates: seeds,
    orderId,
  };
}

await run();
