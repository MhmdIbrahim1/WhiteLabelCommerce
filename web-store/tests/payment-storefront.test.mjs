import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {setImmediate as tick} from "node:timers/promises";
import {loadSource} from "./helpers/load-source.mjs";
import * as payment from "../src/lib/order-payment.ts";
import * as routing from "../src/lib/host-routing.ts";
import * as tenant from "../src/lib/tenant-shared.ts";
import * as paymob from "../src/lib/paymob.ts";
import * as numbers from "../src/lib/order-number.ts";
import * as cartSession from "../src/lib/cart-session.ts";
import * as flash from "../src/lib/flash-sale.ts";

const store="00000000-0000-0000-0000-000000000001", id=crypto.randomUUID();
const guestCart = cartSession.cartScope(store, null);
const baseOrder={id,status:"pending",payment_method:"paymob_wallet",payment_status:"failed"};
const flags={codEnabled:true,paymobEnabled:true,paymobCardEnabled:true,paymobWalletEnabled:true};
const signatureLine={id:crypto.randomUUID(),size:"M",color:"Blue",quantity:2};
const line={...signatureLine,name:"Shirt",price:30,stock:20};
const nav={ "next/navigation":{useRouter:()=>({})} };
const hooks=lang=>({"@/components/language-provider":{useLanguage:()=>({lang,t:k=>k})}});

for(const lang of ["en","ar"]) test(lang+" cards render independent statuses, isolated numbers and exact-order retry choices",()=>{
  const controls=loadSource("components/shop/order-payment-controls.tsx",{
    ...nav,...hooks(lang),"@/lib/order-payment":payment,"@/lib/payment-client":{},"@/lib/tenant-shared":tenant,
    "@/app/(shop)/orders/actions":{},"@/app/(shop)/orders/payment-actions":{},
  });
  const {OrderCards}=loadSource("components/shop/order-cards.tsx",{
    "../language-provider":hooks(lang)["@/components/language-provider"],"./order-payment-controls":controls,"next/link":"a","next/image":"img",
    "@/lib/brand":{date:()=>"2026-11-27",money:()=>"60 EGP"},"@/lib/order-number":numbers,
    "@/lib/storefront-media":{},"@/lib/product-photo":{},"@/lib/tenant-shared":tenant,
  });
  function render(overrides={},options=flags){
    const row={...baseOrder,created_at:"2026-11-27",currency:"EGP",total:60,item_count:2,thumbnails:[],...overrides};
    return renderToStaticMarkup(React.createElement(OrderCards,{rows:[row],filter:"all",basePath:"/s/nova-store",next:null,options}));
  }
  const retry=lang==="en"?"Retry Payment":"إعادة محاولة الدفع", cod=lang==="en"?"Switch to Cash on Delivery":"تحويل للدفع عند الاستلام";
  const html=render();
  assert.ok(html.includes(lang==="en"?"Payment · Payment failed":"حالة الدفع · فشل الدفع"));
  assert.ok(html.includes(lang==="en"?"Fulfillment · Awaiting confirmation":"حالة التجهيز · بانتظار التأكيد"));
  assert.ok(html.includes(retry) && html.includes(cod)); assert.match(html,/<bdi dir="ltr">60 EGP<\/bdi>/);
  assert.ok(render({payment_status:"unpaid"}).includes(retry));
  assert.ok(!render({}, {...flags,codEnabled:false}).includes(cod));
  for(const row of [{payment_status:"paid"},{payment_status:"refunded"},{payment_status:"refund_pending"},{status:"cancelled"},
    {payment_method:"cod"},{reservation_expires_at:"2000-01-01T00:00:00Z"}]) assert.ok(!render(row).includes(retry));
});

