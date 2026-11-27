import { money } from "@/lib/brand";
import { cookies } from "next/headers";
import { currentReceipt } from "@/lib/order-receipt";
import { latestOrderCookie } from "@/lib/order-proof";
import { paymentOutcome } from "@/lib/order-payment";
import { OrderBadges, OrderPaymentControls } from "@/components/shop/order-payment-controls";
import { serverDb, checked } from "@/lib/db";
import { settings } from "@/lib/shop";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { GuestTracking } from "@/components/shop/tracking";
import { OrdersPaymentSync } from "@/components/shop/orders-payment-sync";
import { OrderCards, type OrderCardRow, type OrderFilter } from "@/components/shop/order-cards";
import { customerLogin } from "./actions";
import "./orders.css";

export default async function Orders({ searchParams }: PageProps<"/orders">) {
  const [params, s, db] = await Promise.all([searchParams,settings(),serverDb()]);
  const lang = await getServerLang(s.uiConfig.defaultLanguage);
  const { data: { user } } = await db.auth.getUser();
  const filter: OrderFilter = params.filter === "completed" || params.filter === "cancelled" || params.filter === "active" ? params.filter : "all";
  const before = typeof params.before === "string" && Number.isFinite(Date.parse(params.before)) ? params.before : null;
  const id = typeof params.id === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(params.id) ? params.id : null;
  const pageSize = 12;
  const rows: OrderCardRow[] = user ? checked(await db.rpc("my_order_cards", {p_store_id:s.storeId,p_filter:filter,
    p_before: before && id ? before : null,p_before_id:before && id ? id : null,p_limit:pageSize+1})) : [];
  const page = rows.slice(0,pageSize);
  const wanted = typeof params.order === "string" ? params.order : (await cookies()).get(latestOrderCookie(s.storeId))?.value ?? "";
  const [receipt, details] = await Promise.all([
    currentReceipt(s.storeId, wanted, user?.id),
    user && page.length ? db.from("orders").select("id,payment_method,reservation_expires_at")
      .eq("store_id", s.storeId).eq("user_id", user.id).in("id", page.map(o => o.id)) : null,
  ]);
  if (details?.error) throw new Error("Order payment details unavailable");
  const byId = new Map(details?.data?.map(row => [row.id, row]));
  const cards = page.map(row => ({ ...row, ...byId.get(row.id) }));
  const last = page.at(-1);
  const next = rows.length > pageSize && last ? "/orders?"+new URLSearchParams({filter,before:last.created_at,id:last.id}) : null;
  return <section className="orders-hub"><h1>{t(lang,"myOrdersTitle")}</h1>
    <OrdersPaymentSync guest={receipt?.guest ?? !user}
      receipt={receipt} callbackOrder={receipt?.id ?? ""} paymentCallback={receipt && receipt.status !== "cancelled" && receipt.payment_method?.startsWith("paymob_") ? paymentOutcome(receipt.payment_status) : ""}
      placedCod={receipt?.payment_method === "cod" && receipt.status !== "cancelled"} placedWallet={receipt?.payment_method === "wallet" && receipt.payment_status === "paid"}
      placedCoupon={receipt?.payment_method === "coupon" && receipt.payment_status === "paid"} />
    {receipt && !cards.some(o => o.id === receipt.id) && <article className="history-card">
      <strong><bdi dir="ltr">{money(receipt.total, receipt.currency, lang)}</bdi></strong>
      <OrderBadges order={receipt} />
      <OrderPaymentControls order={receipt} options={s.payment} basePath={s.basePath} /></article>}
    {user ? <OrderCards rows={cards} filter={filter} basePath={s.basePath} options={s.payment} next={next} /> : <section className="panel">
      <h2>{t(lang,"signInAccountTitle")}</h2>
            <form action={customerLogin}>
              <label>
                {t(lang, "emailLabel")}
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  dir="ltr"
                  required
                />
              </label>
              <label>
                {t(lang, "passwordLabel")}
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  dir="ltr"
                  required
                />
              </label>
              <button>{t(lang, "navLogin")}</button>
              {params.login === "failed" && (
                <p role="alert">
                  {lang === "en" ? "Sign in failed." : "تعذر تسجيل الدخول."}
                </p>
              )}
            </form></section>}
    <details className="panel guest-lookup" open={!user}><summary>{lang === "en" ? "Track a guest order" : "تتبع طلب زائر"}</summary><GuestTracking options={s.payment} basePath={s.basePath} /></details>
  </section>;
}
