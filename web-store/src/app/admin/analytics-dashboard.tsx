"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronDown, Package } from "lucide-react";
import { money } from "@/lib/brand";
import { localizedText, orderStatusLabel } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";

export type AnalyticsOrder = {
  id: string;
  status: string;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  total: number;
  currency: string;
  created_at: string;
  items: {
    id: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    unit_cost: number;
  }[];
  returns: {
    status: string;
    refund_amount: number;
    restocked: boolean;
    items: {
      order_item_id: string | null;
      product_id: string | null;
      quantity: number;
    }[];
  }[];
};

export type AnalyticsProduct = {
  id: string;
  name: string;
  name_en?: string | null;
  price: number;
  cost_price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
};

export type AnalyticsDashboardMetrics = {
  orderCount: number;
  grossRevenue: number;
  netProfit: number;
  pendingCodValue: number;
  pendingCodCount: number;
  averageOrderValue: number;
  deliveryRate: number;
  revenueTrend: number;
  series: { label: string; revenue: number; profit: number; count: number }[];
  statusBreakdown: { key: string; count: number }[];
  topProducts: {
    id: string;
    name: string;
    name_en?: string | null;
    units: number;
    revenue: number;
    profit: number;
    image_url: string | null;
  }[];
  lowStock: AnalyticsProduct[];
};

export function calculateRealNetProfit(
  order: AnalyticsOrder,
  productMap: ReadonlyMap<string, AnalyticsProduct>,
): number {
  const itemCost = (item: AnalyticsOrder["items"][number]) => {
    const fallbackCost = item.product_id
      ? (productMap.get(item.product_id)?.cost_price ?? 0)
      : 0;
    return item.unit_cost > 0 ? item.unit_cost : fallbackCost;
  };

  const baseProfit =
    order.items.reduce(
      (sum, item) =>
        sum + (item.unit_price - itemCost(item)) * item.quantity,
      0,
    ) - order.discount_amount;

  const completedReturns = order.returns.filter(
    (ret) => ret.status === "refunded" || ret.status === "completed",
  );
  if (completedReturns.length === 0) return baseProfit;

  const returnedQuantities = new Map<string, number>();
  let refundedRevenue = 0;
  let reversedCogs = 0;

  for (const ret of completedReturns) {
    refundedRevenue += Math.max(0, ret.refund_amount);
    for (const returned of ret.items) {
      const ordered =
        order.items.find(
          (item) =>
            Boolean(returned.order_item_id) &&
            item.id === returned.order_item_id,
        ) ??
        order.items.find(
          (item) =>
            Boolean(returned.product_id) &&
            item.product_id === returned.product_id,
        );
      if (!ordered) continue;
      const quantity = Math.min(
        ordered.quantity,
        Math.max(0, returned.quantity),
      );
      returnedQuantities.set(
        ordered.id,
        (returnedQuantities.get(ordered.id) ?? 0) + quantity,
      );
      if (ret.restocked) reversedCogs += itemCost(ordered) * quantity;
    }
  }

  const merchandiseNet = Math.max(
    0,
    order.items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0,
    ) - order.discount_amount,
  );
  const fullyReturned =
    order.items.length > 0 &&
    order.items.every(
      (item) => (returnedQuantities.get(item.id) ?? 0) >= item.quantity,
    );
  const fullyRestocked = completedReturns.every((ret) => ret.restocked);

  if (
    fullyReturned &&
    fullyRestocked &&
    refundedRevenue >= merchandiseNet - 0.01
  ) {
    return 0;
  }

  return baseProfit - refundedRevenue + reversedCogs;
}

export type DateRangeKey = "today" | "7d" | "30d" | "month" | "all";

const RANGE_OPTIONS: { key: DateRangeKey; label_ar: string; label_en: string }[] = [
  { key: "today", label_ar: "اليوم", label_en: "Today" },
  { key: "7d", label_ar: "آخر 7 أيام", label_en: "Last 7 days" },
  { key: "30d", label_ar: "آخر 30 يوماً", label_en: "Last 30 days" },
  { key: "month", label_ar: "هذا الشهر", label_en: "This month" },
  { key: "all", label_ar: "الكل", label_en: "All time" },
];

