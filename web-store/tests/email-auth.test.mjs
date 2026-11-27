import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as tick } from "node:timers/promises";
import { NextRequest } from "next/server.js";
import * as flow from "../src/lib/auth-flow.ts";
import * as otp from "../src/lib/email-otp.ts";
import * as phone from "../src/lib/phone.ts";
import * as routing from "../src/lib/host-routing.ts";
import * as tenant from "../src/lib/tenant-shared.ts";
import { loadSource } from "./helpers/load-source.mjs";
import { view, nodes, label, replaceGlobal } from "./helpers/auth-view.mjs";

const base = "/s/nova-store", email = "buyer@example.test";
const user = { id: "buyer", email, email_confirmed_at: "2026-11-27T12:00:00Z", identities: [{ id: "email-identity" }] };
const good = { data: { user, session: { user } }, error: null };
const signup = { fullName: "Test Buyer", phone: "01000000027", email, password: "fixture password", nextPath: "/create-store" };
const hash = "a".repeat(64);
const policy = loadSource("lib/password-policy.ts", { "./tenant-shared": tenant });
const store = { id: tenant.DEFAULT_STORE_ID, slug: "nova-store", basePath: base };
const verified = () => ({ data: { user }, error: null });
const destinations = loadSource("lib/auth-destination.ts", {
  "@/lib/access": { adminUser: async () => null, superAdminUser: async () => null },
  "@/lib/db": {}, "@/lib/auth-flow": flow, "next/navigation": {},
});

function actions(auth, currentStore = store) {
  const profiles = [];
  const db = { auth: { getUser: verified, ...auth }, rpc: async (name, args) => { profiles.push([name, args]); return {}; } };
  const handlers = loadSource("app/login/actions.ts", {
    "@/lib/auth-flow": flow, "@/lib/email-otp": otp, "@/lib/phone": phone, "@/lib/db": { serverDb: async () => db },
    "@/lib/tenant": { ...tenant, resolveActiveStore: () => currentStore, resolveActiveStoreOrDefault: () => currentStore },
    "@/lib/auth-destination": destinations,
    "next/navigation": {}, "next/cache": { revalidatePath() {} }, "next/headers": {},
  });
  return { ...handlers, profiles };
}

test("OTP normalization accepts six ASCII, Arabic or Persian digits and ordinary paste separators", () => {
  for (const value of ["123456", "١٢٣-٤٥٦", "۱ ۲ ۳ ۴ ۵ ۶", " ١2٣-4٥6 "]) {
    assert.equal(otp.normalizeOtp(value), "123456"); assert.ok(otp.validOtp(value));
  }
  for (const value of ["", "12345", "1234567", "١٢٣٤٥٦٧٨", "1234x56"]) assert.equal(otp.validOtp(value), false);
  const cells = ["1", "2", "", "4", "5", "6"];
  assert.deepEqual(otp.navigateOtp(cells, 2, "Backspace"), { cells: ["1", "", "", "4", "5", "6"], focus: 1 });
  assert.deepEqual(otp.navigateOtp(cells, 1, "Delete"), { cells: ["1", "", "", "4", "5", "6"], focus: 1 });
  assert.deepEqual(otp.enterOtp(cells, 4, "١٢٣-٤٥٦"), { cells: [..."123456"], focus: 6 });
  assert.equal(otp.navigateOtp(cells, 0, "ArrowLeft").focus, 0);
  assert.equal(otp.navigateOtp(cells, 5, "ArrowRight").focus, 5);
});

