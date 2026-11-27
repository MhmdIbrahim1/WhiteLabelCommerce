import test from "node:test";
import assert from "node:assert/strict";
import * as paymob from "../src/lib/paymob.ts";
import * as payment from "../src/lib/order-payment.ts";
import * as tenant from "../src/lib/tenant-shared.ts";
import { loadSource } from "./helpers/load-source.mjs";

const store="00000000-0000-0000-0000-000000000001", id=crypto.randomUUID(), attempt=crypto.randomUUID(), lease=crypto.randomUUID();
const json=(data,error=null)=>({data,error});
function initiation({bound=json(true),reserved,proof=true,walletResult={state:"prompt"},onWallet,method="wallet",
  owner=null, cookieUser=null, tokens=new Map()}={}) {
  const calls=[];
  const authChecks=[];
  const rows={
    orders:{id,store_id:store,user_id:owner,status:"pending",total:20,currency:"EGP",guest_tracking:!owner,payment_method:method==="wallet"?"paymob_wallet":"paymob_card",payment_status:"pending",phone:"01012345678"},
    store_settings:{paymob_enabled:true,paymob_card_enabled:true,paymob_wallet_enabled:true},
    store_payment_secrets:{paymob_api_key:"fixture",paymob_hmac_secret:"fixture-secret",paymob_card_integration_id:"1",paymob_wallet_integration_id:"2",paymob_iframe_id:"3"},
  };
  const db={from(name){return {select(){return this;},eq(){return this;},maybeSingle(){return json(rows[name]);}};},
    async rpc(name,args){calls.push([name,args]);if(name==="reserve_paymob_attempt")return reserved ?? json({
      action:"start",attempt,lease,amount_cents:2000,currency:"EGP",expires_at:new Date(Date.now()+900000).toISOString()});
      if(name==="bind_paymob_attempt")return bound;return json(true);}
  };
  const {POST}=loadSource("app/api/payments/paymob/initiate/route.ts",{
    "@/lib/db":{serverDb:()=>({auth:{async getUser(token){
      authChecks.push(token);
      return {data:{user:token === undefined ? cookieUser : tokens.get(token) ?? null}};
    }}})},"@/lib/supabase/admin":{adminDb:()=>db},
    "@/lib/tenant":{resolveActiveStoreOrDefault:()=>({id:store,basePath:"/s/nova-store"})},"@/lib/tenant-shared":tenant,
    "@/lib/order-receipt":{guestOwnsReceipt:async()=>proof},
    "@/lib/paymob":{...paymob,authenticatePaymob:async()=>{calls.push(["auth"]);return "t";},
      registerPaymobOrder:async p=>{calls.push(["register",p]);return "111";},
      requestPaymobPaymentKey:async p=>{calls.push(["key",p]);return "k";},
      payPaymobWallet:async()=>{calls.push(["wallet"]);if(onWallet)return onWallet();return walletResult;}},
  });
  const send=(overrides={},headers={})=>POST(new Request("https://shopstage.live/s/nova-store/api/payments/paymob/initiate",{
    method:"POST",headers:{[tenant.REQUEST_ORIGIN_HEADER]:"https://shopstage.live",...headers},
    body:JSON.stringify({order_id:id,method,wallet_phone:"01112345678",...overrides}),
  }));
  return {calls,send,authChecks};
}

test("Android bearer sessions can initiate only the signed-in owner's order", async () => {
  const tokens = new Map([["owner-token", {id:"owner"}], ["shopper-token", {id:"shopper"}]]);
  for (const [token, status] of [["owner-token", 200], ["shopper-token", 403], ["invalid-token", 403]]) {
    const h = initiation({method:"card", owner:"owner", tokens});
    const res = await h.send({customer_phone:"01012345678"}, {Authorization:`Bearer ${token}`});
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(h.authChecks, [undefined, token]);
    if (status === 200) assert.match((await res.json()).redirect_url, /^https:\/\/accept\.paymob\.com\//);
    else assert.deepEqual(h.calls, []);
  }
});

test("a verified cookie session takes precedence over a supplied bearer token", async () => {
  const h = initiation({method:"card", owner:"owner", cookieUser:{id:"other"}, tokens:new Map([["valid", {id:"owner"}]])});
  assert.equal((await h.send({}, {Authorization:"Bearer valid"})).status, 403);
  assert.deepEqual(h.authChecks, [undefined]);
  assert.deepEqual(h.calls, []);
});

test("guest card initiation without a receipt requires the order's customer phone", async () => {
  for (const [phone, status] of [["+201012345678", 200], [undefined, 403], ["01212345678", 403]]) {
    const h = initiation({method:"card", proof:false});
    const res = await h.send({customer_phone:phone});
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "no-store");
    if (status === 403) assert.deepEqual(h.calls, []);
  }
});

test("an ineligible reservation exposes the stable mobile error code before contacting Paymob", async () => {
  const h = initiation({reserved:json(null,{code:"P0001",message:"order_ineligible"})});
  const res = await h.send();
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "order_ineligible");
  assert.deepEqual(h.calls.map(([name]) => name), ["reserve_paymob_attempt"]);
});