test("callback origin rechecks original ownership, then verified primary, subdomain or preview alias",async()=>{
  const env={PLATFORM_ROOT_DOMAIN:"shopstage.live",VERCEL_ENV:"production",NODE_ENV:"production"};
  const route={id:store,slug:"nova-store",primaryDomain:"primary.example"};
  const directory=new Map([["slug:nova-store",route],["domain:primary.example",route],["domain:checkout.example",route]]);
  const lookup=async k=>directory.get(k.kind+":"+k.value) ?? null;
  const resolve=(original,platform="https://shopstage.live",environment=env)=>routing.paymentStorefrontUrl(store,route.slug,original,platform,lookup,environment);
  assert.equal(await resolve("https://checkout.example"),"https://checkout.example");
  assert.equal(await resolve("https://shopstage.live/store/nova-store"),"https://shopstage.live/store/nova-store");
  directory.set("domain:checkout.example",{...route,id:crypto.randomUUID()});
  assert.equal(await resolve("https://checkout.example"),"https://primary.example");
  directory.delete("domain:primary.example");
  assert.equal(await resolve("http://localhost:3000"),"https://nova-store.shopstage.live");
  const preview={VERCEL_ENV:"preview",VERCEL_URL:"qa.vercel.app",NODE_ENV:"production"};
  assert.equal(await resolve(null,"https://qa.vercel.app",preview),"https://qa.vercel.app/s/nova-store");
  assert.equal(await resolve("https://qa.vercel.app/store/nova-store","https://qa.vercel.app",preview),"https://qa.vercel.app/store/nova-store");
  assert.equal(await resolve("https://unrelated.vercel.app/s/nova-store","https://qa.vercel.app",preview),"https://qa.vercel.app/s/nova-store");
  assert.equal(await resolve("http://localhost:3000",null,{NODE_ENV:"production"}),null);
  directory.delete("slug:nova-store"); assert.equal(await resolve("https://primary.example"),null);
});

test("guest proofs bind the exact tenant, order, purpose and expiration",t=>{
  const old=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY="unit-fixture-key";
  t.after(()=>{if(old===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old;});
  const {signOrderProof,verifyOrderProof}=loadSource("lib/order-proof.ts",{"./paymob":paymob});
  const now=Date.now(), proof=signOrderProof("return",store,id,now);
  assert.ok(verifyOrderProof("return",store,id,proof,now));
  for(const args of [["receipt",store,id,proof,now],["return",crypto.randomUUID(),id,proof,now],
    ["return",store,crypto.randomUUID(),proof,now],["return",store,id,proof,now+301000],["return",store,id,proof+"x",now]])
    assert.equal(verifyOrderProof(...args),false);
});

function localCart(t) {
  const values=new Map(),events=new EventTarget();
  let queue=Promise.resolve();
  const storage={getItem:k=>values.get(k) ?? null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),
    key:i=>[...values.keys()][i],get length(){return values.size;}};
  const globals=[[globalThis,"window",events],[globalThis,"localStorage",storage],[navigator,"locks",{request(_name,job){
    const result=queue.then(job);queue=result.catch(()=>{});return result;
  }}]];
  for(const [obj,key,value] of globals) {
    const old=Object.getOwnPropertyDescriptor(obj,key);
    Object.defineProperty(obj,key,{configurable:true,value});
    t.after(()=>{if(old)Object.defineProperty(obj,key,old);else delete obj[key];});
  }
  const cart=loadSource("components/shop/cart-store.ts",{"@/lib/cart-session":cartSession,"@/components/auth-session":{},"@/lib/cart-heartbeat":{},"@/lib/supabase/browser":{},
    "@/lib/variant-stock":{remainingQuantity:()=>100},"@/lib/flash-sale":flash,"./studio-preview-context":{}});
  return {cart,storage,read:()=>JSON.parse(storage.getItem("wlc.cart.v4."+guestCart.key))};
}
test("parallel submissions share one checkout key across a method change and retain the exact order after redirect",async t=>{
  const {cart}=localCart(t);const sig=payment.cartSignature([line]);
  const reserve=method=>cart.reserveCartCheckout(guestCart,"guest",sig,"same basket and shipping",method,[signatureLine]);
  const [first,second]=await Promise.all([reserve("paymob_wallet"),reserve("paymob_card")]);
  assert.equal(first.key,second.key);assert.equal(second.method,"paymob_wallet");
  await cart.bindCartCheckout(guestCart,first.key,id);
  assert.equal((await reserve("cod")).orderId,id);
  assert.equal(cart.pendingCheckout(guestCart,"guest",sig).orderId,id);
  assert.equal(cart.pendingCheckout(guestCart,"another buyer",sig),undefined);
});

