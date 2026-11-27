import { formatOrderNumber } from "@/lib/order-number";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, Phone, Wallet, Sparkles, TicketPercent } from "lucide-react";
import { serverDb, checked } from "@/lib/db";
import { settings } from "@/lib/shop";
import { storeHref } from "@/lib/tenant";
import { date, money } from "@/lib/brand";
import { getServerLang } from "@/lib/i18n-server";
import { t, translateColor } from "@/lib/i18n";
import { InvoiceButton } from "@/components/shop/invoice-button";
import "../orders.css";
import { Timeline } from "@/components/shop/tracking";
import { OrderReturnPanel } from "@/components/shop/order-return-panel";
import {
  normalizeReturnRecord,
  type ReturnRequestRecord,
} from "@/lib/returns";
import type { OrderItemSummary, Summary } from "../actions";

type DetailedOrderRow = Summary & {
  shipping_address: string;
  lat: number | null;
  lng: number | null;
  currency: string;
  subtotal: number | null;
  shipping_fee: number;
  coupon_code?: string | null;
  discount_amount?: number | null;
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
        "id,status,created_at,shipping_address,lat,lng,phone,payment_method,payment_status,reservation_expires_at,currency,subtotal,shipping_fee,coupon_code,discount_amount,wallet_discount,cashback_earned,total,shipping_carrier,tracking_number,tracking_url,courier_note,shipped_at,delivered_at,order_items(id,product_id,product_name,quantity,unit_price,size,color)",
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
  const itemsGrossSubtotal =
    orderItems.length > 0
      ? Math.round(
          orderItems.reduce(
            (sum, it) => sum + Number(it.unit_price) * Number(it.quantity),
            0,
          ) * 100,
        ) / 100
      : Number(order.subtotal ?? 0);
  const recordedDiscount = Number(order.discount_amount ?? 0);
  const derivedDiscount =
    order.subtotal !== null && itemsGrossSubtotal > Number(order.subtotal) + 0.005
      ? Math.round((itemsGrossSubtotal - Number(order.subtotal)) * 100) / 100
      : 0;
  const couponDiscount =
    recordedDiscount > 0 ? recordedDiscount : derivedDiscount;
  const displayItemsSubtotal =
    couponDiscount > 0 ? itemsGrossSubtotal : Number(order.subtotal ?? itemsGrossSubtotal);

  return (
    <div className="order-detail-page">
      <nav className="order-actions" aria-label={isEn ? "Order actions" : "إجراءات الطلب"}>
        <InvoiceButton />
        <Link href={storeHref(store.basePath,"/contact?order="+order.id)}>{isEn ? "Support" : "الدعم"}</Link>
        {order.status === "delivered" && <><a href="#order-returns">{isEn ? "Return" : "إرجاع"}</a>
          {orderItems[0]?.product_id && <Link href={storeHref(store.basePath,"/products/"+orderItems[0].product_id+"#reviews")}>{isEn ? "Review" : "تقييم"}</Link>}</>}
      </nav>
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
            <bdi dir="ltr">{formatOrderNumber(order.id)}</bdi>
          </h1>
        </div>
      </div>

      <div className="details-grid">
        <div style={{ display: "grid", gap: "1.25rem", alignContent: "start" }}>
          <Timeline row={order} hideReturnPanel options={store.payment} basePath={store.basePath} />

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

            <span id="order-returns" />
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
          <div className="invoice-heading">
            <h1>{isEn ? "Invoice" : "فاتورة"} <bdi dir="ltr">{formatOrderNumber(order.id)}</bdi></h1>
            <p>{store.name} · <bdi dir="ltr">{date(order.created_at, lang)}</bdi></p>
          </div>
          <h2>{isEn ? "Order Summary & Shipping" : "ملخص الطلب والتوصيل"}</h2>

          <div className="order-detail-address-box">
            {order.lat != null && order.lng != null && <a href={"https://www.google.com/maps/search/?api=1&query="+order.lat+","+order.lng}
              rel="noreferrer" target="_blank"><MapPin size={16}/> {isEn ? "Delivery pin" : "موقع التوصيل"}</a>}
            {order.phone && (
              <div className="order-detail-info-row">
                <Phone size={15} />
                <bdi dir="ltr">{order.phone}</bdi>
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
                    {it.product_name} × <bdi dir="ltr">{it.quantity.toLocaleString(lang)}</bdi>
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
                  <bdi dir="ltr">{money(it.unit_price * it.quantity, order.currency, lang)}</bdi>
                </strong>
              </li>
            ))}
          </ul>

          <div className="order-detail-totals">
            <div>
              <span>{isEn ? "Items Subtotal" : "قيمة المنتجات"}</span>
              <strong dir="ltr">
                <bdi dir="ltr">{money(displayItemsSubtotal, order.currency, lang)}</bdi>
              </strong>
            </div>
            {couponDiscount > 0 && (
              <div className="order-detail-discount-row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <TicketPercent size={14} />
                  {isEn ? "Coupon Discount" : "خصم الكوبون"}
                  {order.coupon_code && <> (<bdi dir="ltr">{order.coupon_code}</bdi>)</>}
                </span>
                <strong dir="ltr">
                  <bdi dir="ltr">-{money(couponDiscount, order.currency, lang)}</bdi>
                </strong>
              </div>
            )}
            {Number(order.wallet_discount ?? 0) > 0 && (
              <div className="order-detail-discount-row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <Wallet size={14} />
                  {isEn ? "Wallet Credit" : "خصم محفظة المتجر"}
                </span>
                <strong dir="ltr">
                  <bdi dir="ltr">-{money(Number(order.wallet_discount), order.currency, lang)}</bdi>
                </strong>
              </div>
            )}
            <div>
              <span>{t(lang, "shippingLabel")}</span>
              <strong dir="ltr">
                {Number(order.shipping_fee) === 0
                  ? isEn
                    ? "Free"
                    : "مجاني"
                  : <bdi dir="ltr">{money(order.shipping_fee, order.currency, lang)}</bdi>}
              </strong>
            </div>
            {Number(order.cashback_earned ?? 0) > 0 && (
              <div className="order-detail-cashback-row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <Sparkles size={14} />
                  {isEn ? "Cashback Earned" : "الكاش باك المكتسب"}
                </span>
                <strong dir="ltr">
                  <bdi dir="ltr">+{money(Number(order.cashback_earned), order.currency, lang)}</bdi>
                </strong>
              </div>
            )}
            <div className="order-detail-grand-total">
              <span>{isEn ? "Net Total" : "الإجمالي الصافي"}</span>
              <strong dir="ltr">
                <bdi dir="ltr">{money(order.total, order.currency, lang)}</bdi>
              </strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
