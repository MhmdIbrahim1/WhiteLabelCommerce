import { canSeeOverview, permissionKeys, permissionNames, type Permission, type Permissions } from "@/lib/team";
import { Suspense } from "react";
import { RouteSkeleton } from "@/components/route-skeleton";
import Link from "next/link";
import { ArrowRight, Boxes, ClipboardList, Users, Settings, Globe, CreditCard, UsersRound, Smartphone } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { checked, requireAdmin } from "@/lib/db";
import brand from "@/lib/brand";
import { photo } from "@/lib/shop";
import { getServerLang } from "@/lib/i18n-server";
import { merchantStorefrontUrl } from "@/lib/tenant";
import { OrderTable } from "./ui";
import { StoreLaunchChecklist } from "./launch-checklist";
import {
  AnalyticsDashboard,
  type AnalyticsDashboardMetrics,
  type DateRangeKey,
} from "./analytics-dashboard";

type RecentOrder = {
  id: string;
  status: string;
  total: number | null;
  currency: string;
  created_at: string;
};

type DashboardRpcResult = {
  product_count?: number | string;
  order_count?: number | string;
  gross_revenue?: number | string;
  net_profit?: number | string;
  pending_cod_value?: number | string;
  pending_cod_count?: number | string;
  average_order_value?: number | string;
  delivery_rate?: number | string;
  revenue_trend?: number | string;
  series?: {
    label?: string;
    revenue?: number | string;
    profit?: number | string;
    count?: number | string;
  }[];
  status_breakdown?: { key?: string; count?: number | string }[];
  top_products?: {
    id?: string;
    name?: string;
    name_en?: string | null;
    image_path?: string | null;
    units?: number | string;
    revenue?: number | string;
    profit?: number | string;
  }[];
  low_stock?: {
    id?: string;
    name?: string;
    name_en?: string | null;
    price?: number | string;
    cost_price?: number | string;
    stock?: number | string;
    image_path?: string | null;
    is_active?: boolean;
  }[];
};

const VALID_RANGES: DateRangeKey[] = ["today", "7d", "30d", "month", "all"];
const DAY_MS = 86_400_000;

function dashboardWindow(range: DateRangeKey, now: Date) {
  const end = new Date(now.getTime() + 1_000);
  let start: Date;
  let previousStart: Date;
  let previousEnd: Date;

  if (range === "today") {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    previousStart = new Date(start.getTime() - DAY_MS);
    previousEnd = start;
  } else if (range === "7d" || range === "30d") {
    const duration = range === "7d" ? 7 * DAY_MS : 30 * DAY_MS;
    start = new Date(now.getTime() - duration);
    previousStart = new Date(start.getTime() - duration);
    previousEnd = start;
  } else if (range === "month") {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    previousEnd = start;
  } else {
    start = new Date("2000-01-01T00:00:00.000Z");
    previousStart = start;
    previousEnd = start;
  }

  return { start, end, previousStart, previousEnd };
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMetrics(raw: DashboardRpcResult): AnalyticsDashboardMetrics {
  return {
    orderCount: toNumber(raw.order_count),
    grossRevenue: toNumber(raw.gross_revenue),
    netProfit: toNumber(raw.net_profit),
    pendingCodValue: toNumber(raw.pending_cod_value),
    pendingCodCount: toNumber(raw.pending_cod_count),
    averageOrderValue: toNumber(raw.average_order_value),
    deliveryRate: toNumber(raw.delivery_rate),
    revenueTrend: toNumber(raw.revenue_trend),
    series: (raw.series ?? []).map((row) => ({
      label: String(row.label ?? ""),
      revenue: toNumber(row.revenue),
      profit: toNumber(row.profit),
      count: toNumber(row.count),
    })),
    statusBreakdown: (raw.status_breakdown ?? []).map((row) => ({
      key: String(row.key ?? ""),
      count: toNumber(row.count),
    })),
    topProducts: (raw.top_products ?? []).map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      name_en: row.name_en ?? null,
      units: toNumber(row.units),
      revenue: toNumber(row.revenue),
      profit: toNumber(row.profit),
      image_url: photo(row.image_path ?? null),
    })),
    lowStock: (raw.low_stock ?? []).map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      name_en: row.name_en ?? null,
      price: toNumber(row.price),
      cost_price: toNumber(row.cost_price),
      stock: toNumber(row.stock),
      image_url: photo(row.image_path ?? null),
      is_active: Boolean(row.is_active),
    })),
  };
}