test("a verified receipt consumes once across tabs, subtracts only original quantities, and reports persisted analytics",async t=>{
  const {cart,storage,read}=localCart(t);
  const extra={...line,id:crypto.randomUUID(),quantity:1}, sibling={...line,size:"L",quantity:1};
  storage.setItem("wlc.cart.v4."+guestCart.key,JSON.stringify([line,sibling])); // existing on-disk array format
  const a=await cart.reserveCartCheckout(guestCart,"guest",payment.cartSignature([line]),"shipping","paymob_card",[signatureLine]);
  await cart.bindCartCheckout(guestCart,a.key,id);
  await cart.change(guestCart,line,-1,null); await cart.change(guestCart,line,3,null); await cart.change(guestCart,extra,1,null);
  const receipt={...baseOrder,store_id:store,payment_status:"paid",total:56.75,currency:"USD",lines:[line]};
  assert.equal(await cart.consumeReceipt(guestCart,{...receipt,store_id:crypto.randomUUID()}),false);
  assert.equal(await cart.consumeReceipt(guestCart,{...receipt,lines:[{...line,quantity:9}]}),false);
  const tracked=[];
  const {OrdersPaymentSync}=loadSource("components/shop/orders-payment-sync.tsx",{react:{useEffect:fn=>fn()},
    "@/lib/order-number":numbers,"@/components/floating-toast":{},"./cart-store":{...cart,useCartScope:()=>guestCart},
    "@/lib/analytics":{trackPurchase:p=>tracked.push(p)},...hooks("en")});
  const query={paymentCallback:"success",callbackOrder:id,guest:true};
  OrdersPaymentSync({...query,receipt:null});await tick();
  assert.equal(read().lines.find(l=>l.size==="M" && l.id===line.id).quantity,4);
  OrdersPaymentSync({...query,receipt}); OrdersPaymentSync({...query,receipt});await tick();
  assert.equal(tracked.length,1);assert.equal(tracked[0].value,56.75);assert.equal(tracked[0].currency,"USD");
  assert.deepEqual(read().lines.map(l=>l.quantity),[3,1,1]);
  await cart.change(guestCart,line,1,null);OrdersPaymentSync({...query,receipt});await tick();
  assert.deepEqual(read().lines.map(l=>l.quantity),[4,1,1]);assert.equal(tracked.length,1);
});

test("coupon confirmation has its own localized banner and fresh quote inputs follow quantity and sale boundaries",()=>{
  const {OrdersPaymentSync}=loadSource("components/shop/orders-payment-sync.tsx",{react:{useEffect(){}},
    "@/lib/order-number":numbers,"@/components/floating-toast":{},"./cart-store":{useCartScope:()=>guestCart},
    "@/lib/analytics":{},...hooks("en")});
  const html=renderToStaticMarkup(OrdersPaymentSync({guest:true,callbackOrder:id,placedCoupon:true}));
  assert.match(html,/coupon covered the full amount/);assert.doesNotMatch(html,/Store Wallet/);
  let clock=1000,qty=1;
  const {useBasketContents}=loadSource("components/shop/cart-lines.tsx",{react:{useState:x=>[x,()=>{}],useEffect(){},useCallback:fn=>fn},
    "./cart-store":{useCartScope:()=>guestCart,useDefaultOrderLimit:()=>10,remainingQuantity:()=>8,lineEffectivePrice:flash.lineEffectivePrice,
      useCart:()=>[{...line,quantity:qty,regular_price:100,flash_sale_price:50,flash_sale_ends_at:new Date(2000).toISOString()}]},
    "./use-sale-clock":{useSaleClock:()=>clock},"./store-copy":{},"@/lib/brand":{},"@/lib/i18n":{},"@/lib/variant-stock":{},
    "@/lib/tenant-shared":tenant,"@/lib/storefront-media":{},"@/lib/product-photo":{},...hooks("en")});
  const a=useBasketContents();qty=2;const b=useBasketContents();clock=3000;const c=useBasketContents();
  assert.deepEqual([a.subtotal,b.subtotal,c.subtotal],[50,100,200]);
  assert.equal(new Set([a.quoteBasis,b.quoteBasis,c.quoteBasis]).size,3);
});

