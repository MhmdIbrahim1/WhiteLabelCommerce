import Link from "next/link";
import { LogOut } from "lucide-react";
import { serverDb, checked } from "@/lib/db";
import { settings } from "@/lib/shop";
import { storeHref } from "@/lib/tenant";
import { pagination } from "@/lib/workflow";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { Timeline, GuestTracking } from "@/components/shop/tracking";
import { OrdersPaymentSync } from "@/components/shop/orders-payment-sync";
import { normalizeReturnRecord, type ReturnRequestRecord } from "@/lib/returns";
import { customerLogin, customerLogout, type Summary } from "./actions";

export default async function Orders({ searchParams }: PageProps<"/orders">) {
  const [params, s, db] = await Promise.all([
    searchParams,
    settings(),
    serverDb(),
  ]);
  const lang = await getServerLang(s.uiConfig.defaultLanguage);
  const { page, from, to } = pagination(params.page);
  const {
    data: { user },
  } = await db.auth.getUser();
  const paymentCallback =
    typeof params.payment === "string" ? params.payment.trim() : "";
  const callbackOrder =
    typeof params.order === "string" ? params.order.trim() : "";
  const placedCod =
    typeof params.placed === "string" && params.placed.trim() === "cod";
  const placedWallet =
    typeof params.placed === "string" && params.placed.trim() === "wallet";
  const result = user
    ? await db
        .from("orders")
        .select(
          "id,status,created_at,currency,payment_method,payment_status,shipping_carrier,tracking_number,tracking_url,courier_note,shipped_at,delivered_at,order_items(id,product_id,product_name,quantity,unit_price,size,color)",
          { count: "exact" },
        )
        .eq("store_id", s.storeId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    : null;

  const baseOrders = user && result ? (checked(result) as Summary[]) : [];
  const orderIds = baseOrders.map((o) => o.id);
  const returnsByOrder = new Map<string, ReturnRequestRecord>();
  if (user && orderIds.length > 0) {
    const returnsRes = await db
      .from("return_requests")
      .select("*")
      .eq("store_id", s.storeId)
      .eq("user_id", user.id)
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });
    if (!returnsRes.error && Array.isArray(returnsRes.data)) {
      for (const raw of returnsRes.data as Record<string, unknown>[]) {
        const rec = normalizeReturnRecord(raw);
        if (!returnsByOrder.has(rec.order_id)) {
          returnsByOrder.set(rec.order_id, rec);
        }
      }
    }
  }

  const userOrders: Summary[] = baseOrders.map((o) => ({
    ...o,
    return_request: returnsByOrder.get(o.id) ?? null,
  }));
  const paidOrderIds = userOrders
    .filter((o) => o.payment_status === "paid")
    .map((o) => o.id);

  return (
    <>
      <div className="split section-head">
        <div>
          <span className="section-kicker">{t(lang, "kickerLiveTracking")}</span>
          <h1>{t(lang, "myOrdersTitle")}</h1>
        </div>
      </div>
      <OrdersPaymentSync
        paymentCallback={paymentCallback}
        callbackOrder={callbackOrder}
        placedCod={placedCod}
        placedWallet={placedWallet}
        paidOrderIds={paidOrderIds}
      />
      <div className="details-grid">
        <GuestTracking />
        <section className="panel order-panel">
          <h2>
            {user
              ? t(lang, "accountOrdersTitle")
              : t(lang, "signInAccountTitle")}
          </h2>
          {user && result ? (
            <>
              <div className="orders-list">
                {userOrders.map((o, idx) => (
                  <Timeline
                    key={o.id}
                    row={o}
                    index={idx}
                    detailHref={storeHref(s.basePath, `/orders/${o.id}`)}
                    currency={o.currency || s.currency}
                  />
                ))}
              </div>
              {!result.data?.length && (
                <p className="panel shop-empty-state">{t(lang, "noOrdersYet")}</p>
              )}
              {(page > 1 || to + 1 < (result.count ?? 0)) && (
                <div className="actions orders-pager">
                  {page > 1 && (
                    <Link
                      className="section-more-link"
                      href={storeHref(s.basePath, "/orders?page=" + (page - 1))}
                    >
                      {t(lang, "prevPage")}
                    </Link>
                  )}
                  {to + 1 < (result.count ?? 0) && (
                    <Link
                      className="section-more-link"
                      href={storeHref(s.basePath, "/orders?page=" + (page + 1))}
                    >
                      {t(lang, "nextPage")}
                    </Link>
                  )}
                </div>
              )}
              <form action={customerLogout} className="orders-logout-form">
                <button className="orders-logout-btn">
                  <LogOut size={16} /> {t(lang, "navLogout")}
                </button>
              </form>
            </>
          ) : (
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
            </form>
          )}
        </section>
      </div>
    </>
  );
}
