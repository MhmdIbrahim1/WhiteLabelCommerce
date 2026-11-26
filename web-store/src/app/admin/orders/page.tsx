import { Suspense } from "react";
import { RouteSkeleton } from "@/components/route-skeleton";
import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { Truck, ArrowLeft, ArrowRight, Phone, MapPin, Package } from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import { date, money } from "@/lib/brand";
import { orderStatusLabel, type Lang } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { nextOrder, orders, pagination } from "@/lib/workflow";
import { localizeCarrierLabel, summarizeAddress } from "@/lib/shipping";
import { updateOrder } from "../mutations";
import { Empty, Notice, Pager, Status } from "../ui";

type AdminOrderRow = {
  id: string;
  created_at: string;
  status: string;
  currency: string;
  total: number | null;
  subtotal: number | null;
  shipping_address: string;
  phone: string | null;
  user_id: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  delivery_token: string | null;
  order_items: {
    product_name: string;
    quantity: number;
    size: string | null;
    color: string | null;
  }[];
};

function itemsSummary(items: AdminOrderRow["order_items"], lang: Lang): string {
  if (!items.length) return lang === "en" ? "No items" : "بدون بنود";
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const first = items[0];
  const variant = [first.size, first.color].filter(Boolean).join(" / ");
  const firstLabel = variant
    ? `${first.product_name} (${variant})`
    : first.product_name;
  if (items.length === 1) {
    return `${firstLabel} × ${first.quantity}`;
  }
  return lang === "en"
    ? `${firstLabel} + ${items.length - 1} more (${totalQty} pcs)`
    : `${firstLabel} + ${items.length - 1} أخرى (${totalQty} قطعة)`;
}