test("receipt access checks buyer ownership or a store-scoped guest cookie before returning authoritative lines",async()=>{
  let proof=false,owner=null,reads=0;
  const queries=[];
  const svc={from(){const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},
    maybeSingle(){reads++;queries.push(filters);return {data:{id,store_id:store,user_id:owner,guest_tracking:owner===null,total:"42.75",currency:"USD",
      status:"pending",payment_method:"paymob_card",payment_status:"paid",order_items:[{product_id:line.id,size:"M",color:"Blue",quantity:2,unit_price:30,product_name:"Shirt"}]},error:null};}};}};
  const {authorizedReceipt}=loadSource("lib/order-receipt.ts",{"next/headers":{cookies:async()=>({get:()=>({value:"fixture"})})},
    "./paymob":paymob,"./supabase/admin":{adminDb:()=>svc},"./order-proof":{receiptCookie:()=>"cookie",verifyOrderProof:(_s,tenantId)=>proof&&tenantId===store}});
  assert.equal(await authorizedReceipt(store,id),null);assert.equal(reads,0);
  proof=true;const receipt=await authorizedReceipt(store,id);assert.equal(receipt.total,42.75);assert.equal(receipt.currency,"USD");
  assert.deepEqual(receipt.lines,[{id:line.id,size:"M",color:"Blue",quantity:2,price:30,name:"Shirt"}]);
  assert.equal(await authorizedReceipt(crypto.randomUUID(),id),null);
  owner=crypto.randomUUID();assert.equal(await authorizedReceipt(store,id),null);assert.equal(await authorizedReceipt(store,id,crypto.randomUUID()),null);
  proof=false;assert.ok(await authorizedReceipt(store,id,owner));assert.deepEqual(queries.at(-1),{store_id:store,id,user_id:owner});
});

test("guest return exchanges a verified proof for a host-only receipt and removes the proof from the navigation URL",async()=>{
  const saved=[];
  const {GET}=loadSource("app/(shop)/orders/return/route.ts",{"@/lib/order-proof":{verifyOrderProof:(scope,s,o,p)=>scope==="return"&&s===store&&o===id&&p==="proof"},
    "@/lib/order-payment":payment,"@/lib/order-receipt":{rememberCheckout:async(...args)=>saved.push(args),currentReceipt:async()=>({payment_status:"failed"})},
    "@/lib/tenant":{resolveActiveStoreOrDefault:async()=>({id:store,basePath:"/s/nova-store"}),storeHref:tenant.storeHref}});
  const route="https://qa.vercel.app/s/nova-store/orders/return?payment=failed&order="+id+"&proof=";
  assert.equal((await GET(new Request(route+"wrong"))).headers.get("location"),"/api/payments/paymob/return-error");
  const response=await GET(new Request(route+"proof"));assert.equal(response.status,303);
  assert.equal(response.headers.get("location"),"/s/nova-store/orders?order="+id+"&payment=failed");
  assert.deepEqual(saved,[[store,id,true]]);
});

function basketHarness(t,{gateway,quote}) {
  const slots=[],effects=[],refs=[];
  let i=0,j=0,k=0;
  function state(initial){const n=i++;if(!(n in slots))slots[n]=typeof initial==="function"?initial():initial;
    return [slots[n],v=>{slots[n]=typeof v==="function"?v(slots[n]):v;}];}
  function effect(run,deps){const n=j++,old=effects[n];if(!old || deps.some((d,index)=>d!==old.deps[index])){
    old?.dispose?.();effects[n]={deps,run};}}
  const router={push:v=>h.routes.push(v),replace:v=>h.routes.push(v)};
  const h={qty:1,unit:30,routes:[],checkouts:[],bindings:[],quoteCalls:[],receipt:{id,total:30,currency:"EGP",method:"paymob_wallet",paymentStatus:"pending",status:"pending"}};
  const {Basket}=loadSource("components/shop/basket.tsx",{
    "react":{useState:state,useEffect:effect,useRef:initial=>refs[k++]??=( {current:initial}),useSyncExternalStore:(_s,get)=>get()},
    "next/link":"a","next/navigation":{useRouter:()=>router},...hooks("en"),
    "./cart-lines":{CartLines:"cart-lines",useBasketContents:()=>({tenant:store,lines:[{...line,quantity:h.qty,price:h.unit}],subtotal:h.qty*h.unit,
      quoteBasis:JSON.stringify([h.qty,h.unit]),overLimit:false,retry:()=>{}})},
    "./store-copy":{},"./cart-store":{pendingCheckout:()=>null,lineEffectivePrice:flash.lineEffectivePrice,syncAbandonedCartContact(){},
      reserveCartCheckout:async(_t,_b,_s,_f,method)=>({key:"fixed-key",method}),bindCartCheckout:async(...args)=>h.bindings.push(args),
      discardCheckout:async()=>{}},
    "@/lib/analytics":{trackInitiateCheckout(){}}, "@/lib/order-payment":payment,"./order-payment-controls":{OrderPaymentControls:"retry-controls"},
    "@/app/(shop)/orders/payment-actions":{},"@/lib/payment-client":{paymentDeadline:p=>p,startOrderPayment:gateway},
    "@/app/(shop)/checkout/action":{checkout:async(...args)=>{h.checkouts.push(args);return h.receipt;},
      previewCoupon:async(code,lines)=>{h.quoteCalls.push(lines);return quote(code,lines,h);}},
    "@/lib/brand":{money:n=>n+" EGP"},"@/lib/tenant-shared":tenant,"./address-book":{},"@/lib/egypt-locations":{findEgyptGovernorate:()=>null},
    "./cart-incentive-bar":{},"./cart-upsell-strip":{},
  });
  const old=globalThis.FormData;
  globalThis.FormData=class {get(key){return ({delivery:"{}",recipient_name:"Buyer",address:"QA address",phone:"01000000001"})[key];}};
  t.after(()=>{globalThis.FormData=old;});
  h.render=()=>{i=j=k=0;const tree=Basket({order:true,storeId:store,buyer:"guest",fee:0,currency:"EGP",defaultPhone:"01000000001",
    paymentOptions:{...flags,codEnabled:false,paymobCardEnabled:false},basePath:"/s/nova-store"});
    for(const e of effects){if(e.run){e.dispose=e.run();delete e.run;}}return tree;};
  return h;
}
function elements(tree){
  if(Array.isArray(tree))return tree.flatMap(elements);
  return tree?.props?[tree,...elements(tree.props.children)]:[];
}
function submit(tree){return elements(tree).find(el=>el.type==="form").props.onSubmit({preventDefault(){},currentTarget:{querySelector:()=>null}});}

