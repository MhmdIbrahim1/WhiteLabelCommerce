import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";
import * as flow from "../src/lib/auth-flow.ts";
import * as otp from "../src/lib/email-otp.ts";
import * as phone from "../src/lib/phone.ts";
import * as tenant from "../src/lib/tenant-shared.ts";
import * as cartSession from "../src/lib/cart-session.ts";
import { loadSource } from "./helpers/load-source.mjs";
import { view, nodes, label, replaceGlobal } from "./helpers/auth-view.mjs";

const userA = "user-a", userB = "user-b", store = tenant.DEFAULT_STORE_ID;
const email = "merchant@example.test";
const user = { id: userA, email, email_confirmed_at: "2026-11-27T12:00:00Z" };
const line = { id: "product", color: "blue", size: "M", name: "Shirt", price: 20, quantity: 2, stock: 12 };
const receipt = { id: "receipt", store_id: store, status: "confirmed", payment_status: "paid",
  payment_method: "paymob_card", currency: "EGP", total: 40, lines: [line] };

function browser(t) {
  const values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) };
  const win = Object.assign(new EventTarget(),{ location: { search: "", replace() {}, reload() {} } });
  replaceGlobal(t,"window",win); replaceGlobal(t,"localStorage",storage);
  return { win, storage };
}

function cartFixture(t) {
  const {win,storage}=browser(t);
  const previous=Object.getOwnPropertyDescriptor(navigator,"locks");
  let queue=Promise.resolve(), active=userA, context, dispose;
  Object.defineProperty(navigator,"locks",{configurable:true,value:{ request(_key,fn) {
    const result=queue.then(fn);queue=result.catch(()=>{});return result;
  } }});
  t.after(()=>{if(previous)Object.defineProperty(navigator,"locks",previous);else delete navigator.locks;});
  const cart=loadSource("components/shop/cart-store.ts",{
    react:{ createContext:()=>({Provider:"provider"}), createElement:(type,props,child)=>{if(type==="provider")context=props.value;return child;},
      useContext:()=>context,useMemo:fn=>fn(),useLayoutEffect:fn=>{dispose=fn();}, useCallback:fn=>fn,useSyncExternalStore:(_sub,get)=>get()},
    "@/lib/cart-session":cartSession,"@/components/auth-session":{useSessionUser:()=>active,cartSessionEnded:"end"},
    "@/lib/cart-heartbeat":{createCartHeartbeat:()=>({cancel(){},schedule(){},recover(){}})},"@/lib/supabase/browser":{},
    "@/lib/variant-stock":{remainingQuantity:()=>12},"@/lib/flash-sale":{},"./studio-preview-context":{useStudioPreview:()=>null},
  });
  function mount(owner,storeId=store){
    dispose?.();
    active=owner;
    cart.CartTenantProvider({storeId,slug:"nova-store",userId:owner,defaultMaxOrderQty:null,children:"cart"});
    return cart.useCartScope();
  }
  return {cart,win,storage,mount};
}

test("user, guest and tenant carts have independent contents, session IDs and checkout reservations across logout",async t=>{
  const {cart,win,storage,mount}=cartFixture(t);
  const guest=mount(null);await cart.change(guest,{...line,id:"guest-item"},1,null);
  const a=mount(userA);await cart.change(a,line,2,null);
  const attempt=await cart.reserveCartCheckout(a,userA,"basket","shipping","paymob_card",[line]);
  await cart.bindCartCheckout(a,attempt.key,receipt.id);
  const id=cart.getCartSessionKey(a);cart.getGuestSessionId(a);
  storage.setItem("wlc.pending_online_order."+a.key,"transient");
  win.dispatchEvent(new CustomEvent("end",{detail:userA}));cartSession.clearCartSessionStorage(userA);
  assert.equal(storage.getItem("wlc.pending_online_order."+a.key),null);assert.equal(storage.getItem("wlc.cart_session."+a.key),null);
  assert.equal(storage.getItem("wlc.guest_session."+a.key),null);
  mount(null);assert.deepEqual(cart.useCart().map(l=>l.id),["guest-item"]);
  assert.notEqual(cart.getCartSessionKey(guest),id);assert.equal(cart.pendingCheckout(guest,userA,"basket"),undefined);
  assert.equal(await cart.consumeReceipt(guest,receipt),false);
  const b=mount(userB);assert.deepEqual(cart.useCart(),[]);
  assert.equal(await cart.consumeReceipt(b,receipt),false);
  mount(userA,"other-store");assert.deepEqual(cart.useCart(),[]);
  mount(userA);assert.deepEqual(cart.useCart().map(l=>l.quantity),[2]);
  const sameAttempt=await cart.reserveCartCheckout(a,userA,"basket","shipping","paymob_wallet",[line]);assert.equal(sameAttempt.key,attempt.key);
  await cart.change(a,line,1,null);
  assert.equal(await cart.consumeReceipt(a,receipt),true);assert.equal(await cart.consumeReceipt(a,receipt),false);
  assert.deepEqual(cart.useCart().map(l=>l.quantity),[1]);mount(null);assert.deepEqual(cart.useCart().map(l=>l.id),["guest-item"]);
});