test("wallet phone and guest ownership are checked before the first gateway request",async()=>{
  const h=initiation({proof:false});
  for(const phone of ["015","12345678901","+1 111 234 5678","01X12345678"]) assert.equal((await h.send({wallet_phone:phone})).status,400);
  assert.equal((await h.send()).status,403);assert.deepEqual(h.calls,[]);
});
test("durable reservation and both-row binding precede payment key, charge claim and wallet submission",async()=>{
  const h=initiation();
  assert.deepEqual(await (await h.send()).json(),{state:"pending",pending_wallet_prompt:true});
  assert.deepEqual(h.calls.map(c=>c[0]),["reserve_paymob_attempt","auth","register","bind_paymob_attempt","key","advance_paymob_attempt","wallet","advance_paymob_attempt"]);
  assert.equal(h.calls[0][1].p_checkout_base,"https://shopstage.live/s/nova-store");
  assert.equal(h.calls[2][1].merchantOrderId,attempt);assert.equal(h.calls[3][1].p_provider,"111");
  assert.equal(h.calls[5][1].p_step,"charging");assert.equal(h.calls[7][1].p_step,"prompt");
  for(const missing of [json(false),json(null),json(null,{code:"P0001"})]) {
    const bad=initiation({bound:missing});
    assert.equal((await bad.send()).status,502);
    assert.ok(!bad.calls.some(([name])=>name==="key" || name==="wallet"));
  }
  const noRow=initiation({reserved:json(null)});assert.equal((await noRow.send()).status,503);
  assert.equal(noRow.calls.length,1);
});
test("repeat initiation serves a saved redirect or outstanding prompt and never starts a second gateway request",async()=>{
  for(const r of [{action:"redirect",redirect_url:"https://accept.paymob.com/cached"},{action:"busy"},{action:"pending"}]){
    const h=initiation({reserved:json(r)});const res=await h.send();
    assert.ok(res.ok);assert.deepEqual(h.calls.map(c=>c[0]),["reserve_paymob_attempt"]);
  }
  const h=initiation({reserved:json({action:"start",attempt,lease,provider:"112",amount_cents:2000,currency:"EGP",
    expires_at:new Date(Date.now()+60000).toISOString()}),method:"card"});
  assert.match((await (await h.send()).json()).redirect_url,/iframes\/3/);
  assert.ok(!h.calls.some(c=>c[0]==="register"));assert.equal(h.calls.find(c=>c[0]==="key")[1].paymobOrderId,"112");
});
test("explicit rejection closes the attempt, an ambiguous timeout keeps its charge claim",async()=>{
  const declined=initiation({walletResult:{state:"failed"}});
  assert.equal((await declined.send()).status,422);assert.equal(declined.calls.at(-1)[1].p_step,"failed");
  const timeout=initiation({onWallet:()=>{throw new DOMException("timeout","TimeoutError");}});
  const res=await timeout.send();assert.equal(res.status,202);assert.equal((await res.json()).state,"pending");
  assert.equal(timeout.calls.at(-1)[0],"wallet");assert.ok(!timeout.calls.some(c=>c[1]?.p_step==="release"));
});

test("wallet wire responses handle both redirects, phone prompts, rejections and transport uncertainty",async t=>{
  let reply,status=200,calls=0;
  t.mock.method(globalThis,"fetch",async(_,options)=>{
    calls++;assert.ok(options.signal instanceof AbortSignal);return Response.json(reply,{status});
  });
  const run=()=>paymob.payPaymobWallet({paymentToken:"fixture",walletPhone:"01000000001"});
  await assert.rejects(paymob.payPaymobWallet({paymentToken:"fixture",walletPhone:"00"}));assert.equal(calls,0);
  for(const field of ["iframe_redirection_url","redirect_url","redirection_url"]) {
    reply={[field]:"https://gateway.example/otp"};assert.deepEqual(await run(),{state:"ready",url:reply[field]});
  }
  reply={success:false,pending:true};assert.deepEqual(await run(),{state:"prompt"});
  reply={success:false,pending:false,redirect_url:"https://gateway.example/decline"};assert.deepEqual(await run(),{state:"failed"});
  reply={pending:false};assert.deepEqual(await run(),{state:"failed"});
  reply={redirect_url:"javascript:void(0)"};await assert.rejects(run(),/unknown/);
  reply={};status=503;await assert.rejects(run(),/unknown/);
});
test("browser recovery uses the exact order and tenant alias and resolves stalled requests within its deadline",async t=>{
  const {startOrderPayment}=loadSource("lib/payment-client.ts",{"./tenant-shared":tenant,"./order-payment":payment});
  const nativeTimeout=AbortSignal.timeout;const deadlines=[];
  t.mock.method(AbortSignal,"timeout",ms=>{deadlines.push(ms);return nativeTimeout.call(AbortSignal,5);});
  let response={state:"pending"},stall=false,calls=0;
  t.mock.method(globalThis,"fetch",(url,init)=>{
    calls++;assert.equal(url,"/s/omar-a7a/api/payments/paymob/initiate");
    assert.equal(JSON.parse(init.body).order_id,id);
    if(!stall)return Promise.resolve(Response.json(response,{status:response.state==="failed"?422:202}));
    return new Promise((_,reject)=>init.signal.addEventListener("abort",()=>reject(init.signal.reason),{once:true}));
  });
  const run=phone=>startOrderPayment("/s/omar-a7a",id,"wallet",phone);
  assert.equal(await run("88"),"failed");assert.equal(calls,0);
  assert.equal(await run("01000000001"),"pending");
  response={state:"failed"};assert.equal(await run("01000000001"),"failed");
  stall=true;const keepAlive=setTimeout(()=>{},200);
  try {assert.equal(await run("01000000001"),"unavailable");} finally {clearTimeout(keepAlive);}
  assert.ok(deadlines.every(ms=>ms>0 && ms<=40000));
});
