import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RouteSkeleton } from "@/components/route-skeleton";
import { DataCell, DirectoryFilters, DirectoryPager, StatusDot, WorkspaceEmpty, WorkspaceHeading, WorkspaceTable } from "@/components/workspace-data";
import { DirectoryDrawer, InspectRow } from "@/components/workspace-drawer";
import { checked, requireAdmin } from "@/lib/db";
import { date, money } from "@/lib/brand";
import { orderStatusLabel } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { orders, pagination, pageSize } from "@/lib/workflow";
import { directoryHref, isRecordId, orderFilters, orderIdBounds, searchText } from "@/lib/workspace-directory";
import { paymentStatusLabel } from "@/lib/order-payment";
import { storefrontPath } from "@/lib/tenant-shared";
import { Notice } from "../ui";
import { OrderRecord } from "./order-record";

const path = "/admin/orders";
type DirectoryOrder = {
  id: string; created_at: string; status: string; currency: string; total: number | null; customer_name: string | null;
  user_id: string | null; phone: string | null; payment_status: string | null; payment_review: string | null; quantity: number;
};

async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const [params, lang, { db, storeId, activeStore }] = await Promise.all([searchParams, getServerLang(), requireAdmin("manage_orders")]);
  const en = lang === "en";
  const { page } = pagination(params.page);
  const q = searchText(params.q);
  const status = typeof params.status === "string" && Object.hasOwn(orders, params.status) ? params.status : "";
  const inspect = isRecordId(params.inspect) ? params.inspect : null;
  const order = orderFilters(params);
  const bounds = orderIdBounds(q);
  const { rows, total_count: count } = checked(await db.rpc("merchant_order_directory", {
    p_store_id: storeId, p_q: q || null, p_id_min: bounds?.first ?? null, p_id_max: bounds?.last ?? null,
    p_status: status || null, p_payment: order.payment || null, p_from: order.from || null, p_to: order.to || null,
    p_page: page, p_page_size: pageSize,
  })) as { rows: DirectoryOrder[]; total_count: number };
  const linkFilters = { q, status, page, ...order };
  const cols = en ? ["Order", "Customer", "Total", "Fulfillment", "Payment status", "Inspect"] :
    ["الطلب", "العميل", "الإجمالي", "التنفيذ", "حالة الدفع", "معاينة"];
  const filtered = Boolean(q || status || order.payment || order.from || order.to || page > 1);
  return <div className="ws-page">
    <WorkspaceHeading title={en ? "Orders" : "الطلبات"} description={en ? "Review purchases, prepare shipments and track delivery." : "راجع المشتريات وجهّز الشحنات وتابع وصولها إلى عملائك."} />
    <Notice result={params.result} />
    <section className="ws-sheet ws-order-sheet">
      <DirectoryFilters path={path} query={q} status={status} lang={lang} order={order} choices={Object.keys(orders).map(s => [s, orderStatusLabel(s, lang)])}
        placeholder={en ? "Order number, customer name or phone" : "رقم الطلب أو اسم العميل أو هاتفه"} />
      {rows.length ? <WorkspaceTable columns={cols} caption={en ? "Store orders" : "طلبات المتجر"}>
        {rows.map(o => {
          const href = directoryHref(path, { ...linkFilters, inspect: o.id });
          const qty = o.quantity;
          return <InspectRow key={o.id} href={href}>
            <DataCell><div className="ws-cell-stack"><Link id={"inspect-" + o.id} href={href} replace prefetch={false} scroll={false} aria-haspopup="dialog">
              <bdi dir="ltr">#{o.id.slice(0, 8)}</bdi></Link><small><bdi dir="ltr">{date(o.created_at, lang)}</bdi> · <bdi dir="ltr">{qty}</bdi> {en ? (qty === 1 ? "item" : "items") : "قطعة"}</small></div></DataCell>
            <DataCell label={cols[1]}><div className="ws-cell-stack"><strong dir="auto">{o.customer_name || (o.user_id ? (en ? "Registered customer" : "عميل مسجّل") : (en ? "Guest customer" : "عميل زائر"))}</strong>
              {o.phone && <small><bdi dir="ltr">{o.phone}</bdi></small>}</div></DataCell>
            <DataCell label={cols[2]}><strong><bdi dir="ltr">{money(o.total, o.currency, lang)}</bdi></strong></DataCell>
            <DataCell label={cols[3]}><StatusDot status={o.status}>{orderStatusLabel(o.status, lang)}</StatusDot></DataCell>
            <DataCell label={cols[4]}><div className="ws-cell-stack">
              <StatusDot status={o.payment_status ?? ""}>{paymentStatusLabel(o.payment_status, en)}</StatusDot>
              {o.payment_review !== null && <small>{paymentStatusLabel("review", en)}</small>}
            </div></DataCell>
            <DataCell><Link href={href} replace prefetch={false} scroll={false} className="ws-icon-button" aria-haspopup="dialog" aria-label={cols[5] + " #" + o.id.slice(0, 8)}>
              <ArrowRight className="pt-directional" size={16} /></Link></DataCell>
          </InspectRow>;
        })}</WorkspaceTable> : <WorkspaceEmpty title={filtered ? (en ? "No orders match this view" : "لا توجد طلبات مطابقة") :
          en ? "Your first order will appear here" : "ستجد أول طلب هنا"} action={<Link className="ws-button" href={filtered ? path : storefrontPath(activeStore.slug)}>
            {filtered ? (en ? "View all orders" : "عرض كل الطلبات") : en ? "View storefront" : "زيارة المتجر"}</Link>}>
          {filtered ? (en ? "Try another order number, name or phone." : "جرّب رقم طلب أو اسم عميل أو رقم هاتف آخر.") :
            en ? "When a customer checks out, you can prepare their shipment here." : "عندما يُتمّ عميل الشراء، يمكنك تجهيز طلبه للشحن من هنا."}</WorkspaceEmpty>}
      <DirectoryPager path={path} page={page} q={q} status={status} lang={lang} order={order} count={count} />
    </section>
    {inspect && <DirectoryDrawer key={storeId + inspect} listHref={directoryHref(path, linkFilters)} recordId={inspect}
      title={<>{en ? "Order" : "طلب"} <bdi dir="ltr">#{inspect.slice(0, 8)}</bdi></>} subtitle={<bdi dir="ltr">{inspect}</bdi>}>
      <OrderRecord id={inspect} drawer />
    </DirectoryDrawer>}
  </div>;
}

export default function Page(props: PageProps<"/admin/orders">) {
  return <Suspense fallback={<RouteSkeleton layout="list" />}><OrdersPage {...props} /></Suspense>;
}
