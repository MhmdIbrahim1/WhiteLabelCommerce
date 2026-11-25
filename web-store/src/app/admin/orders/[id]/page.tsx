import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Truck,
  ExternalLink,
  MapPin,
  Phone,
  Calendar,
  FileText,
  RotateCcw,
} from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import { money, date } from "@/lib/brand";
import { t, translateColor } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { nextOrder } from "@/lib/workflow";
import { isSafeHttpUrl, localizeCarrierLabel } from "@/lib/shipping";
import { normalizeReturnRecord, returnStatusMeta } from "@/lib/returns";
import { Notice, Status, Empty } from "../../ui";
import { OrderStatusForm } from "../order-status-form";

export default async function OrderDetails({
  params,
  searchParams,
}: PageProps<"/admin/orders/[id]">) {
  const [{ id }, { db, storeId }, lang] = await Promise.all([
    params,
    requireAdmin(),
    getServerLang(),
  ]);
  const isEn = lang === "en";
  const [result, returnRes] = await Promise.all([
    db
      .from("orders")
      .select("*,order_items(*)")
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle(),
    db
      .from("return_requests")
      .select("*")
      .eq("order_id", id)
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (!result.data && !result.error) notFound();
  const o = checked(result);
  const linkedReturn =
    !returnRes.error && Array.isArray(returnRes.data) && returnRes.data[0]
      ? normalizeReturnRecord(returnRes.data[0] as Record<string, unknown>)
      : null;
  const linkedReturnMeta = linkedReturn
    ? returnStatusMeta(linkedReturn.status, lang)
    : null;
  const options = (nextOrder[o.status] ?? []).filter(
    (s) => o.subtotal !== null || s === "cancelled",
  );

  return (
    <>
      <Link href="/admin/orders">
        {isEn ? "← Back to Orders" : "← العودة إلى الطلبات"}
      </Link>
      <h1>
        {isEn ? "Order" : "طلب"} <bdi>#{id.slice(0, 8)}</bdi>
      </h1>
      <Notice result={(await searchParams).result} />

      {linkedReturn && linkedReturnMeta && (
        <section
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <RotateCcw size={17} />
            <strong>
              {isEn ? "Linked Return / Exchange Request" : "طلب إرجاع / استبدال مرتبط"}
            </strong>
            <span
              style={{
                padding: "0.2rem 0.65rem",
                borderRadius: "999px",
                fontSize: "0.78rem",
                fontWeight: 700,
                background: linkedReturnMeta.bg,
                color: linkedReturnMeta.color,
                border: `1px solid ${linkedReturnMeta.border}`,
              }}
            >
              {linkedReturnMeta.label}
            </span>
            <span dir="ltr" style={{ fontWeight: 700 }}>
              {money(linkedReturn.refund_amount, o.currency, lang)}
            </span>
          </div>
          <Link href="/admin/returns" className="btn-outline-admin">
            {isEn ? "Manage in Returns Queue" : "إدارة في صفحة المرتجعات"}
          </Link>
        </section>
      )}

      <section className="card stack">
        <div className="row">
          <h2>{isEn ? "Order & Customer Details" : "تفاصيل الطلب والعميل"}</h2>
          <Status value={o.status} />
        </div>

        <div className="order-detail-grid">
          <div className="order-info-tile">
            <Calendar size={15} />
            <div>
              <small>{isEn ? "Order Date" : "تاريخ الطلب"}</small>
              <strong>{date(o.created_at, lang)}</strong>
            </div>
          </div>
          {o.phone && (
            <div className="order-info-tile">
              <Phone size={15} />
              <div>
                <small>{t(lang, "deliveryPhone")}</small>
                <strong dir="ltr">{o.phone}</strong>
              </div>
            </div>
          )}
          <div className="order-info-tile wide">
            <MapPin size={15} />
            <div>
              <small>{t(lang, "shippingAddressLabel")}</small>
              <strong>{o.shipping_address}</strong>
            </div>
          </div>
        </div>

        {(o.shipping_carrier ||
          o.tracking_number ||
          o.tracking_url ||
          o.courier_note ||
          o.shipped_at ||
          o.delivered_at) && (
          <div className="shipping-summary-box">
            <h3>
              <Truck size={16} />{" "}
              {isEn ? "Shipping & Delivery Info" : "معلومات الشحن والتسليم"}
            </h3>
            <div className="order-detail-grid">
              {o.shipping_carrier && (
                <div className="order-info-tile">
                  <Truck size={15} />
                  <div>
                    <small>{isEn ? "Carrier" : "شركة الشحن"}</small>
                    <strong>{localizeCarrierLabel(o.shipping_carrier, lang)}</strong>
                  </div>
                </div>
              )}
              {o.tracking_number && (
                <div className="order-info-tile">
                  <FileText size={15} />
                  <div>
                    <small>{t(lang, "trackingNumber")}</small>
                    <strong dir="ltr">{o.tracking_number}</strong>
                  </div>
                </div>
              )}
              {o.shipped_at && (
                <div className="order-info-tile">
                  <Calendar size={15} />
                  <div>
                    <small>{t(lang, "shippedOn")}</small>
                    <strong>{date(o.shipped_at, lang)}</strong>
                  </div>
                </div>
              )}
              {o.delivered_at && (
                <div className="order-info-tile">
                  <Calendar size={15} />
                  <div>
                    <small>{t(lang, "deliveryDeliveredAt")}</small>
                    <strong>{date(o.delivered_at, lang)}</strong>
                  </div>
                </div>
              )}
              {o.courier_note && (
                <div className="order-info-tile wide">
                  <FileText size={15} />
                  <div>
                    <small>{isEn ? "Courier Note" : "ملاحظة المندوب"}</small>
                    <strong>{o.courier_note}</strong>
                  </div>
                </div>
              )}
            </div>
            {o.tracking_url && isSafeHttpUrl(o.tracking_url) && (
              <a
                href={o.tracking_url}
                target="_blank"
                rel="noreferrer"
                className="btn-outline-admin"
                style={{ width: "fit-content" }}
              >
                {t(lang, "trackShipment")} <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}

        <OrderStatusForm
          orderId={id}
          currentStatus={o.status}
          options={options}
          shippingCarrier={o.shipping_carrier ?? null}
          trackingNumber={o.tracking_number ?? null}
          trackingUrl={o.tracking_url ?? null}
          courierNote={o.courier_note ?? null}
          deliveryToken={o.delivery_token ?? null}
          shippingAddress={o.shipping_address}
          phone={o.phone ?? null}
          totalLabel={money(o.total, o.currency, lang)}
        />
      </section>

      <section className="card">
        <h2>{t(lang, "adminOrderItems")}</h2>
        {o.order_items.length ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>{t(lang, "adminProductCol")}</th>
                  <th>{t(lang, "adminVariantCol")}</th>
                  <th>{t(lang, "adminQtyCol")}</th>
                  <th>{t(lang, "adminUnitPriceCol")}</th>
                </tr>
              </thead>
              <tbody>
                {o.order_items.map(
                  (i: {
                    id: string;
                    product_name: string;
                    size?: string | null;
                    color?: string | null;
                    quantity: number;
                    unit_price: number;
                  }) => (
                    <tr key={i.id}>
                      <td><strong>{i.product_name}</strong></td>
                      <td>
                        {i.size || i.color ? (
                          <div className="variant-badges-row">
                            {i.size && (
                              <span className="variant-pill-badge">
                                {t(lang, "sizeLabel")}: <b>{i.size}</b>
                              </span>
                            )}
                            {i.color && (
                              <span className="variant-pill-badge">
                                {t(lang, "colorLabel")}: <b>{translateColor(i.color, lang)}</b>
                              </span>
                            )}
                          </div>
                        ) : (
                          <small>—</small>
                        )}
                      </td>
                      <td>{i.quantity}</td>
                      <td>{money(i.unit_price, o.currency, lang)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {isEn ? "No line items recorded." : "لا توجد بنود مسجلة."}
          </Empty>
        )}
        <div className="order-totals-footer">
          <div className="order-totals-breakdown">
            <p>
              {t(lang, "shippingLabel")} ·{" "}
              {Number(o.shipping_fee) === 0
                ? isEn
                  ? "Free"
                  : "مجاني"
                : money(o.shipping_fee, o.currency, lang)}
            </p>
            {Number(o.wallet_discount ?? 0) > 0 && (
              <p style={{ color: "#15803d", fontWeight: 600 }}>
                {isEn ? "Wallet Credit Used" : "خصم رصيد المحفظة"} · -
                {money(Number(o.wallet_discount), o.currency, lang)}
              </p>
            )}
            {Number(o.cashback_earned ?? 0) > 0 && (
              <p style={{ color: "#0369a1", fontWeight: 600 }}>
                {isEn ? "Cashback Credited" : "الكاش باك المضاف"} · +
                {money(Number(o.cashback_earned), o.currency, lang)}
              </p>
            )}
          </div>
          <strong>
            {isEn ? "Total" : "الإجمالي"} · {money(o.total, o.currency, lang)}
          </strong>
        </div>
      </section>
    </>
  );
}
