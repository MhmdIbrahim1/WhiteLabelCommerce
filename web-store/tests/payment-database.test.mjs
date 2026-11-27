import test, {after,before} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {loadSource} from "./helpers/load-source.mjs";
import * as paymob from "../src/lib/paymob.ts";
import * as payment from "../src/lib/order-payment.ts";
import * as tenant from "../src/lib/tenant-shared.ts";
import {paymentDatabase,contract,migration,nova} from "./helpers/payment-database.mjs";

let db;
before(async()=>{db=await paymentDatabase();});
after(async()=>{await db?.close();});

test("migration reapplies and the rolled-back PostgreSQL contract exercises checkout, guards, expiry and reconciliation",async()=>{
  await db.exec(migration);
  await db.exec(contract);
  assert.deepEqual((await db.query("select count(*)::int as count from orders")).rows,[{count:0}]);
});

test("a stale initiation lease or closed order rolls back both provider bindings",async()=>{
  const {rows:[order]}=await db.query("insert into orders(store_id,payment_method,payment_status,subtotal) values($1,'paymob_wallet','pending',10) returning id",[nova]);
  const {rows:[{a}]}=await db.query("select reserve_paymob_attempt($1,$2,'paymob_wallet',null) a",[nova,order.id]);
  await assert.rejects(db.query("update orders set shipping_fee=2 where id=$1",[order.id]),/payment_amount_locked/);
  const bind=lease=>db.query("select bind_paymob_attempt($1,$2,$3,$4,'123')",[nova,order.id,a.attempt,lease]);
  await assert.rejects(bind(crypto.randomUUID()),/attempt_binding_failed/);
  await db.query("update orders set status='cancelled' where id=$1",[order.id]);
  await assert.rejects(bind(a.lease),/order_binding_failed/);
  const {rows}=await db.query("select o.paymob_order_id as local,a.paymob_order_id as provider from orders o join payment_attempts a on a.order_id=o.id where o.id=$1",[order.id]);
  assert.deepEqual(rows,[{local:null,provider:null}]);
});

test("COD and online fulfillment options are derived by the same database function as the trigger",async()=>{
  for(const [status,method,payment,options] of [
    ["pending","cod","unpaid",["confirmed","cancelled"]],["confirmed","cod","cod_pending",["shipped","cancelled"]],
    ["shipped","cod","cod_pending",["delivered","cancelled"]],["confirmed","paymob_wallet","pending",["cancelled"]],
    ["shipped","paymob_card","failed",["cancelled"]],["confirmed","paymob_card","paid",["shipped","cancelled"]],
    ["cancelled","paymob_card","paid",[]],["delivered","cod","paid",[]],
  ]) {
    const {rows:[row]}=await db.query("select allowed_order_transitions($1,$2,$3,true) choices",[status,method,payment]);
    assert.deepEqual(row.choices,options);
  }
});

