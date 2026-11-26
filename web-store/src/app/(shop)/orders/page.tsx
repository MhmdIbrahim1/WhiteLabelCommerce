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
  const last = page.at(-1);
  const next = rows.length > pageSize && last ? "/orders?"+new URLSearchParams({filter,before:last.created_at,id:last.id}) : null;
  return <section className="orders-hub"><h1>{t(lang,"myOrdersTitle")}</h1>
    <OrdersPaymentSync paymentCallback={typeof params.payment === "string" ? params.payment : ""}
      callbackOrder={typeof params.order === "string" ? params.order : ""} placedCod={params.placed === "cod"}
      placedWallet={params.placed === "wallet"} paidOrderIds={page.filter(o=>o.payment_status==="paid").map(o=>o.id)} />
    {user ? <OrderCards rows={page} filter={filter} basePath={s.basePath} next={next} /> : <section className="panel">
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
    <details className="panel guest-lookup" open={!user}><summary>{lang==="en" ? "Track a guest order" : "تتبع طلب زائر"}</summary><GuestTracking /></details>
  </section>;
}