for (const en of [false, true]) test((en ? "EN" : "AR") + " segmented control isolates six labelled boxes and pasting focuses submit exactly once", t => {
  const app = view("components/shop/otp-input.tsx", { "@/lib/email-otp": otp });
  let frame, current, focused, submits = 0, prevented = 0;
  replaceGlobal(t, "requestAnimationFrame", fn => { frame = fn; return 1; });
  replaceGlobal(t, "cancelAnimationFrame", () => {});
  const props = { en, busy: false, onChange: value => { current = value; },
    submitRef: { current: { focus: () => { focused = "submit"; submits++; } } } };
  const render = () => app.render("OtpInput", props);
  let tree = render();
  const boxes = nodes(tree).filter(n => n.type === "input");
  assert.equal(boxes.length, 6); assert.equal(nodes(tree).find(n => n.props.role === "group").props.dir, "ltr");
  for (const [i, box] of boxes.entries()) {
    assert.equal(box.props.inputMode, "numeric"); assert.equal(box.props.pattern, "[0-9]*");
    assert.equal(box.props.autoComplete, i ? "off" : "one-time-code"); assert.ok(box.props["aria-label"].includes(String(i+1)));
    box.props.ref({ focus() { focused = i; }, select() {} });
  }
  app.flush(); assert.equal(focused, 0);
  boxes[0].props.onKeyDown({ key: "٣", preventDefault() { prevented++; } });
  assert.equal(current, "3"); assert.equal(focused, 1);
  nodes(render()).filter(n => n.type === "input")[1].props.onKeyDown({ key: "Backspace", preventDefault() { prevented++; } });
  assert.equal(current, ""); assert.equal(focused, 0);
  boxes[3].props.onPaste({ clipboardData: { getData: () => "٠١٢-٣٤٥" }, preventDefault() { prevented++; } });
  assert.equal(current, "012345"); frame(); assert.equal(focused, "submit"); assert.equal(submits, 1); assert.equal(prevented, 3);
  props.busy = true; props.errorId = "otp-error";
  tree = render();
  assert.ok(nodes(tree).filter(n => n.type === "input").every(n => n.props.disabled && n.props["aria-invalid"] && n.props["aria-describedby"] === "otp-error"));
  app.unmount();
});

test("sign-in OTP cannot create a user and signup resend and verification use their own Auth purpose", async () => {
  const sent = [], confirmed = [];
  const a = actions({ signInWithOtp: input => { sent.push(input); return {}; }, resend: input => { sent.push(input); return {}; },
    verifyOtp: input => { confirmed.push(input); return good; } });
  assert.equal((await a.sendEmailOtpAction(email)).retryAfterSeconds, 60);
  assert.equal((await a.sendEmailOtpAction(email, "signup")).retryAfterSeconds, 60);
  assert.deepEqual(sent, [{ email, options: { shouldCreateUser: false } }, { type: "signup", email }]);
  for (const purpose of ["signin", "signup"]) {
    assert.equal((await a.verifyEmailOtpAction(email, "١٢٣-٤٥٦", "/orders", purpose)).redirectTo, base + "/orders");
  }
  assert.deepEqual(confirmed.map(c => [c.type,c.token]), [["magiclink","123456"],["signup","123456"]]);
  assert.equal((await a.verifyEmailOtpAction(email, "12345678")).errorCode, "invalid_otp");
  assert.equal(confirmed.length, 2);
  const limited = actions({ signInWithOtp: () => ({ error: { status: 429 } }) });
  assert.deepEqual(await limited.sendEmailOtpAction(email), { ok: false, errorCode: "rate_limit", retryAfterSeconds: 60 });
  const absent = actions({ signInWithOtp: () => ({ error: { code: "otp_disabled", status: 422 } }) });
  assert.deepEqual(await absent.sendEmailOtpAction(email), { ok: true, retryAfterSeconds: 60 });
});

test("registration treats duplicate addresses and unconfirmed signups identically with either submitted password", async () => {
  const cases = [
    { data: { user: { ...user, identities: [] }, session: null } }, { data: { user, session: null } },
    { data: { user: { ...user, identities: [] }, session: { user } } },
    { data: { user: { ...user, email_confirmed_at: null }, session: { user } } },
    { error: { code: "email_exists", status: 422 } }, { error: { code: "user_already_exists", status: 422 } },
  ];
  for (const response of cases) for (const password of ["same password", "wrong password"]) {
    const a = actions({ signUp: () => response, getUser: () => assert.fail("unproven signup read a profile"),
      signInWithPassword: () => assert.fail("signup attempted a password sign-in") });
    assert.deepEqual(await a.signUpWithPasswordAction({ ...signup, password }), { ok: true, needsConfirmation: true, retryAfterSeconds: 60 });
    assert.deepEqual(a.profiles, []);
  }
  const a = actions({ signUp: () => good });
  assert.equal((await a.signUpWithPasswordAction(signup)).redirectTo, "/create-store");
  assert.equal(a.profiles.length, 1);
  for (const other of [null, { ...user, email_confirmed_at: null }, { ...user, id: "another" }, { ...user, email: "someone@example.test" }]) {
    const stale = actions({ signUp: () => good, getUser: () => ({ data: { user: other } }) });
    assert.equal((await stale.signUpWithPasswordAction(signup)).ok, false);
    assert.equal(stale.profiles.length, 0);
  }
});