function SalesReport({ metrics, currency }: { metrics: AnalyticsDashboardMetrics; currency: string }) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const [selected, setSelected] = useState<number | null>(null);
  const { series, statusBreakdown, orderCount } = metrics;
  const index = Math.min(selected ?? series.length - 1, series.length - 1);
  const point = series[index];
  const low = Math.min(0, ...series.map(s => s.profit));
  const high = Math.max(1, ...series.map(s => Math.max(s.revenue, s.profit)));
  const x = (i: number) => series.length > 1 ? 8 + i / (series.length - 1) * 584 : 300;
  const y = (v: number) => 134 - (v - low) / (high - low) * 124;
  const line = (field: "revenue" | "profit") => series.map((s,i) => x(i) + "," + y(s[field])).join(" ");
  const n = (v: number) => v.toLocaleString(en ? "en" : "ar-EG");
  return <div className="ws-report-grid">
    <section className="ws-panel"><h3>{en ? "Revenue and net profit" : "الإيرادات وصافي الربح"}</h3>
      {point ? <><svg className="ws-sales-chart" viewBox="0 0 600 144" role="img" aria-label={en ? "Revenue and net profit over time" : "تطور الإيرادات وصافي الربح"}
        onPointerMove={event => { const r = event.currentTarget.getBoundingClientRect();
          setSelected(Math.max(0, Math.min(series.length - 1, Math.round(((event.clientX - r.left) / r.width * 600 - 8) / 584 * (series.length - 1))))); }}>
        {[10,72,134].map(v => <path key={v} d={"M8 " + v + " H592"} stroke="var(--line)" strokeDasharray="3 4" />)}
        <polyline points={line("revenue")} fill="none" stroke="var(--ink)" strokeWidth="2.5" />
        <polyline points={line("profit")} fill="none" stroke="var(--ws-good)" strokeDasharray="5 3" strokeWidth="2" />
        <circle cx={x(index)} cy={y(point.revenue)} r="4" fill="var(--ink)" /><circle cx={x(index)} cy={y(point.profit)} r="3" fill="var(--ws-good)" />
      </svg>
      {series.length > 1 && <input type="range" dir="ltr" min={0} max={series.length - 1} value={index}
        aria-label={en ? "Inspect date" : "عرض بيانات التاريخ"} aria-valuetext={point.label} onChange={e => setSelected(Number(e.target.value))} />}
      <div className="ws-point"><bdi dir="ltr">{point.label}</bdi><span data-series="revenue">{en ? "Revenue" : "الإيرادات"} <bdi dir="ltr">{money(point.revenue, currency, lang)}</bdi></span>
        <span data-series="profit">{en ? "Profit" : "الربح"} <bdi dir="ltr">{money(point.profit, currency, lang)}</bdi></span>
        <span>{en ? "Orders" : "الطلبات"} <bdi dir="ltr">{n(point.count)}</bdi></span></div></> :
        <p>{en ? "Sales will appear here once orders are recorded." : "ستظهر المبيعات هنا عند تسجيل الطلبات."}</p>}
    </section>
    <section className="ws-panel"><h3>{en ? "Order status" : "حالات الطلبات"}</h3>
      <p>{en ? "Delivery rate" : "نسبة التسليم"} <bdi dir="ltr">{n(metrics.deliveryRate)}%</bdi></p>
      <ul className="ws-data-list">{statusBreakdown.map(s => <li key={s.key}><span className="ws-status" data-status={s.key}>{orderStatusLabel(s.key,lang)}</span>
        <bdi dir="ltr">{n(s.count)} · {n(orderCount ? Math.round(s.count * 100 / orderCount) : 0)}%</bdi></li>)}</ul>
    </section>
    <section className="ws-panel"><h3>{en ? "Top products" : "الأكثر مبيعاً"}</h3>
      {metrics.topProducts.length ? <ul className="ws-data-list">{metrics.topProducts.map(p => <li key={p.id}>
        <div className="ws-product-cell">{p.image_url ? <Image alt="" src={p.image_url} width={36} height={36} unoptimized /> : <Package size={18} />}
          <div><strong dir="auto">{localizedText(lang,p.name,p.name_en)}</strong><small><bdi dir="ltr">{n(p.units)}</bdi> {en ? "sold" : "قطعة مباعة"}</small></div></div>
        <div><bdi dir="ltr">{money(p.revenue,currency,lang)}</bdi><small>{en ? "Profit" : "الربح"} <bdi dir="ltr">{money(p.profit,currency,lang)}</bdi></small></div>
      </li>)}</ul> : <p>{en ? "No sales in this period." : "لا توجد مبيعات خلال هذه الفترة."}</p>}
      <Link href="/admin/products" className="ws-text-link">{en ? "View catalog" : "عرض الكتالوج"}</Link>
    </section>
    <section className="ws-panel"><h3>{en ? "Low stock" : "المخزون المنخفض"}</h3>
      {metrics.lowStock.length ? <ul className="ws-data-list">{metrics.lowStock.map(p => <li key={p.id}>
        <div><strong dir="auto">{localizedText(lang,p.name,p.name_en)}</strong><small>{en ? "Price" : "السعر"} <bdi dir="ltr">{money(p.price,currency,lang)}</bdi>
          {" · "}{en ? "Cost" : "التكلفة"} <bdi dir="ltr">{money(p.cost_price,currency,lang)}</bdi></small></div>
        <span>{p.stock ? <><bdi dir="ltr">{n(p.stock)}</bdi> {en ? "left" : "متبقية"}</> : en ? "Out of stock" : "نفد المخزون"}</span>
      </li>)}</ul> : <p>{en ? "No products need restocking." : "لا توجد منتجات تحتاج إلى إعادة تزويد."}</p>}
      <Link href="/admin/products" className="ws-text-link">{en ? "Manage stock" : "إدارة المخزون"}</Link>
    </section>
  </div>;
}