test("v3 hydration recovers buyer-attributable reservations and keeps unattributed lines out of shared-browser carts",async t=>{
  const {cart,storage,mount}=cartFixture(t);
  const legacy={lines:[{...line,quantity:5},{...line,id:"unowned"}],consumed:["older-private-order"],
    attempts:[{key:"existing-key",buyer:userA,signature:"basket",fingerprint:"shipping",method:"paymob_card",
      orderId:receipt.id,lines:[line],remaining:[{...line,quantity:1}]}]};
  storage.setItem("wlc.cart.v3."+store,JSON.stringify(legacy));
  for(const owner of [null,userB]){ mount(owner);assert.deepEqual(cart.useCart(),[]); }
  const a=mount(userA);assert.deepEqual(cart.useCart().map(l=>[l.id,l.quantity]),[["product",1]]);
  assert.equal(cart.pendingCheckout(a,userA,"basket").key,"existing-key");
  assert.equal(await cart.consumeReceipt(a,receipt),true);assert.deepEqual(cart.useCart(),[]);
  assert.equal(await cart.consumeReceipt(a,receipt),false);
});

test("explicit sign-out hides the identity while pending, clears its local session and broadcasts only after success",async t=>{
  const {win,storage}=browser(t);
  let authChanged,unsubscribed=false,refreshes=0,resolveLogout,replaced;
  const router={refresh(){refreshes++;}};
  win.location.replace=path=>{replaced=path;};
  const app=view("components/auth-session.tsx",{
    "next/navigation":{useRouter:()=>router},"@/lib/cart-session":cartSession,"./language-provider":{useLanguage:()=>({lang:"en"})},"./floating-toast":{showToast(){}},
    "@/lib/supabase/browser":{browserDb:()=>({auth:{onAuthStateChange(fn){authChanged=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}}})},
    "@/app/login/actions":{endSessionAction:()=>new Promise(resolve=>{resolveLogout=resolve;})},
  });
  const render=()=>app.render("AuthSessionProvider",{initialUser:userA,children:"page"}).props.value;
  let ended;win.addEventListener(app.exports.cartSessionEnded,e=>{ended=e.detail;});
  const initial=render();app.flush();assert.equal(initial.userId,userA);
  const key="wlc.cart_session."+store+":"+userA;
  storage.setItem(key,"old");const done=initial.end(new FormData());
  assert.equal(render().userId,null);assert.equal(ended,userA);assert.equal(storage.getItem(key),"old");
  assert.equal(storage.getItem("wlc.auth.change"),null);
  authChanged("TOKEN_REFRESHED",{user:{id:userA}});assert.equal(render().userId,null);
  resolveLogout({ok:false});assert.equal(await done,false);assert.equal(render().userId,userA);
  authChanged("SIGNED_OUT",null);assert.equal(render().userId,null);assert.equal(storage.getItem(key),null);assert.ok(refreshes>0);
  authChanged("SIGNED_IN",{user:{id:userB}});const again=render().end(new FormData());
  resolveLogout({ok:true,redirectTo:"/register?next=%2Fcreate-store"});assert.equal(await again,true);
  assert.equal(replaced,"/register?next=%2Fcreate-store");assert.ok(storage.getItem("wlc.auth.change"));
  app.unmount();assert.equal(unsubscribed,true);
});