function callbacks(order,provider,notifications) {
  // Supabase transport is replaced. Both real route handlers use the real HMAC verifier
  // and submit to the same PostgreSQL transaction journal in this test process.
  const key="test-only-paymob-key";
  const svc={
    from(table) {
      const where={};
      return {select(){return this;},eq(k,v){where[k]=v;return this;},async maybeSingle(){
        const row={payment_attempts:where.paymob_order_id===provider ? {order_id:order.id,store_id:nova}:null,
          orders:where.id===order.id && where.store_id===nova ? order:null,stores:{slug:"nova-store"},
          store_payment_secrets:{paymob_hmac_secret:key}}[table];
        return {data:row,error:null};
      }};
    },
    async rpc(name,p) {
      assert.equal(name,"reconcile_paymob_transaction");
      const params=[p.p_store,p.p_order,p.p_provider,p.p_tx,p.p_cents,p.p_currency,p.p_event];
      try {
        const {rows:[{data}]}=await db.query("select reconcile_paymob_transaction($1,$2,$3,$4,$5,$6,$7) data",params);
        return {data,error:null};
      } catch(e){return {data:null,error:e};}
    },
  };
  const reconcile=loadSource("lib/paymob-reconciliation.ts",{"./paymob":paymob,"./supabase/admin":{adminDb:()=>svc},
    "./notifications/events":{notifyPaymentOutcome:async(...event)=>notifications.push(event)}});
  const common={"@/lib/paymob-reconciliation":reconcile};
  const {GET}=loadSource("app/api/payments/paymob/callback/route.ts",{...common,"@/lib/host-routing":{paymentStorefrontUrl:()=>"https://shop.example"},
    "@/lib/host-resolver":{},"@/lib/tenant-shared":tenant,"@/lib/order-payment":payment,"@/lib/order-proof":{signOrderProof:()=>"short-proof"}});
  const {POST}=loadSource("app/api/payments/paymob/webhook/route.ts",common);
  function signed(overrides) {
    const fields={amount_cents:"1000",created_at:new Date().toISOString(),currency:"EGP",error_occured:"false",has_parent_transaction:"false",
      id:provider+"1",integration_id:"3",is_3d_secure:"false",is_auth:"false",is_capture:"false",is_refunded:"false",
      is_standalone_payment:"true",is_voided:"false",order:provider,owner:"1",pending:"false","source_data.pan":"0000",
      "source_data.sub_type":"wallet","source_data.type":"wallet",success:"true",...overrides};
    const hmac=createHmac("sha512",key).update(Object.values(fields).join("")).digest("hex");
    return new URLSearchParams({...fields,hmac});
  }
  return {
    get:(fields={},tamper=false)=>{
      const q=signed(fields);if(tamper)q.set("hmac","0".repeat(128));
      return GET(new Request("https://shopstage.live/api/payments/paymob/callback?"+q));
    },
    post:fields=>{
      const q=signed(fields);
      return POST(new Request("https://shopstage.live/api/payments/paymob/webhook",{method:"POST",
        body:JSON.stringify({obj:reconcile.queryTransaction(q),hmac:q.get("hmac")})}));
    },
  };
}
for(const first of ["get","post"]) test(first+" first reconciles once, redacts invalid returns and honors subsequent reversals",async()=>{
  const provider=first==="get"?"35001":"35002";
  const {rows:[order]}=await db.query("insert into orders(store_id,payment_method,payment_status,subtotal,paymob_order_id,guest_tracking) values($1,'paymob_wallet','pending',10,$2,false) returning *",[nova,provider]);
  await db.query("insert into payment_attempts(store_id,order_id,paymob_order_id,payment_method) values($1,$2,$3,'paymob_wallet')",[nova,order.id,provider]);
  const notifications=[],h=callbacks(order,provider,notifications);
  const initial=await h[first]({});
  assert.ok([200,303].includes(initial.status));
  const callback=await h.get();assert.equal(callback.headers.get("location"),"https://shop.example/orders?order="+order.id+"&payment=success");
  assert.equal((await (await h.post({})).json()).idempotent,true);
  assert.deepEqual(notifications,[[order.id,"paid"]]);
  for(const invalid of [await h.get({},true),await h.get({order:"999999"}),await h.get({currency:"USD"})]) {
    assert.equal(invalid.headers.get("location"),"/api/payments/paymob/return-error");
    assert.equal(invalid.headers.get("referrer-policy"),"no-referrer");
  }
  const event=first==="get"?"is_refunded":"is_voided";
  const reversed=await (await h.post({[event]:"true"})).json();
  assert.equal(reversed.payment_status,first==="get"?"refunded":"voided");
  await h.get();assert.equal(notifications.length,1);
});

test("a signed declined wallet returns the guest to its owning store with a short-lived recovery proof",async()=>{
  const provider="35003";
  const {rows:[order]}=await db.query("insert into orders(store_id,payment_method,payment_status,subtotal,paymob_order_id,guest_tracking) values($1,'paymob_wallet','pending',10,$2,true) returning *",[nova,provider]);
  await db.query("insert into payment_attempts(store_id,order_id,paymob_order_id,payment_method) values($1,$2,$3,'paymob_wallet')",[nova,order.id,provider]);
  const notifications=[],h=callbacks(order,provider,notifications);
  const redirect=await h.get({success:"false"});
  const target=new URL(redirect.headers.get("location"));
  assert.equal(target.origin,"https://shop.example");assert.equal(target.pathname,"/orders/return");assert.equal(target.searchParams.get("order"),order.id);
  assert.equal(target.searchParams.get("payment"),"failed");assert.equal(target.searchParams.get("proof"),"short-proof");
  await h.post({success:"false"});assert.deepEqual(notifications,[[order.id,"failed"]]);
});

test("rollout preserves historical provider-only references, enrolls unpaid holds once and leaves paid and COD orders alone",async()=>{
  const insert=async(method,status,provider)=>{
    const {rows:[row]}=await db.query("insert into orders(store_id,checkout_key,payment_method,payment_status,subtotal,paymob_order_id) values($1,$2,$3,$4,10,$5) returning id",
      [nova,crypto.randomUUID(),method,status,provider]);
    await db.query("update orders set reservation_expires_at=null where id=$1",[row.id]);
    await db.query("insert into order_items(order_id,quantity,unit_price) values($1,1,10)",[row.id]);
    return row.id;
  };
  const unpaid=await insert("paymob_card","failed","75101"),paid=await insert("paymob_wallet","paid","75102"),cod=await insert("cod","cod_pending","75103");
  await db.exec(migration);
  const read=async id=>(await db.query("select id,reservation_expires_at,payment_method,payment_status from orders where id=$1",[id])).rows[0];
  const first=await read(unpaid);
  assert.ok(first.reservation_expires_at);
  await db.exec(migration);
  assert.deepEqual(await read(unpaid),first);assert.equal((await read(cod)).reservation_expires_at,null);
  assert.equal((await read(paid)).payment_status,"paid");
  const journal=await db.query("select count(*)::int n from payment_attempts where paymob_order_id in ('75101','75102','75103')");
  assert.equal(journal.rows[0].n,3);
  const reversed=await db.query("select reconcile_paymob_transaction($1,$2,'75102','751021',1000,'EGP','refunded') r",[nova,paid]);
  assert.equal(reversed.rows[0].r.payment_status,"refunded");
});