test("registration panel stays on the confirmation step and isolates the email in both languages", async () => {
  for (const lang of ["ar", "en"]) {
    let calls = 0;
    const app = view("components/shop/hybrid-auth-panel.tsx", {
      "@/components/use-hydrated": { useHydrated: () => true },
      "next/link": "a", "@/lib/email-otp": otp, "@/lib/auth-flow": flow, "@/lib/password-policy": policy,
      "@/components/auth-session": { announceSessionChange: () => assert.fail("pending signup navigated") },
      "@/components/language-provider": { useLanguage: () => ({ lang }) },
      "@/app/login/actions": { signUpWithPasswordAction: async () => { calls++; return { ok: true, needsConfirmation: true, retryAfterSeconds: 60 }; } },
      "./password-field": { PasswordField: "password-field" },
    "./otp-input": { OtpInput: "otp-boxes", ResendCode: "resend", useResendCooldown: () => ({ seconds: 60, start: n => assert.equal(n,60) }) },
    });
    const props = { initialSignup: true, platform: true, basePath: "", nextPath: "/create-store" };
    const render = () => app.render("HybridAuthPanel", props);
    nodes(render()).find(x => x.type === "input" && x.props.name === "email").props.onChange({target:{value:email}});
    const data = new FormData(); data.set("password","wrong password");
    const NativeFormData = globalThis.FormData;
    try {
      globalThis.FormData = class { constructor() { return data; } };
      nodes(render()).find(x => x.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} });
      await tick();
    } finally { globalThis.FormData = NativeFormData; }
    const tree = render(), notice = nodes(tree).find(x => x.props.role === "status");
    assert.equal(calls, 1); assert.equal(nodes(notice).find(x => x.type === "bdi").props.dir, "ltr");
    assert.ok(label(notice).includes(email)); assert.ok(nodes(tree).some(x => x.type === "otp-boxes"));
    assert.ok(nodes(tree).some(x => x.type === "a" && x.props.href === "/login?next=%2Fcreate-store"));
  }
});

test("relative returns stay in the active storefront and cannot loop through auth or change tenant", async () => {
  for (const path of ["/orders?filter=active#order", "/account/profile", "/products/123"]) {
    assert.equal(flow.safeAuthNext(path, base), base + path);
    assert.equal(flow.safeAuthNext(base + path, base), base + path);
    assert.equal(flow.safeAuthNext("/store/nova-store" + path, base), base + path);
    assert.equal(flow.safeAuthNext(path, ""), path);
  }
  for (const bad of ["//elsewhere.test", "https://elsewhere.test/", "/\\outside", "/path/..//outside", "/%2fother",
    "/%255cother", "/path\nfoo", "/s/omar-a7a/orders", "/login?next=/login", base + "/auth/callback", "/api/auth/password"]) {
    assert.equal(flow.safeAuthNext(bad, base), "", bad);
  }
  const href = flow.authEntry(base,"/login","/orders");
  assert.equal(href, base+"/login?next=" + encodeURIComponent(base+"/orders"));
  const a = actions({ signInWithPassword: () => good });
  assert.equal((await a.signInWithPasswordAction(email,"password",new URL(href,"https://host.example").searchParams.get("next"))).redirectTo,base+"/orders");
  assert.equal((await a.signInWithPasswordAction(email,"password","//elsewhere.test")).redirectTo,base+"/account");
});

