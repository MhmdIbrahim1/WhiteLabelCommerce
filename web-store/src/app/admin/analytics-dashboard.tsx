"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Wallet,
  TrendingUp,
  Truck,
  BarChart3,
  AlertTriangle,
  Package,
  ArrowLeft,
  ArrowRight,
  Calendar,
} from "lucide-react";
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
  { key: "7d", label_ar: "آخر 7 أيام", label_en: "Last 7 Days" },
  { key: "30d", label_ar: "آخر 30 يوم", label_en: "Last 30 Days" },
  { key: "month", label_ar: "هذا الشهر", label_en: "This Month" },
  { key: "all", label_ar: "الكل", label_en: "All Time" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#6366f1",
  shipped: "#0ea5e9",
  delivered: "#10b981",
  cancelled: "#ef4444",
};

function Sparkline({
  values,
  color,
}: {
  values: number[];
  color: string;
}) {
  const pts = values.length >= 2 ? values : [0, values[0] ?? 0];
  const max = Math.max(...pts, 1);
  const w = 110;
  const h = 30;
  const coords = pts
    .map((v, i) => {
      const x = (i / Math.max(pts.length - 1, 1)) * w;
      const y = h - 3 - (v / max) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="kpi-sparkline"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}

export function AnalyticsDashboard({
  metrics,
  range,
  currency,
  openTickets,
}: {
  metrics: AnalyticsDashboardMetrics;
  range: DateRangeKey;
  currency: string;
  openTickets: number;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const grossRevenue = metrics.grossRevenue;
  const netProfit = metrics.netProfit;
  const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
  const pendingCodValue = metrics.pendingCodValue;
  const pendingCodCount = metrics.pendingCodCount;
  const aov = metrics.averageOrderValue;
  const deliveryRate = metrics.deliveryRate;
  const revenueTrend = metrics.revenueTrend;
  const series = metrics.series;
  const statusBreakdown = metrics.statusBreakdown.map((item) => ({
    ...item,
    label: orderStatusLabel(item.key, lang),
    pct: metrics.orderCount > 0 ? (item.count / metrics.orderCount) * 100 : 0,
    color: STATUS_COLORS[item.key] ?? "#64748b",
  }));
  const topProducts = metrics.topProducts.map((product) => ({
    ...product,
    name: localizedText(lang, product.name, product.name_en),
    imageUrl: product.image_url,
  }));
  const lowStock = metrics.lowStock;

  // SVG Area/Line chart geometry
  const chartW = 640;
  const chartH = 220;
  const padX = 24;
  const padY = 20;
  const maxY = Math.max(
    ...series.map((s) => Math.max(s.revenue, s.profit)),
    100,
  );
  const stepX =
    series.length > 1 ? (chartW - padX * 2) / (series.length - 1) : 0;

  const toPoint = (val: number, idx: number) => {
    const x =
      series.length > 1 ? padX + idx * stepX : chartW / 2;
    const y =
      chartH - padY - (Math.max(val, 0) / maxY) * (chartH - padY * 2);
    return { x, y };
  };

  const revPts = series.map((s, i) => toPoint(s.revenue, i));
  const profPts = series.map((s, i) => toPoint(s.profit, i));

  const revLine = revPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const profLine = profPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const revArea =
    revPts.length > 0
      ? `${revPts[0].x.toFixed(1)},${chartH - padY} ${revLine} ${revPts[revPts.length - 1].x.toFixed(1)},${chartH - padY}`
      : "";

  // Donut geometry
  const donutR = 54;
  const donutC = 2 * Math.PI * donutR;
  const donutSegments = statusBreakdown.reduce<
    { key: string; color: string; dash: number; offset: number }[]
  >((acc, st) => {
    const dash = (st.pct / 100) * donutC;
    const prevSum = acc.reduce((s, seg) => s + seg.dash, 0);
    acc.push({ key: st.key, color: st.color, dash, offset: -prevSum });
    return acc;
  }, []);

  const topMaxRev = Math.max(...topProducts.map((p) => p.revenue), 1);
  const activePoint =
    hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : null;

  return (
    <div className="exec-dashboard">
      {/* Header + Quick Date Range Filter */}
      <div className="exec-header">
        <div>
          <h1>{isEn ? "Executive Profit & Sales Analytics" : "لوحة الأداء والأرباح"}</h1>
          <p>
            {isEn
              ? `Real-time revenue, net profit, COD collections, and inventory alerts · ${openTickets} open support tickets`
              : `متابعة فورية للإيرادات، صافي الربح، مبالغ التحصيل، وحالة المخزون · ${openTickets} تذاكر دعم مفتوحة`}
          </p>
        </div>
        <div
          className="exec-range-bar"
          role="tablist"
          aria-label={isEn ? "Date Range" : "الفترة الزمنية"}
        >
          <Calendar size={15} />
          {RANGE_OPTIONS.map((opt) => (
            <Link
              key={opt.key}
              href={opt.key === "30d" ? "/admin" : `/admin?range=${opt.key}`}
              role="tab"
              aria-selected={range === opt.key}
              className={`exec-range-btn ${range === opt.key ? "is-active" : ""}`}
            >
              {isEn ? opt.label_en : opt.label_ar}
            </Link>
          ))}
        </div>
      </div>

      {/* 4 Hero KPI Cards with Sparklines & Badges */}
      <div className="exec-kpi-grid">
        <article className="card exec-kpi">
          <div className="exec-kpi-top">
            <span className="metric-icon">
              <Wallet size={20} />
            </span>
            <span
              className={`kpi-trend ${revenueTrend >= 0 ? "is-up" : "is-down"}`}
            >
              {revenueTrend >= 0 ? "+" : ""}
              {revenueTrend}%
            </span>
          </div>
          <p>
            {isEn
              ? "Gross Sales (Delivered, Before Refunds)"
              : "إجمالي المبيعات (قبل المرتجعات)"}
          </p>
          <strong>{money(grossRevenue, currency, lang)}</strong>
          <Sparkline
            values={series.map((s) => s.revenue)}
            color="#164E63"
          />
        </article>

        <article className="card exec-kpi">
          <div className="exec-kpi-top">
            <span
              className="metric-icon"
              style={{ background: "#dcfce7", color: "#15803d" }}
            >
              <TrendingUp size={20} />
            </span>
            <span className="kpi-trend is-up">
              {isEn ? `Margin ${profitMargin.toFixed(1)}%` : `هامش ${profitMargin.toFixed(1)}%`}
            </span>
          </div>
          <p>{isEn ? "Real Net Profit" : "صافي الربح الفعلي"}</p>
          <strong>{money(netProfit, currency, lang)}</strong>
          <Sparkline
            values={series.map((s) => Math.max(s.profit, 0))}
            color="#10b981"
          />
        </article>

        <article className="card exec-kpi">
          <div className="exec-kpi-top">
            <span
              className="metric-icon"
              style={{ background: "#e0f2fe", color: "#0369a1" }}
            >
              <Truck size={20} />
            </span>
            <span className="kpi-trend is-neutral">
              {pendingCodCount} {isEn ? "shipments" : "شحنة"}
            </span>
          </div>
          <p>{isEn ? "Pending COD Collections" : "مبالغ قيد التحصيل (COD)"}</p>
          <strong>{money(pendingCodValue, currency, lang)}</strong>
          <Sparkline
            values={series.map((s) => s.count)}
            color="#0ea5e9"
          />
        </article>

        <article className="card exec-kpi">
          <div className="exec-kpi-top">
            <span
              className="metric-icon"
              style={{ background: "#ede9fe", color: "#6d28d9" }}
            >
              <BarChart3 size={20} />
            </span>
            <span className="kpi-trend is-up">
              {isEn ? `Delivery ${deliveryRate}%` : `تسليم ${deliveryRate}%`}
            </span>
          </div>
          <p>{isEn ? "Average Order Value (AOV)" : "متوسط قيمة الطلب (AOV)"}</p>
          <strong>{money(aov, currency, lang)}</strong>
          <small>
            {isEn
              ? `Orders in period: ${metrics.orderCount}`
              : `إجمالي طلبات الفترة: ${metrics.orderCount}`}
          </small>
        </article>
      </div>

      {/* Main Charts Row: Revenue vs Net Profit + Order Status Donut */}
      <div className="exec-charts-grid">
        <section className="card exec-chart-card">
          <div className="row" style={{ marginBottom: "0.75rem" }}>
            <div>
              <h2>
                {isEn ? "Revenue vs. Net Profit" : "الإيرادات مقابل صافي الربح"}
              </h2>
              <small>
                {isEn
                  ? "Hover over any day to inspect daily breakdown"
                  : "مرّر المؤشر فوق أي يوم لعرض التفاصيل"}
              </small>
            </div>
            <div className="chart-legend">
              <span>
                <i style={{ background: "#164E63" }} />{" "}
                {isEn ? "Revenue" : "الإيرادات"}
              </span>
              <span>
                <i style={{ background: "#10b981" }} />{" "}
                {isEn ? "Net Profit" : "صافي الربح"}
              </span>
            </div>
          </div>

          {activePoint && (
            <div className="chart-tooltip-bar">
              <strong>
                {isEn ? `Date ${activePoint.label}` : `تاريخ ${activePoint.label}`}
              </strong>
              <span>
                {isEn ? "Revenue:" : "الإيرادات:"}{" "}
                {money(activePoint.revenue, currency, lang)}
              </span>
              <span>
                {isEn ? "Net Profit:" : "صافي الربح:"}{" "}
                {money(activePoint.profit, currency, lang)}
              </span>
              <span>
                {isEn ? "Orders:" : "الطلبات:"} {activePoint.count}
              </span>
            </div>
          )}

          <div className="svg-chart-wrap">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="revenue-svg"
              role="img"
              aria-label="مخطط الإيرادات وصافي الربح"
            >
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#164E63" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#164E63" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75, 1].map((g) => {
                const y = chartH - padY - g * (chartH - padY * 2);
                return (
                  <line
                    key={g}
                    x1={padX}
                    x2={chartW - padX}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="4 4"
                  />
                );
              })}
              {revArea && <polygon fill="url(#revGrad)" points={revArea} />}
              {revLine && (
                <polyline
                  fill="none"
                  stroke="#164E63"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={revLine}
                />
              )}
              {profLine && (
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={profLine}
                />
              )}
              {revPts.map((p, idx) => (
                <g
                  key={idx}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hoverIdx === idx ? 6 : 3.5}
                    fill="#164E63"
                  />
                  <circle
                    cx={profPts[idx].x}
                    cy={profPts[idx].y}
                    r={hoverIdx === idx ? 5.5 : 3}
                    fill="#10b981"
                  />
                  <text
                    x={p.x}
                    y={chartH - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#64748b"
                  >
                    {series[idx]?.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </section>

        <section className="card exec-donut-card">
          <h2>{isEn ? "Order Status Breakdown" : "توزيع حالات الطلبات"}</h2>
          <div className="donut-layout">
            <svg
              viewBox="0 0 140 140"
              width="148"
              height="148"
              className="status-donut"
              role="img"
              aria-label={isEn ? "Order Status Breakdown" : "توزيع حالات الطلبات"}
            >
              <circle
                cx="70"
                cy="70"
                r={donutR}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="16"
              />
              {metrics.orderCount > 0 &&
                donutSegments.map((seg) => (
                  <circle
                    key={seg.key}
                    cx="70"
                    cy="70"
                    r={donutR}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="16"
                    strokeDasharray={`${seg.dash} ${donutC}`}
                    strokeDashoffset={seg.offset}
                    transform="rotate(-90 70 70)"
                  />
                ))}
              <text
                x="70"
                y="67"
                textAnchor="middle"
                fontSize="20"
                fontWeight="700"
                fill="currentColor"
              >
                {metrics.orderCount}
              </text>
              <text
                x="70"
                y="85"
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {isEn ? "orders" : "طلب"}
              </text>
            </svg>
            <ul className="donut-legend">
              {statusBreakdown.map((st) => (
                <li key={st.key}>
                  <span className="with-icon">
                    <i style={{ background: st.color }} />
                    {orderStatusLabel(st.key, lang)}
                  </span>
                  <strong>
                    {st.count} <small>({Math.round(st.pct)}%)</small>
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Bottom Insights Row: Top 5 Products + Low Stock Alerts */}
      <div className="exec-bottom-grid">
        <section className="card">
          <div className="row" style={{ marginBottom: "0.85rem" }}>
            <h2>
              {isEn
                ? "Top 5 Best-Selling & Profitable Products"
                : "أكثر 5 منتجات مبيعاً وربحية"}
            </h2>
            <Link href="/admin/products">
              {isEn ? "Products" : "المنتجات"} <ArrowIcon size={14} />
            </Link>
          </div>
          {topProducts.length === 0 ? (
            <p className="empty">
              {isEn ? "No sales in this period." : "لا توجد مبيعات في هذه الفترة."}
            </p>
          ) : (
            <div className="top-products-list">
              {topProducts.map((p) => (
                <div key={p.id} className="top-product-row">
                  <div className="top-product-head">
                    <span className="with-icon">
                      {p.imageUrl ? (
                        <Image
                          src={p.imageUrl}
                          alt={p.name}
                          width={38}
                          height={38}
                          unoptimized
                          className="thumb"
                        />
                      ) : (
                        <span className="top-prod-fallback">
                          <Package size={18} />
                        </span>
                      )}
                      <div>
                        <strong>{p.name}</strong>
                        <small style={{ display: "block" }}>
                          {p.units} {isEn ? "units sold" : "قطعة مباعة"}
                        </small>
                      </div>
                    </span>
                    <div style={{ textAlign: "end" }}>
                      <strong>{money(p.revenue, currency, lang)}</strong>
                      <small style={{ display: "block", color: "#15803d" }}>
                        {isEn ? "Profit:" : "ربح:"} {money(p.profit, currency, lang)}
                      </small>
                    </div>
                  </div>
                  <div className="top-product-bar">
                    <div
                      style={{
                        width: `${Math.max(8, (p.revenue / topMaxRev) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="row" style={{ marginBottom: "0.85rem" }}>
            <h2 className="with-icon">
              <AlertTriangle size={18} color="#d97706" />{" "}
              {isEn ? "Low Stock Alerts" : "تنبيهات انخفاض المخزون"}
            </h2>
            <Link href="/admin/products">
              {isEn ? "Restock" : "تزويد المخزون"} <ArrowIcon size={14} />
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="empty">
              {isEn
                ? "All products have healthy stock (> 5 units)."
                : "جميع المنتجات لديها مخزون آمن (أكثر من 5 قطع)."}
            </p>
          ) : (
            <div className="low-stock-list">
              {lowStock.map((p) => (
                <div key={p.id} className="low-stock-row">
                  <div>
                    <strong>{localizedText(lang, p.name, p.name_en)}</strong>
                    <small style={{ display: "block" }}>
                      {isEn ? "Price:" : "السعر:"} {money(p.price, currency, lang)}{" "}
                      · {isEn ? "Cost:" : "التكلفة:"}{" "}
                      {money(p.cost_price, currency, lang)}
                    </small>
                  </div>
                  <span
                    className={`badge ${p.stock === 0 ? "cancelled" : "pending"}`}
                  >
                    {p.stock === 0
                      ? isEn
                        ? "Out of stock"
                        : "نفد المخزون"
                      : isEn
                        ? `${p.stock} left`
                        : `متبقي ${p.stock}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