test("guest bell is absent; unmount aborts the inbox refresh and realtime channel, and a new owner starts with zero unread",async t=>{
  const {win}=browser(t);let active=null,aborted=false,removed=0;
  const channel={on(){return this;},subscribe(){return this;}};
  const imports={"next/navigation":{useRouter:()=>({})},"@/components/language-provider":{useLanguage:()=>({lang:"en",t:k=>k})},
    "@/components/auth-session":{useSessionUser:()=>active},"@/lib/supabase/browser":{browserDb:()=>({channel:()=>channel,removeChannel:()=>{removed++;}})},
    "@/lib/notifications/web-push":{},"@/lib/security":{},"@/lib/shipping":{CARRIER_PRESETS:[]},"@/lib/tenant-shared":tenant};
  const app=view("components/notifications/notification-bell.tsx",imports);
  const props={storeId:store,userId:userA,scope:"customer",basePath:"/s/nova-store"};
  const wrapper=()=>app.exports.NotificationBell(props);
  let calls=0;
  replaceGlobal(t,"fetch",async(url,init)=>{
    calls++;assert.ok(url.startsWith("/s/nova-store/api/notifications/inbox"));
    init.signal.addEventListener("abort",()=>{aborted=true;},{once:true});
    if(calls===1)return Response.json({items:Array.from({length:4},(_,i)=>({id:String(i),is_read:false}))});
    return new Promise(resolve=>init.signal.addEventListener("abort",()=>resolve(Response.json({items:[]})),{once:true}));
  });
  assert.equal(wrapper(),null);assert.equal(calls,0);
  active=userA;const inbox=wrapper();const draw=()=>app.render(inbox.type,inbox.props);
  draw();app.flush();await tick();
  const bell=nodes(draw()).find(n=>n.props.className?.includes?.("notif-bell-btn"));assert.match(bell.props["aria-label"],/\(4\)/);
  bell.props.onClick();assert.equal(calls,2);
  active=null;assert.equal(wrapper(),null);app.unmount();assert.equal(aborted,true);assert.equal(removed,1);
  active=userB;assert.equal(wrapper(),null);props.userId=userB;const newInbox=wrapper();
  assert.notEqual(newInbox.key,inbox.key);
  const fresh=view("components/notifications/notification-bell.tsx",imports), freshBell=fresh.exports.NotificationBell(props);
  assert.equal(nodes(fresh.render(freshBell.type,freshBell.props)).find(n=>n.props.className?.includes?.("notif-bell-btn")).props["aria-label"],"notifTitle");
  assert.equal(win.location.search,"");
});

test("create-store page and both onboarding mutations check the verified server account before rendering or querying",async()=>{
  let current=null,queries=0;
  const db={auth:{getUser:()=>({data:{user:current}})},rpc(){queries++;throw Error("unexpected rpc");}};
  const access={"@/lib/db":{serverDb:async()=>db},"@/lib/auth-flow":flow};
  const {default:page}=loadSource("app/create-store/page.tsx",{...access,"next/navigation":{redirect:path=>{throw Error(path);}},
    "./wizard":{CreateStoreWizard:"wizard"},"@/components/workspace-surface":{AuthShell:"shell"}});
  const mutation=loadSource("app/create-store/actions.ts",{...access,"@/lib/action-error":{},"next/cache":{},"next/headers":{},
    "@/lib/theme-templates":{},"@/lib/tenant-shared":tenant,"@/lib/host-routing":{isStoreSlug:()=>true}});
  for(const denied of [null,{...user,email_confirmed_at:null}]){
    current=denied;
    await assert.rejects(page({searchParams:Promise.resolve({name:"Test Store"})}),/\/login\?next=%2Fcreate-store%3Fname%3DTest%2BStore/);
    assert.deepEqual(await mutation.createStoreAction({}),{ok:false,errorCode:"auth_required"});
    assert.equal((await mutation.checkSlugAvailability("test-store")).available,false);
  }
  assert.equal(queries,0);current=user;
  assert.deepEqual(await mutation.createStoreAction({ expectedUserId: userB }), {ok:false,errorCode:"account_changed"});
  assert.equal(queries,0);
  const wizard=nodes(await page({searchParams:Promise.resolve({})})).find(e=>e.type==="wizard");
  assert.equal(wizard.props.userId,user.id);assert.equal(wizard.props.email,email);
  assert.equal(wizard.props.registerNext,"/create-store");
});

test("onboarding names the verified account in AR and EN with an explicit switch-account action",()=>{
  for(const lang of ["ar","en"]){
    let active=userA;
    const app=view("app/create-store/wizard.tsx",{"next/link":"a","./actions":{},"@/lib/theme-templates":{templates:Object.fromEntries(
      ["modern-minimal","luxury-boutique","vibrant-pop","tech-grid"].map(key=>[key,{}]))},
      "@/components/language-provider":{useLanguage:()=>({lang})},"@/components/auth-session":{LogoutForm:"logout",useSessionUser:()=>active}});
    const props={initialName:"",email,userId:userA,registerNext:"/create-store"};
    const form=app.render("CreateStoreWizard",props);
    const tree=app.render(form.type,form.props);const banner=nodes(tree).find(n=>n.type==="aside");
    assert.match(label(banner),lang==="en"?/new store will be linked to this account/:/سيتم ربط المتجر الجديد بهذا الحساب/);
    const identity=nodes(banner).find(n=>n.type==="bdi");assert.equal(identity.props.dir,"ltr");assert.equal(label(identity),email);
    const logout=nodes(banner).find(n=>n.type==="logout");assert.equal(logout.props.registerNext,"/create-store");
    assert.equal(label(logout),lang==="en"?"Sign out & create a new account":"تسجيل الخروج وإنشاء حساب جديد");
    active=null;assert.equal(nodes(app.render("CreateStoreWizard",props)).some(n=>n.type==="form"),false);
  }
});

