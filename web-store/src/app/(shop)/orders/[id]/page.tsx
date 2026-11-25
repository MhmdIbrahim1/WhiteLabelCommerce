import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, Phone, Wallet, Sparkles } from "lucide-react";
import { serverDb, checked } from "@/lib/db";
import { settings } from "@/lib/shop";
import { storeHref } from "@/lib/tenant";
import { money } from "@/lib/brand";
import { getServerLang } from "@/lib/i18n-server";
import { t, translateColor } from "@/lib/i18n";
import { Timeline } from "@/components/shop/tracking";
import { OrderReturnPanel } from "@/components/shop/order-return-panel";
import {
  normalizeReturnRecord,
  type ReturnRequestRecord,
} from "@/lib/returns";
import type { OrderItemSummary, Summary } from "../actions";

type DetailedOrderRow = Summary & {
  shipping_address: string;
  currency: string;
  subtotal: number | null;
  shipping_fee: number;
  wallet_discount?: number | null;
  cashback_earned?: number | null;
  total: number | null;
  order_items: OrderItemSummary[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, store, db] = await Promise.all([
    params,
    settings(),
    serverDb(),
  ]);
  const lang = await getServerLang(store.uiConfig.defaultLanguage);
  const isEn = lang === "en";
  const BackArrow = isEn ? ArrowLeft : ArrowRight;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(storeHref(store.basePath, `/orders/${id}`))}`,
    );
  }

  const [orderRes, returnRes] = await Promise.all([
    db
      .from("orders")
      .select(
        "id,status,created_at,shipping_address,phone,payment_method,payment_status,currency,subtotal,shipping_fee,wallet_discount,cashback_earned,total,shipping_carrier,tracking_number,tracking_url,courier_note,shipped_at,delivered_at,order_items(id,product_id,product_name,quantity,unit_price,size,color)",
      )
      .eq("id", id)
      .eq("store_id", store.storeId)
      .eq("user_id", user.id)
      .maybeSingle<DetailedOrderRow>(),
    db
      .from("return_requests")
      .select("*")
      .eq("order_id", id)
      .eq("store_id", store.storeId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (!orderRes.data && !orderRes.error) {
    notFound();
  }

  const order = checked(orderRes);
  const latestReturnRow =
    !returnRes.error && Array.isArray(returnRes.data) && returnRes.data[0]
      ? normalizeReturnRecord(returnRes.data[0] as Record<string, unknown>)
      : null;

  const orderItems = order.order_items ?? [];

  return (
    <div className="order-detail-page">
      <div className="order-detail-topbar">
        <Link
          href={storeHref(store.basePath, "/orders")}
          className="section-more-link"
        >
          <BackArrow size={15} />
          <span>{isEn ? "Back to My Orders" : "العودة إلى طلباتي"}</span>
        </Link>
      </div>

      <div className="split section-head">
        <div>
          <span className="section-kicker">
            {isEn ? "Order Details" : "تفاصيل الطلب"}
          </span>
          <h1>
            {isEn ? "Order" : "طلب"}{" "}
            <span dir="ltr">#{order.id.slice(0, 8)}</span>
          </h1>
        </div>
      </div>

      <div className="details-grid">
        <div style={{ display: "grid", gap: "1.25rem", alignContent: "start" }}>
          <Timeline row={order} hideReturnPanel />

          <section className="panel order-return-section">
            <div className="order-return-section-head">
              <h2>
                {isEn ? "Returns & Exchanges" : "الإرجاع والاستبدال"}
              </h2>
              <small>
                {order.status === "delivered"
                  ? isEn
                    ? "Self-service returns with instant Store Wallet refunds."
                    : "خدمة الإرجاع والاستبدال الذاتي مع إيداع فوري في محفظة المتجر."
                  : isEn
                    ? "Returns become available once your order is delivered."
                    : "يتاح طلب الإرجاع أو الاستبدال تلقائياً بعد تسليم الطلب."}
              </small>
            </div>

            {order.status === "delivered" || latestReturnRow ? (
              <OrderReturnPanel
                orderId={order.id}
                orderStatus={order.status}
                currency={order.currency || store.currency}
                orderItems={orderItems}
                initialReturn={latestReturnRow as ReturnRequestRecord | null}
              />
            ) : (
              <p className="orders-empty-note" style={{ margin: 0 }}>
                {isEn
                  ? "Your order is not delivered yet."
                  : "لم يتم تسليم الطلب بعد."}
              </p>
            )}
          </section>
        </div>

        <section className="panel order-detail-summary-panel">
          <h2>{isEn ? "Order Summary & Shipping" : "ملخص الطلب والتوصيل"}</h2>

          <div className="order-detail-address-box">
            {order.phone && (
              <div className="order-detail-info-row">
                <Phone size={15} />
                <span dir="ltr">{order.phone}</span>
              </div>
            )}
            <div className="order-detail-info-row">
              <MapPin size={15} />
              <span>{order.shipping_address}</span>
            </div>
          </div>

          <ul className="order-detail-lines">
            {orderItems.map((it) => (
              <li key={it.id} className="order-detail-line-row">
                <div>
                  <strong>
                    {it.product_name} × {it.quantity}
                  </strong>
                  {(it.size || it.color) && (
                    <div className="variant-badges-row" style={{ marginTop: "0.25rem" }}>
                      {it.size && (
                        <span className="variant-pill-badge">
                          {t(lang, "sizeLabel")}: <b>{it.size}</b>
                        </span>
                      )}
                      {it.color && (
                        <span className="variant-pill-badge">
                          {t(lang, "colorLabel")}:{" "}
                          <b>{translateColor(it.color, lang)}</b>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <strong dir="ltr">
                  {money(it.unit_price * it.quantity, order.currency, lang)}
                </strong>
              </li>
            ))}
          </ul>

          <div className="order-detail-totals">
            <div>
              <span>{t(lang, "subtotalLabel")}</span>
              <strong dir="ltr">
                {money(order.subtotal, order.currency, lang)}
              </strong>
            </div>
            <div>
              <span>{t(lang, "shippingLabel")}</span>
              <strong dir="ltr">
                {Number(order.shipping_fee) === 0
                  ? isEn
                    ? "Free"
                    : "مجاني"
                  : money(order.shipping_fee, order.currency, lang)}
              </strong>
            </div>
            {Number(order.wallet_discount ?? 0) > 0 && (
              <div style={{ color: "#15803d" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <Wallet size={14} />
                  {isEn ? "Wallet Credit Used" : "خصم محفظة المتجر"}
                </span>
                <strong dir="ltr">
                  -{money(Number(order.wallet_discount), order.currency, lang)}
                </strong>
              </div>
            )}
            {Number(order.cashback_earned ?? 0) > 0 && (
              <div style={{ color: "#0369a1" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <Sparkles size={14} />
                  {isEn ? "Cashback Earned" : "الكاش باك المكتسب"}
                </span>
                <strong dir="ltr">
                  +{money(Number(order.cashback_earned), order.currency, lang)}
                </strong>
              </div>
            )}
            <div className="order-detail-grand-total">
              <span>{isEn ? "Total" : "الإجمالي"}</span>
              <strong dir="ltr">
                {money(order.total, order.currency, lang)}
              </strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
