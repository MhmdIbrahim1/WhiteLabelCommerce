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
import { orders, pagination } from "@/lib/workflow";
import { directoryHref, isRecordId, orderIdBounds, searchText } from "@/lib/workspace-directory";
import { searchPattern } from "@/lib/shop";
import { storefrontPath } from "@/lib/tenant-shared";
import { Notice } from "../ui";
import { OrderRecord } from "./order-record";

const path = "/admin/orders";
async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const [params, lang, { db, storeId, activeStore }] = await Promise.all([searchParams, getServerLang(), requireAdmin("manage_orders")]);
  const en = lang === "en";
  const { page, from, to } = pagination(params.page);
  const q = searchText(params.q);
  const status = typeof params.status === "string" && Object.hasOwn(orders, params.status) ? params.status : "";
  const inspect = isRecordId(params.inspect) ? params.inspect : null;
  let query = db.from("orders")
    .select("id,created_at,status,currency,total,recipient_name,user_id,phone,order_items(quantity)", { count: "exact" }).eq("store_id", storeId);
  if (status) query = query.eq("status", status);
  if (q) {
    const pattern = JSON.stringify(searchPattern(q));
    const conditions = ["recipient_name", "phone"].map(field => field + ".ilike." + pattern);
    const bounds = orderIdBounds(q);
    if (bounds) conditions.push(`and(id.gte.${bounds.first},id.lte.${bounds.last})`);
    query = query.or(conditions.join(","));
  }
  const result = await query.order("created_at", { ascending: false }).order("id").range(from, to);
  const rows = checked(result);
  const cols = en ? ["Order", "Customer", "Total", "Status", "Inspect"] : ["الطلب", "العميل", "الإجمالي", "الحالة", "معاينة"];
  const filtered = Boolean(q || status || page > 1);
  return <div className="ws-page">
    <WorkspaceHeading title={en ? "Orders" : "الطلبات"} description={en ? "Review purchases, prepare shipments and track delivery." : "راجع المشتريات وجهّز الشحنات وتابع وصولها إلى عملائك."} />
    <Notice result={params.result} />
    <section className="ws-sheet ws-order-sheet">
      <DirectoryFilters path={path} query={q} status={status} lang={lang} choices={Object.keys(orders).map(s => [s, orderStatusLabel(s, lang)])}
        placeholder={en ? "Order number, customer name or phone" : "رقم الطلب أو اسم العميل أو هاتفه"} />
      {rows.length ? <WorkspaceTable columns={cols} caption={en ? "Store orders" : "طلبات المتجر"}>
        {rows.map(o => {
          const href = directoryHref(path, { q, status, page, inspect: o.id });
          const qty = o.order_items.reduce((sum, i) => sum + i.quantity, 0);
          return <InspectRow key={o.id} href={href}>
            <DataCell><div className="ws-cell-stack"><Link id={"inspect-" + o.id} href={href} replace prefetch={false} scroll={false} aria-haspopup="dialog">
              <bdi dir="ltr">#{o.id.slice(0, 8)}</bdi></Link><small><bdi dir="ltr">{date(o.created_at, lang)}</bdi> · <bdi dir="ltr">{qty}</bdi> {en ? (qty === 1 ? "item" : "items") : "قطعة"}</small></div></DataCell>
            <DataCell label={cols[1]}><div className="ws-cell-stack"><strong dir="auto">{o.recipient_name || (o.user_id ? (en ? "Registered customer" : "عميل مسجّل") : (en ? "Guest customer" : "عميل زائر"))}</strong>
              {o.phone && <small><bdi dir="ltr">{o.phone}</bdi></small>}</div></DataCell>
            <DataCell label={cols[2]}><strong><bdi dir="ltr">{money(o.total, o.currency, lang)}</bdi></strong></DataCell>
            <DataCell label={cols[3]}><StatusDot status={o.status}>{orderStatusLabel(o.status, lang)}</StatusDot></DataCell>
            <DataCell><Link href={href} replace prefetch={false} scroll={false} className="ws-icon-button" aria-haspopup="dialog" aria-label={cols[4] + " #" + o.id.slice(0, 8)}>
              <ArrowRight className="pt-directional" size={16} /></Link></DataCell>
          </InspectRow>;
        })}</WorkspaceTable> : <WorkspaceEmpty title={filtered ? (en ? "No orders match this view" : "لا توجد طلبات مطابقة") :
          en ? "Your first order will appear here" : "ستجد أول طلب هنا"} action={<Link className="ws-button" href={filtered ? path : storefrontPath(activeStore.slug)}>
            {filtered ? (en ? "View all orders" : "عرض كل الطلبات") : en ? "View storefront" : "زيارة المتجر"}</Link>}>
          {filtered ? (en ? "Try another order number, name or phone." : "جرّب رقم طلب أو اسم عميل أو رقم هاتف آخر.") :
            en ? "When a customer checks out, you can prepare their shipment here." : "عندما يُتمّ عميل الشراء، يمكنك تجهيز طلبه للشحن من هنا."}</WorkspaceEmpty>}
      <DirectoryPager path={path} page={page} q={q} status={status} lang={lang} count={result.count ?? 0} />
    </section>
    {inspect && <DirectoryDrawer key={storeId + inspect} listHref={directoryHref(path, { q, status, page })} recordId={inspect}
      title={<>{en ? "Order" : "طلب"} <bdi dir="ltr">#{inspect.slice(0, 8)}</bdi></>} subtitle={<bdi dir="ltr">{inspect}</bdi>}>
      <OrderRecord id={inspect} drawer />
    </DirectoryDrawer>}
  </div>;
}

export default function Page(props: PageProps<"/admin/orders">) {
  return <Suspense fallback={<RouteSkeleton layout="list" />}><OrdersPage {...props} /></Suspense>;
}