test("proxy binds recovery pages, confirmation and API posts to the actual apex, tenant, custom or preview origin", async t => {
  const saved = [process.env.PLATFORM_ROOT_DOMAIN, process.env.VERCEL_ENV];
  process.env.PLATFORM_ROOT_DOMAIN="shopstage.live"; process.env.VERCEL_ENV="preview";
  t.after(() => { for (const [i,key] of ["PLATFORM_ROOT_DOMAIN","VERCEL_ENV"].entries()) {
    if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
  } });
  const route = {id: store.id, slug: store.slug, primaryDomain: "shop.example.test"};
  const {proxy} = loadSource("proxy.ts", {"@/lib/host-routing":routing, "@/lib/tenant-shared":tenant, "@/lib/access":{},
    "@/lib/host-resolver":{resolveHostRoute: async k => ["nova-store","shop.example.test"].includes(k.value) ? route : null},
    "@supabase/ssr":{createServerClient:()=>({})}});
  for (const [host, prefix] of [["shopstage.live",""],["nova-store.shopstage.live",""],["shop.example.test",""],["branch.vercel.app",base]]) {
    for (const path of ["/forgot-password","/reset-password","/auth/reset-password","/auth/confirm","/auth/callback","/api/auth/password-reset"]) {
      const req = new NextRequest("https://"+host+prefix+path, {method:path.startsWith("/api/")?"POST":"GET",
        headers:{host,[tenant.REQUEST_ORIGIN_HEADER]:"https://untrusted.example",[tenant.STORE_BASE_PATH_HEADER]:"/s/other"}});
      const res = await proxy(req);
      const header = key => res.headers.get("x-middleware-request-"+key);
      assert.equal(res.status,200); assert.equal(header(tenant.STORE_BASE_PATH_HEADER),prefix);
      assert.equal(flow.recoveryRedirect(header(tenant.REQUEST_ORIGIN_HEADER),prefix),"https://"+host+prefix+"/auth/confirm");
      if (path.includes("password") && !path.startsWith("/api/")) {
        assert.equal(header(tenant.PASSWORD_RECOVERY_HEADER),"1");
        assert.equal(res.headers.get("referrer-policy"),"no-referrer");
      }
    }
  }
});

test("recovery uses the proxy-bound redirect and preserves the existing registered native app callback", async () => {
  const redirects=[];
  const {POST}=loadSource("app/api/auth/password-reset/route.ts",{"@/lib/auth-flow":flow,"@/lib/tenant-shared":tenant,
    "@/lib/password-policy":{...policy,emailPasswordResetEnabled:true},"@/lib/db":{}, "@/lib/recovery-db":{recoveryDb:()=>({auth:{
      resetPasswordForEmail:async (address, options)=>{assert.equal(address,email);redirects.push(options.redirectTo);return {};}
    }})}});
  const post=(origin,prefix,props={},originHeader=origin)=>POST(new Request(origin+prefix+"/api/auth/password-reset",{method:"POST",
    headers:{origin:originHeader,[tenant.REQUEST_ORIGIN_HEADER]:origin,[tenant.STORE_BASE_PATH_HEADER]:prefix},
    body:JSON.stringify({email,store_slug:"other",redirectTo:"https://elsewhere.test",...props})}));
  for (const [origin,prefix] of [["https://shopstage.live",""],["https://nova-store.shopstage.live",""],["https://shop.example.test",""],["https://branch.vercel.app",base]]) {
    assert.equal((await post(origin,prefix)).status,200);assert.equal(redirects.at(-1),origin+prefix+"/auth/confirm");
  }
  assert.equal((await post("https://shopstage.live","",{},"https://elsewhere.test")).status,403);
  assert.equal((await post("https://shopstage.live","",{package_name:"com.whitelabel.commerce",store_id:store.id})).status,200);
  assert.equal(redirects.at(-1),"com.whitelabel.commerce://auth/reset-password");
});

test("opening a recovery link does not spend it; confirmation errors redirect to localized, same-tenant recovery",async()=>{
  let verifiedCalls=0;
  const {GET}=loadSource("app/auth/confirm/route.ts",{"@/lib/auth-flow":flow,"@/lib/tenant-shared":tenant,
    "@/lib/db":{serverDb:()=>({auth:{verifyOtp:()=>{verifiedCalls++;return {error:{code:"otp_expired",status:403},data:{}};}}})}});
  const call=query=>GET(new Request("https://branch.vercel.app"+base+"/auth/confirm?"+query,{headers:{[tenant.STORE_BASE_PATH_HEADER]:base}}));
  const res=await call("type=recovery&token_hash="+hash);
  assert.equal(res.status,303);assert.equal(res.headers.get("referrer-policy"),"no-referrer");
  assert.equal(res.headers.get("location"),base+"/reset-password?type=recovery&token_hash="+hash);assert.equal(verifiedCalls,0);
  assert.equal((await call("type=recovery&token_hash=x")).headers.get("location"),base+"/forgot-password?error_code=invalid_link");
  assert.equal((await call("type=recovery&error_code=otp_expired")).headers.get("location"),base+"/forgot-password?error_code=otp_expired");
  assert.equal((await call("type=signup&token_hash="+hash)).headers.get("location"),base+"/login?method=otp&error=otp_expired");assert.equal(verifiedCalls,1);
});