test("switch account clears server cookies, refreshes layouts, and returns to fresh registration only after successful local sign-out",async()=>{
  const deleted=[],refreshes=[],scopes=[];
  const jar={getAll:()=>["wlc_order_store","wlc_receipt_order",tenant.ADMIN_STORE_COOKIE,"shop_theme"].map(name=>({name})),delete:name=>deleted.push(name)};
  let error=null;
  const {endSessionAction}=loadSource("app/login/actions.ts",{"next/navigation":{},"next/cache":{revalidatePath:(...args)=>refreshes.push(args)},
    "next/headers":{cookies:()=>jar},"@/lib/auth-flow":flow,"@/lib/email-otp":otp,"@/lib/phone":phone,
    "@/lib/auth-destination":{},"@/lib/tenant-shared":tenant,"@/lib/storefront-auth":{},"@/lib/tenant":{...tenant,resolveActiveStore:()=>null},
    "@/lib/db":{serverDb:()=>({auth:{signOut:opts=>{scopes.push(opts.scope);return {error};}}})}});
  const form=new FormData();form.set("switchAccount","1");form.set("next","/create-store?name=My+Store");
  assert.deepEqual(await endSessionAction(form),{ok:true,redirectTo:"/register?next=%2Fcreate-store%3Fname%3DMy%2BStore"});
  assert.deepEqual(scopes,["local"]);assert.deepEqual(refreshes,[["/","layout"]]);
  assert.deepEqual(deleted,["wlc_order_store","wlc_receipt_order",tenant.ADMIN_STORE_COOKIE]);
  error={};assert.deepEqual(await endSessionAction(form),{ok:false});assert.equal(deleted.length,3);
});

test("apex header shows the appropriate dashboard or customer account and sign-out for the active session",async()=>{
  let active=null,merchant=false,lang="ar";
  const {default:landing}=loadSource("app/platform-landing/page.tsx",{"next/link":"a","next/image":"img","next/headers":{},
    "@/lib/db":{requestUser:()=>active,serverDb:()=>({})},"@/lib/access":{adminUser:()=>merchant?user:null},
    "@/components/auth-session":{LogoutForm:"logout"},"@/components/language-provider":{},"@/components/plan-comparison":{},
    "@/components/platform-brand":{},"@/lib/billing-data":{getPlanCatalog:async()=>[]},
    "@/lib/i18n":{langDir:l=>l==="ar"?"rtl":"ltr"},"@/lib/i18n-server":{getServerLang:()=>lang},
    "@/lib/platform-theme":{resolveTheme:()=>({})},"@/lib/platform-theme-data":{getPublishedTheme:()=>({})},
    "@/lib/tenant-shared":tenant,"./catalog":{},"./feature-demos":{},"./hero":{},"@/components/platform-theme.css":{},"./landing.css":{}});
  const header=async()=>nodes(await landing()).find(n=>n.type==="header");
  for(lang of ["ar","en"]){
    active=null;assert.ok(nodes(await header()).some(n=>n.props.href==="/login?next=/admin"));
    active=user;merchant=false;assert.ok(nodes(await header()).some(n=>n.props.href==="/account"));
    merchant=true;const h=await header();
    assert.equal(label(nodes(h).find(n=>n.props.href==="/admin")),lang==="en"?"Dashboard":"لوحة التحكم");
    assert.ok(nodes(h).some(n=>n.type==="logout"));assert.ok(!nodes(h).some(n=>n.props.href?.startsWith("/login")));
  }
});

test("a quota-limited browser drops the previous user's in-memory cart on sign-out", async t => {
  const {cart,storage,win,mount}=cartFixture(t);
  const a=mount(userA);
  storage.setItem=()=>{throw Error("storage quota");};
  await cart.change(a,line,1,null);
  assert.deepEqual(cart.useCart().map(l=>l.quantity),[1]);
  win.dispatchEvent(new CustomEvent("end",{detail:userA}));
  mount(null);assert.deepEqual(cart.useCart(),[]);
  mount(userA);assert.deepEqual(cart.useCart(),[]);
});