test("checkout leaves its redirect screen after a wallet decline and presents recovery for the exact submitted order",async t=>{
  let finish;const gatewayCalls=[];
  const h=basketHarness(t,{gateway:(...args)=>{gatewayCalls.push(args);return new Promise(resolve=>{finish=resolve;});}});
  const task=submit(h.render());
  const until=Date.now()+2000;
  while(!finish && Date.now()<until)await tick();
  assert.ok(finish,"checkout reached the gateway");
  assert.ok(elements(h.render()).some(el=>el.props.className==="panel payment-redirect-screen"));
  finish("failed");await task;
  const result=elements(h.render());
  const controls=result.find(el=>el.type==="retry-controls");
  assert.equal(controls.props.order.id,id);assert.equal(controls.props.initialState,"failed");assert.equal(controls.props.basePath,"/s/nova-store");
  assert.ok(!result.some(el=>el.type==="form" || el.props.className==="panel payment-redirect-screen"));
  assert.deepEqual(h.bindings,[[store,"fixed-key",id]]);assert.equal(h.checkouts.length,1);
  assert.deepEqual(gatewayCalls,[["/s/nova-store",id,"wallet","01000000001","01000000001"]]);
});

test("basket invalidates a coupon immediately when cart prices or quantities change and submits the reviewed zero-due method",async t=>{
  const h=basketHarness(t,{gateway:()=>assert.fail("coupon-funded order reached gateway"),quote:(code,lines,h)=>({
    valid:true,code,subtotal:h.unit*lines[0].quantity,discountAmount:h.unit*lines[0].quantity,message:"OK"})});
  const find=(tree,pred)=>elements(tree).find(pred);
  const input=find(h.render(),e=>e.props.placeholder==="couponPlaceholder");
  input.props.onChange({target:{value:"FREE"}});
  find(h.render(),e=>e.type==="button" && e.props.children==="couponApply").props.onClick();
  h.render();await tick();h.render();
  for(const [qty,unit] of [[2,30],[2,40]]){
    h.qty=qty;h.unit=unit;
    const changed=h.render();assert.equal(find(changed,e=>e.props.form==="store-checkout").props.disabled,true);
    await tick();
    const fresh=h.render();assert.equal(find(fresh,e=>e.props.form==="store-checkout").props.disabled,false);
  }
  h.receipt={...h.receipt,method:"coupon",paymentStatus:"paid",status:"confirmed",total:0};
  await submit(h.render());assert.equal(h.checkouts[0][3],"coupon");assert.equal(h.checkouts[0].at(-1),0);
  assert.deepEqual(h.routes,["/s/nova-store/orders?placed=coupon&order="+id]);
  assert.deepEqual(h.quoteCalls.map(lines=>lines[0].quantity),[1,2,2]);
});