async function OrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  const [params, lang, { db, storeId }] = await Promise.all([
    searchParams,
    getServerLang(),
    requireAdmin(),
  ]);
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  const { page, from, to } = pagination(params.page);
  const status =
    typeof params.status === "string" && Object.hasOwn(orders, params.status)
      ? params.status
      : "";
  let query = db
    .from("orders")
    .select(
      "id,created_at,status,currency,total,subtotal,shipping_address,phone,user_id,shipping_carrier,tracking_number,delivery_token,order_items(product_name,quantity,size,color)",
      { count: "exact" },
    )
    .eq("store_id", storeId);
  if (status) query = query.eq("status", status);
  const result = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);

  const rows = checked(result) as AdminOrderRow[];

  return (
    <>
      <h1>{isEn ? "Orders & Fulfillment" : "إدارة الطلبات والشحن"}</h1>
      <Notice result={params.result} />
      <section className="card">
        <form className="inline" method="get">
          <label>
            {isEn ? "Order Status" : "حالة الطلب"}
            <select name="status" defaultValue={status}>
              <option value="">{isEn ? "All" : "الكل"}</option>
              {Object.keys(orders).map((k) => (
                <option key={k} value={k}>
                  {orderStatusLabel(k, lang)}
                </option>
              ))}
            </select>
          </label>
          <button>{isEn ? "Filter" : "تصفية"}</button>
        </form>

        {!rows.length ? (
          <Empty>
            {isEn ? "No orders to display." : "لا توجد طلبات للعرض."}
          </Empty>
        ) : (
          <>
            <div className="scroll admin-orders-desktop">
              <table>
                <thead>
                  <tr>
                    <th>{isEn ? "Order" : "الطلب"}</th>
                    <th>{isEn ? "Customer / Address" : "العميل / العنوان"}</th>
                    <th>{isEn ? "Items & Variants" : "المنتجات والخيارات"}</th>
                    <th>{isEn ? "Total" : "الإجمالي"}</th>
                    <th>{isEn ? "Status & Shipping" : "الحالة والشحن"}</th>
                    <th>{isEn ? "Quick Actions" : "إجراءات سريعة"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const options = (nextOrder[o.status] ?? []).filter(
                      (s) => o.subtotal !== null || s === "cancelled",
                    );
                    const quickOptions = options.filter((s) => s !== "shipped");
                    return (
                      <tr key={o.id}>
                        <td>
                          <Link
                            className="code"
                            href={"/admin/orders/" + o.id}
                          >
                            #{o.id.slice(0, 8)}
                          </Link>
                          <br />
                          <small>{date(o.created_at, lang)}</small>
                        </td>
                        <td className="order-cell-wrap">
                          <strong>
                            {o.user_id
                              ? isEn
                                ? "Registered Customer"
                                : "عميل مسجّل"
                              : isEn
                                ? "Guest Customer"
                                : "عميل زائر"}
                          </strong>
                          {o.phone && (
                            <small className="order-meta-line" dir="ltr">
                              {o.phone}
                            </small>
                          )}
                          <small className="order-meta-line">
                            {summarizeAddress(o.shipping_address)}
                          </small>
                        </td>
                        <td className="order-cell-wrap">
                          <span>{itemsSummary(o.order_items ?? [], lang)}</span>
                        </td>
                        <td>
                          <strong>{money(o.total, o.currency, lang)}</strong>
                        </td>
                        <td>
                          <Status value={o.status} />
                          {o.shipping_carrier && (
                            <small className="order-meta-line">
                              <Truck size={12} /> {localizeCarrierLabel(o.shipping_carrier, lang)}
                              {o.tracking_number
                                ? ` · ${o.tracking_number}`
                                : ""}
                            </small>
                          )}
                        </td>
                        <td>
                          <div className="order-quick-actions">
                            {quickOptions.length > 0 && (
                              <form
                                action={updateOrder}
                                className="quick-status-form"
                              >
                                <input type="hidden" name="id" value={o.id} />
                                <input
                                  type="hidden"
                                  name="previous"
                                  value={o.status}
                                />
                                <input
                                  type="hidden"
                                  name="existing_delivery_token"
                                  value={o.delivery_token ?? ""}
                                />
                                <input
                                  type="hidden"
                                  name="return_to"
                                  value="/admin/orders"
                                />
                                <select
                                  name="status"
                                  aria-label={isEn ? "Quick status" : "تغيير الحالة السريع"}
                                  defaultValue={quickOptions[0]}
                                >
                                  {quickOptions.map((s) => (
                                    <option key={s} value={s}>
                                      {orderStatusLabel(s, lang)}
                                    </option>
                                  ))}
                                </select>
                                <SubmitButton
                                  type="submit"
                                  className="btn-compact-admin"
                                >
                                  {isEn ? "Update" : "تغيير الحالة"}
                                </SubmitButton>
                              </form>
                            )}
                            {options.includes("shipped") && (
                              <Link
                                href={"/admin/orders/" + o.id}
                                className="btn-ship-link"
                              >
                                <Truck size={14} />{" "}
                                {isEn ? "Ship Order" : "شحن الطلب"}
                              </Link>
                            )}
                            <Link
                              href={"/admin/orders/" + o.id}
                              className="btn-outline-admin"
                            >
                              {isEn ? "Details" : "التفاصيل"}{" "}
                              <ArrowIcon size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="admin-orders-mobile">
              {rows.map((o) => (
                <article key={o.id} className="mobile-order-card">
                  <div className="row">
                    <div>
                      <Link className="code" href={"/admin/orders/" + o.id}>
                        #{o.id.slice(0, 8)}
                      </Link>
                      <small style={{ display: "block" }}>
                        {date(o.created_at, lang)}
                      </small>
                    </div>
                    <Status value={o.status} />
                  </div>
                  <div className="mobile-order-meta">
                    {o.phone && (
                      <span>
                        <Phone size={13} /> <bdi dir="ltr">{o.phone}</bdi>
                      </span>
                    )}
                    <span>
                      <MapPin size={13} /> {summarizeAddress(o.shipping_address)}
                    </span>
                    <span>
                      <Package size={13} />{" "}
                      {itemsSummary(o.order_items ?? [], lang)}
                    </span>
                    {o.shipping_carrier && (
                      <span>
                        <Truck size={13} /> {localizeCarrierLabel(o.shipping_carrier, lang)}
                        {o.tracking_number ? ` · ${o.tracking_number}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="row">
                    <strong>{money(o.total, o.currency, lang)}</strong>
                    <Link
                      href={"/admin/orders/" + o.id}
                      className="btn-outline-admin"
                    >
                      {isEn ? "Details & Shipping" : "التفاصيل والشحن"}{" "}
                      <ArrowIcon size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <Pager
          page={page}
          count={result.count ?? 0}
          base={"/admin/orders?status=" + status}
        />
      </section>
    </>
  );
}

export default function Page(props: PageProps<"/admin/orders">) {
  return (
    <Suspense fallback={<RouteSkeleton layout="list" />}>
      <OrdersPage {...props} />
    </Suspense>
  );
}