test("password replacement needs a recovery proof, works without PKCE cookies, and rejects legacy sign-in exchanges",async()=>{
  const calls=[], passwords=[]; let response=good, kind="recovery";
  function handler(enabled=true){
    const client = () => ({auth: {
        verifyOtp:args=>{calls.push(args);return response;},exchangeCodeForSession:()=>({data:{...good.data,redirectType:kind}}),
        updateUser:args=>{passwords.push(args);return {};}
    }});
    return loadSource("app/api/auth/password-reset/complete/route.ts",{"@/lib/auth-flow":flow,"@/lib/email-otp":otp,
      "@/lib/password-policy":{...policy,emailPasswordResetEnabled:enabled},"@/lib/recovery-db":{recoveryDb:client,legacyRecoveryDb:client}}).POST;
  }
  const post=(proof,fn=handler())=>fn(new Request("https://shop.example.test/api/auth/password-reset/complete",{
    method:"POST",body:JSON.stringify({password:"new password",...proof})}));
  assert.equal((await post({token_hash:hash})).status,200);
  assert.equal((await post({email,token:"١٢٣-٤٥٦"})).status,200);
  assert.deepEqual(calls,[{type:"recovery",token_hash:hash},{type:"recovery",email,token:"123456"}]);
  for(const entry of [{},{token_hash:"broken"},{email,token:"12345678"},{email,token:"123456",password:"short"}]) assert.equal((await post(entry)).status,400);
  response={data:{session:null},error:{code:"otp_expired",status:403}};
  assert.equal((await (await post({token_hash:hash})).json()).code,"otp_expired");
  kind="signup";assert.equal((await post({code:hash})).status,400);
  kind="recovery";assert.equal((await post({code:hash})).status,200);
  assert.equal((await post({token_hash:hash},handler(false))).status,403);assert.equal(passwords.length,3);
});

test("recovery client can read only legacy verifier cookies and never persists a recovery session into the browser",async()=>{
  let options;
  const {legacyRecoveryDb}=loadSource("lib/recovery-db.ts",{"@supabase/ssr":{createServerClient:(_u,_k,o)=>{options=o;}},
    "next/headers":{cookies:async()=>({getAll:()=>["sb-x-auth-token","sb-x-auth-token-code-verifier.0","admin"].map(name=>({name,value:"fixture"}))})}});
  await legacyRecoveryDb();assert.deepEqual(options.cookies.getAll().map(c=>c.name),["sb-x-auth-token-code-verifier.0"]);
  options.cookies.setAll([{name:"sb-x-auth-token",value:"secret"}]);
});

test("messages for failed proofs, weak passwords and rate limits are actionable in both languages",()=>{
  for(const [provider, fallback, expected] of [["otp_expired","invalid_otp","otp_expired"],["validation_failed","invalid_otp","invalid_otp"],
    ["bad_code_verifier","invalid_link","invalid_link"],["over_email_send_rate_limit","invalid_otp","rate_limit"],["same_password","server","weak_password"]]) {
    const code=flow.authErrorCode({code:provider,status:400},fallback);assert.equal(code,expected);
    assert.match(flow.authMessage(code,true),/[a-z]/i);assert.match(flow.authMessage(code,false),/[\u0600-\u06ff]/);
    assert.notEqual(flow.authMessage(code,true),flow.authMessage("server",true));
  }
});

test("repository email templates and Auth config agree on six digits, ten minutes, confirmation and one-minute resend",()=>{
  const read=path=>readFileSync(new URL("../../supabase/"+path,import.meta.url),"utf8");
  const config=read("config.toml");
  for(const value of ['otp_length = 6','otp_expiry = 600','max_frequency = "1m"','enable_confirmations = true']) assert.ok(config.includes(value));
  for(const name of ["magic_link","confirmation","recovery"]){
    const text=read("templates/"+name+".html");assert.ok(config.includes("./supabase/templates/"+name+".html"));
    assert.match(text,/\{\{ \.Token \}\}/);assert.match(text,/lang="ar"/);assert.match(text,/lang="en"/);
    assert.doesNotMatch(text,/\.ConfirmationURL/);
    if(name==="recovery")assert.match(text,/\.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/);
  }
});