export function AnalyticsDashboard({ metrics, range, currency, openTickets, children }: {
  metrics: AnalyticsDashboardMetrics; range: DateRangeKey; currency: string; openTickets: number; children: ReactNode;
}) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const n = (value: number) => value.toLocaleString(en ? "en" : "ar-EG", { maximumFractionDigits: 1 });
  const margin = metrics.grossRevenue > 0 ? metrics.netProfit / metrics.grossRevenue * 100 : 0;
  return <div className="ws-dashboard">
    <header className="ws-dash-head"><div><h1>{en ? "Store overview" : "أداء المتجر"}</h1>
      <p>{en ? "Sales and orders for the selected period." : "مبيعات متجرك وطلباته خلال الفترة المحددة."}</p></div>
      <nav className="ws-range" aria-label={en ? "Reporting period" : "فترة التقرير"}>{RANGE_OPTIONS.map(o =>
        <Link key={o.key} href={o.key === "30d" ? "/admin" : "/admin?range=" + o.key} aria-current={o.key === range ? "true" : undefined}>{en ? o.label_en : o.label_ar}</Link>)}</nav>
    </header>
    <dl className="ws-kpis">
      <div className="ws-north-star"><dt>{en ? "Delivered sales" : "مبيعات الطلبات المسلّمة"}</dt><dd><bdi dir="ltr">{money(metrics.grossRevenue,currency,lang)}</bdi></dd>
        <dd className="ws-kpi-note">{range === "all" ? (en ? "Before refunds" : "قبل المرتجعات") : <>
          <bdi dir="ltr">{metrics.revenueTrend > 0 ? "+" : ""}{n(metrics.revenueTrend)}%</bdi> {en ? "vs. previous period" : "مقارنة بالفترة السابقة"}</>}</dd></div>
      <div><dt>{en ? "Net profit" : "صافي الربح"}</dt><dd><bdi dir="ltr">{money(metrics.netProfit,currency,lang)}</bdi></dd>
        <dd className="ws-kpi-note">{en ? "Margin" : "هامش الربح"} <bdi dir="ltr">{n(margin)}%</bdi></dd></div>
      <div><dt>{en ? "Orders" : "الطلبات"}</dt><dd><bdi dir="ltr">{n(metrics.orderCount)}</bdi></dd>
        <dd className="ws-kpi-note">{en ? "Average" : "متوسط الطلب"} <bdi dir="ltr">{money(metrics.averageOrderValue,currency,lang)}</bdi></dd></div>
      <div><dt>{en ? "Awaiting COD collection" : "بانتظار التحصيل"}</dt><dd><bdi dir="ltr">{money(metrics.pendingCodValue,currency,lang)}</bdi></dd>
        <dd className="ws-kpi-note"><bdi dir="ltr">{n(metrics.pendingCodCount)}</bdi> {en ? "shipments" : "شحنة"}</dd></div>
    </dl>
    {children}
    <details className="ws-report"><summary>{en ? "Sales and inventory details" : "تفاصيل المبيعات والمخزون"}<ChevronDown size={17} /></summary>
      <SalesReport key={range} metrics={metrics} currency={currency} /></details>
    <Link className="ws-ticket-link" href="/admin/tickets">{en ? "Open support tickets" : "تذاكر الدعم المفتوحة"} <bdi dir="ltr">{n(openTickets)}</bdi><ArrowRight size={15} className="pt-directional" /></Link>
  </div>;
}
