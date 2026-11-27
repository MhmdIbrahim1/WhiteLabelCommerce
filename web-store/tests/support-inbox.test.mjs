import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./helpers/load-source.mjs";
import { inboxHref, inboxQuery, supportInput, supportOutcome } from "../src/lib/support-inbox.ts";

test("ticket links keep validated filters and reset invalid selection or paging", () => {
  const id = "01ab0100-0000-4000-8000-000000000001";
  const q = inboxQuery({ q: "  parcel  ", priority: "urgent", filter: "unread", page: "2", ticket: id });
  assert.equal(inboxHref(q), "/admin/tickets?q=parcel&filter=unread&priority=urgent&page=2&ticket=" + id);
  assert.equal(inboxHref({ ...q, ticket: "", page: 1 }), "/admin/tickets?q=parcel&filter=unread&priority=urgent");
  assert.equal(inboxHref(inboxQuery({ priority: "rush", filter: "bad", ticket: 42, page: "-1" })), "/admin/tickets");
});

test("support accepts trimmed Unicode text up to the SQL character limit", () => {
  for (const size of [160, 4000]) {
    const message = "📦".repeat(size);
    assert.equal(supportInput("  " + message + "  ", size), message);
    assert.equal(supportInput(message + "!", size), null);
    assert.equal(supportInput("  ", size), null);
    assert.equal(supportInput(null, size), null);
  }
});

test("support outcomes distinguish validation, rate limiting, and unavailable service", () => {
  assert.equal(supportOutcome(null), "yes");
  assert.equal(supportOutcome({ message: "invalid_support_message" }), "invalid");
  assert.equal(supportOutcome({ message: "rate_limit_exceeded" }), "rate_limit");
  assert.equal(supportOutcome({ message: "unavailable" }), "no");
});

test("contact shares anonymous ingress quotas without trusting arbitrary forwarding headers", async t => {
  const prior = process.env.VERCEL;
  t.after(() => { if (prior === undefined) delete process.env.VERCEL; else process.env.VERCEL = prior; });
  const requests = [];
  let buyer = null, suppliedIp = "192.0.2.1";
  const rpc = async (name, args) => { requests.push({ name, args }); return { error: null }; };
  const { sendTicket } = loadSource("app/(shop)/contact/action.ts", {
    "next/headers": { headers: async () => new Headers({ "x-vercel-forwarded-for": suppliedIp }) },
    "next/navigation": { redirect: url => { throw new Error(url); } },
    "@/lib/db": { serverDb: async () => ({ auth: { getUser: async () => ({ data: { user: buyer } }) }, rpc }) },
    "@/lib/supabase/admin": { adminDb: () => ({ rpc }) },
    "@/lib/tenant": { resolveActiveStoreOrDefault: async () => ({ id: "nova", basePath: "" }), storeHref: (_, path) => path },
    "@/lib/support-inbox": { supportInput, supportOutcome },
  });
  const form = new FormData();
  form.set("subject", " Parcel "); form.set("message", " Tracking ");
  delete process.env.VERCEL;
  await assert.rejects(sendTicket(form), /sent=yes/);
  assert.equal(requests.pop().name, "mobile_support");
  process.env.VERCEL = "1";
  await assert.rejects(sendTicket(form), /sent=yes/);
  assert.deepEqual(requests.pop(), { name: "web_anonymous_support", args: {
    p_store: "nova", p_subject: "Parcel", p_message: "Tracking", p_client_ip: suppliedIp,
  } });
  suppliedIp = "untrusted, 192.0.2.2";
  await assert.rejects(sendTicket(form), /sent=yes/);
  assert.equal(requests.pop().name, "mobile_support");
  suppliedIp = "192.0.2.1"; buyer = { id: "buyer" };
  await assert.rejects(sendTicket(form), /sent=yes/);
  assert.equal(requests.pop().name, "mobile_support");
  form.set("subject", " ");
  await assert.rejects(sendTicket(form), /sent=invalid/);
  assert.equal(requests.length, 0);
});