const destinations = {
  manage_products: ["products", Boxes], manage_orders: ["orders", ClipboardList], manage_customers: ["customers", Users],
  manage_settings: ["settings", Settings], manage_domains: ["settings/domains", Globe], manage_billing: ["billing", CreditCard],
  manage_staff: ["team", UsersRound], manage_mobile_app: ["mobile-app", Smartphone],
} as const;

function QuickActions({ permissions, lang, keys = permissionKeys }: { permissions: Permissions; lang: Lang; keys?: Permission[] }) {
  const en = lang === "en";
  const allowed = keys.filter(key => permissions[key]);
  return <section className="ws-panel ws-quick"><h2>{en ? "Quick actions" : "اختصارات العمل"}</h2>
    {allowed.length ? allowed.map(key => {
      const [path, Icon] = destinations[key];
      return <Link href={"/admin/" + path} key={key}><span className="ws-shop-icon"><Icon size={17}/></span>
        {permissionNames[key][lang]}<ArrowRight className="pt-directional" size={15}/></Link>;
    }) : <p>{en ? "Ask the store owner to assign your first workspace permission." : "اطلب من مالك المتجر تحديد الصلاحيات التي تحتاج إليها للبدء."}</p>}
  </section>;
}

async function Overview({
  searchParams,
}: PageProps<"/admin">) {
  const params = await searchParams;
  const rangeParam = typeof params.range === "string" ? params.range : "30d";
  const range: DateRangeKey = VALID_RANGES.includes(rangeParam as DateRangeKey)
    ? (rangeParam as DateRangeKey)
    : "30d";
  const now = new Date();
  const dateWindow = dashboardWindow(range, now);
  const { db, storeId, activeStore, permissions } = await requireAdmin();
  if (!canSeeOverview(permissions)) {
    const lang = await getServerLang();
    return <div className="ws-dashboard"><header className="ws-dash-head"><div><h1>{lang === "en" ? "Your workspace" : "مساحة عملك"}</h1>
      <p dir="auto">{lang === "en" ? activeStore.name_en || activeStore.name_ar : activeStore.name_ar}</p></div></header>
      <QuickActions permissions={permissions} lang={lang} /></div>;
  }

  const [
    settingsRes,
    metricsRes,
    recentOrdersRes,
    ticketsRes,
    couponsRes,
    lang,
    liveUrl,
  ] = await Promise.all([
    db
      .from("store_settings")
      .select("currency,store_name")
      .eq("store_id", storeId)
      .single<{ currency: string; store_name: string }>(),
    db.rpc("admin_dashboard_metrics", {
      p_store_id: storeId,
      p_start_at: dateWindow.start.toISOString(),
      p_end_at: dateWindow.end.toISOString(),
      p_previous_start_at: dateWindow.previousStart.toISOString(),
      p_previous_end_at: dateWindow.previousEnd.toISOString(),
    }),
    db
      .from("orders")
      .select("id,status,total,currency,created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("status", "open"),
    db
      .from("coupons")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    getServerLang(),
    merchantStorefrontUrl(activeStore.slug),
  ]);

  if (
    settingsRes.error ||
    metricsRes.error ||
    recentOrdersRes.error ||
    ticketsRes.error
  ) {
    throw new Error("Could not load store analytics.");
  }

  const currency = settingsRes.data?.currency || brand.currency;
  const rawMetrics = (checked(metricsRes) ?? {}) as DashboardRpcResult;
  const metrics = normalizeMetrics(rawMetrics);
  const recentOrders = (checked(recentOrdersRes) ?? []) as RecentOrder[];
  const isEn = lang === "en";
  return <AnalyticsDashboard metrics={metrics} range={range} currency={currency} openTickets={ticketsRes.count ?? 0}>
    <div className="ws-overview-grid"><section className="ws-panel"><div className="ws-panel-head"><h2>{isEn ? "Recent orders" : "أحدث الطلبات"}</h2>
      <Link href="/admin/orders">{isEn ? "View all" : "عرض الكل"} <ArrowRight size={14} className="pt-directional" /></Link></div>
      <OrderTable rows={recentOrders} /></section>
      <QuickActions lang={lang} permissions={permissions} keys={["manage_products","manage_orders","manage_settings"]} />
    </div>
    <StoreLaunchChecklist storeId={storeId} storefrontUrl={liveUrl} storeSlug={activeStore.slug}
      storeNameAr={settingsRes.data?.store_name || activeStore.name_ar} storeNameEn={activeStore.name_en || activeStore.name_ar}
      productsCount={toNumber(rawMetrics.product_count)} couponsCount={couponsRes.count ?? 0} />
  </AnalyticsDashboard>;
}

export default function Page(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<RouteSkeleton layout="dashboard" />}>
      <Overview {...props} />
    </Suspense>
  );
}