test("a signed-in visit to login continues to the tenant order page or an authorized workspace without another challenge", async () => {
  let current = user, merchant = false;
  const { continueSignedInLogin } = loadSource("lib/auth-destination.ts", {
    "next/navigation": { redirect(path) { throw Error("redirect " + path); } },
    "@/lib/db": { requestUser: () => current, serverDb: () => ({}) }, "@/lib/auth-flow": flow,
    "@/lib/access": { adminUser: async () => merchant ? user : null, superAdminUser: async () => null },
  });
  await assert.rejects(continueSignedInLogin(base + "/orders", base + "/account"), { message: "redirect " + base + "/orders" });
  await assert.rejects(continueSignedInLogin("/admin", "/account"), { message: "redirect /account?notice=customer_only" });
  merchant = true;
  await assert.rejects(continueSignedInLogin("", "/account"), { message: "redirect /admin" });
  current = { ...user, email_confirmed_at: undefined }; await continueSignedInLogin("/orders", "/account");
});

test("the recovery form validates confirmation locally and returns to the original tenant login after a successful reset", async t => {
  const requests = [], paths = [];
  const app = view("components/shop/password-form.tsx", {
    "@/components/use-hydrated": { useHydrated: () => true },
    "next/navigation": { useRouter: () => ({ replace: p => paths.push(p), refresh() {} }) }, "../language-provider": { useLanguage: () => ({ lang: "en" }) },
    "@/lib/password-policy": policy, "@/lib/auth-flow": flow, "@/lib/email-otp": otp,
    "./password-field": { PasswordField: "password-field" },
    "./otp-input": { OtpInput: "otp", ResendCode: "resend", useResendCooldown: () => ({ seconds: 0, start() {} }) },
  });
  const form = new FormData(), props = { mode: "recover", token: hash, basePath: base, nextPath: "/orders" };
  replaceGlobal(t, "FormData", class { constructor() { return form; } });
  replaceGlobal(t, "fetch", async (url, options) => { requests.push([url, JSON.parse(options.body)]); return Response.json({ ok: true }); });
  const draw = () => app.render("PasswordForm", props);
  const submit = () => draw().props.onSubmit({ preventDefault() {}, currentTarget: {} });
  form.set("password", "short"); await submit(); assert.match(label(draw()), /8 to 128 characters/);
  form.set("password", "long password"); form.set("confirmation", "different"); await submit();
  assert.match(label(draw()), /two passwords must match/); assert.equal(requests.length, 0);
  form.set("confirmation", "long password"); await submit();
  assert.deepEqual(requests, [[base + "/api/auth/password-reset/complete", { password: "long password", token_hash: hash }]]);
  assert.deepEqual(paths, [base + "/login?next=" + encodeURIComponent(base + "/orders") + "&registered=reset"]);
});

test("new recovery emails use the SDK without PKCE or browser storage and keep the callback URL query-free", async t => {
  const calls = [];
  const {createClient} = await import("@supabase/supabase-js");
  const {recoveryDb} = loadSource("lib/recovery-db.ts", { "next/headers": {},
    "@supabase/supabase-js": { createClient(_url,_key,options) {
      return createClient("https://auth.example.test", "fixture-anon-key", { ...options, global: { fetch: async (input, init) => {
        calls.push({ url: new URL(input), body: JSON.parse(init.body) }); return Response.json({});
      } } });
    } },
  });
  const db = recoveryDb(); t.after(() => db.auth.stopAutoRefresh());
  const target = "https://shop.example.test/auth/confirm";
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: target });
  assert.equal(error, null); assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get("redirect_to"), target);
  assert.ok(!calls[0].body.code_challenge); assert.equal(calls[0].body.email, email);
});

for (const signup of [false, true]) for (const lang of ["en", "ar"]) {
  test(`${lang} ${signup ? "registration" : "login"} rejects invalid OTP email before a request or busy state`, async () => {
    let calls = 0, focused = 0;
    const app = view("components/shop/hybrid-auth-panel.tsx", {
      "@/components/use-hydrated": { useHydrated: () => true },
      "next/link": "a", "@/lib/email-otp": otp, "@/lib/auth-flow": flow, "@/lib/password-policy": policy,
      "@/components/auth-session": {}, "@/components/language-provider": { useLanguage: () => ({ lang }) },
      "@/app/login/actions": { sendEmailOtpAction() { calls++; }, signUpWithCodeAction() { calls++; } },
      "./password-field": { PasswordField: "password" },
      "./otp-input": { useResendCooldown: () => ({ seconds: 0, start() {} }) },
    });
    const draw = () => nodes(app.render("HybridAuthPanel", { basePath: "", initialOtp: true, initialSignup: signup }));
    const field = () => draw().find(n => n.props.name === "email");
    field().props.ref.current = { focus() { focused++; }, validity: { typeMismatch: false } };
    for (const value of ["", "  ", "missing@", "two@@shop.test", "no@domain"]) {
      field().props.onChange({ target: { value } });
      draw().find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
      assert.equal(draw().find(n => n.props.role === "alert").props.children, flow.authMessage("invalid_email", lang === "en"));
      const button = draw().find(n => n.props.className === "auth-submit-btn");
      assert.equal(button.props.disabled, false);
      assert.equal(button.props["aria-busy"], false);
    }
    assert.equal(calls, 0); assert.equal(focused, 5);
  });
}

test("changing email or method invalidates an in-flight OTP response, including a network failure", async () => {
  let resolve, reject, calls = 0;
  const app = view("components/shop/hybrid-auth-panel.tsx", {
      "@/components/use-hydrated": { useHydrated: () => true },
    "next/link": "a", "@/lib/email-otp": otp, "@/lib/auth-flow": flow, "@/lib/password-policy": policy,
    "@/components/auth-session": {}, "@/components/language-provider": { useLanguage: () => ({ lang: "en" }) },
    "@/app/login/actions": { sendEmailOtpAction() { calls++; return new Promise((ok, fail) => { resolve = ok; reject = fail; }); } },
    "./password-field": { PasswordField: "password" },
    "./otp-input": { OtpInput: "otp", useResendCooldown: () => ({ seconds: 0, start() {} }) },
  });
  const draw = () => nodes(app.render("HybridAuthPanel", { basePath: "", initialOtp: true }));
  const email = value => draw().find(n => n.props.name === "email").props.onChange({ target: { value } });
  const submit = () => draw().find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  const busy = () => draw().find(n => n.props.className === "auth-submit-btn").props["aria-busy"];
  email("one@example.test"); submit(); assert.equal(busy(), true);
  email("two@example.test"); assert.equal(busy(), false);
  resolve({ ok: true }); await tick(); assert.equal(draw().some(n => n.type === "otp"), false);
  submit(); draw().find(n => n.props.className === "hybrid-auth-tab").props.onClick();
  reject(new Error("late")); await tick(); assert.equal(busy(), false); assert.ok(!draw().some(n => n.props.role === "alert"));
  draw().find(n => n.props.className === "hybrid-auth-tab").props.onClick();
  submit(); reject(new Error("offline")); await tick(); assert.equal(busy(), false); assert.equal(calls, 3);
  assert.equal(draw().find(n => n.props.role === "alert").props.children, flow.authMessage("network", true));
});

test("code-only registration calls signup with fresh credentials and never signs in an existing email", async () => {
  const values = [];
  const a = actions({ signUp: async args => { values.push(args); return { error: null, data: { user: { identities: [] }, session: null } }; } });
  for (let i = 0; i < 2; i++) {
    const result = await a.signUpWithCodeAction({ fullName: "Test Shopper", phone: "01012345678", email });
    assert.equal(result.needsConfirmation, true); assert.equal(result.redirectTo, undefined);
  }
  assert.equal(values.length, 2); assert.ok(values[0].password.length >= 32);
  assert.notEqual(values[0].password, values[1].password);
});

test("password visibility controls address their own input and keep the localized minimum readable", () => {
  for (const en of [true, false]) {
    const app = view("components/shop/password-field.tsx", { "@/components/use-hydrated": { useHydrated: () => true }, "lucide-react": { Eye: "eye", EyeOff: "eye-off" } });
    const draw = () => nodes(app.render("PasswordField", { en, label: "Password", newPassword: true, minLength: 6 }));
    const input = () => draw().find(n => n.type === "input");
    const button = () => draw().find(n => n.type === "button");
    assert.equal(input().props.id, button().props["aria-controls"]); assert.equal(input().props.type, "password");
    assert.match(input().props.placeholder, en ? /6 characters/ : /من ٦ أحرف/);
    button().props.onClick(); assert.equal(input().props.type, "text");
    button().props.onClick(); assert.equal(input().props.type, "password");
  }
});
