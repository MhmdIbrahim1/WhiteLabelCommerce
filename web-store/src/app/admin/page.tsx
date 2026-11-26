import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import brand from "@/lib/brand";
import { photo } from "@/lib/shop";
import { getServerLang } from "@/lib/i18n-server";
import { OrderTable } from "./ui";
import { StoreLaunchChecklist } from "./launch-checklist";
import {
  AnalyticsDashboard,
  type AnalyticsOrder,
  type AnalyticsProduct,
} from "./analytics-dashboard";

type RawAnalyticsOrder = {
  id: string;
  status: string;
  subtotal: number | null;
  shipping_fee: number | null;
  discount_amount: number | null;
  total: number | null;
  currency: string;
  created_at: string;
  order_items: {
    id: string;
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    unit_cost: number | null;
  }[];
};

type RawAnalyticsReturn = {
  order_id: string;
  status: string;
  refund_amount: number | null;
  restocked: boolean | null;
  items: unknown;
};

type RawAnalyticsProduct = {
  id: string;
  name: string;
  name_en?: string | null;
  price: number;
  cost_price: number | null;
  stock: number;
  image_path: string | null;
  is_active: boolean;
};

export default async function Overview() {
  const { db, storeId, activeStore } = await requireAdmin();
  const secureDb = adminDb();
  const [
    settingsRes,
    ordersRes,
    productsRes,
    ticketsRes,
    couponsRes,
    returnsRes,
  ] =
    await Promise.all([
      db
        .from("store_settings")
        .select("currency,store_name")
        .eq("store_id", storeId)
        .single<{ currency: string; store_name: string }>(),
      secureDb
        .from("orders")
        .select(
          "id,status,subtotal,shipping_fee,discount_amount,total,currency,created_at,order_items(id,product_id,product_name,quantity,unit_price,unit_cost)",
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(1000),
      secureDb
        .from("products")
        .select("id,name,name_en,price,cost_price,stock,image_path,is_active")
        .eq("store_id", storeId)
        .order("name")
        .limit(500),
      db
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "open"),
      db
        .from("coupons")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId),
      secureDb
        .from("return_requests")
        .select("order_id,status,refund_amount,restocked,items")
        .eq("store_id", storeId)
        .in("status", ["refunded", "completed"])
        .limit(1000),
    ]);

  if (
    ordersRes.error ||
    productsRes.error ||
    ticketsRes.error ||
    returnsRes.error
  ) {
    throw new Error("تعذر تحميل الإحصاءات.");
  }

  const currency = settingsRes.data?.currency || brand.currency;
  const rawOrders = (checked(ordersRes) as RawAnalyticsOrder[]) ?? [];
  const rawProducts = (checked(productsRes) as RawAnalyticsProduct[]) ?? [];
  const rawReturns = (checked(returnsRes) as RawAnalyticsReturn[]) ?? [];
  const returnsByOrder = new Map<string, RawAnalyticsReturn[]>();
  for (const row of rawReturns) {
    const current = returnsByOrder.get(row.order_id) ?? [];
    current.push(row);
    returnsByOrder.set(row.order_id, current);
  }

  const analyticsOrders: AnalyticsOrder[] = rawOrders.map((o) => ({
    id: o.id,
    status: o.status,
    subtotal: Number(o.subtotal ?? 0),
    shipping_fee: Number(o.shipping_fee ?? 0),
    discount_amount: Number(o.discount_amount ?? 0),
    total: Number(o.total ?? 0),
    currency: o.currency,
    created_at: o.created_at,
    items: (o.order_items ?? []).map((it) => ({
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      unit_cost: Number(it.unit_cost ?? 0),
    })),
    returns: (returnsByOrder.get(o.id) ?? []).map((ret) => ({
      status: ret.status,
      refund_amount: Number(ret.refund_amount ?? 0),
      restocked: Boolean(ret.restocked),
      items: Array.isArray(ret.items)
        ? ret.items
            .filter(
              (item): item is Record<string, unknown> =>
                Boolean(item) && typeof item === "object",
            )
            .map((item) => ({
              order_item_id:
                typeof item.order_item_id === "string"
                  ? item.order_item_id
                  : null,
              product_id:
                typeof item.product_id === "string" ? item.product_id : null,
              quantity: Math.max(0, Number(item.quantity ?? 0)),
            }))
        : [],
    })),
  }));

  const analyticsProducts: AnalyticsProduct[] = rawProducts.map((p) => ({
    id: p.id,
    name: p.name,
    name_en: p.name_en ?? "",
    price: Number(p.price),
    cost_price: Number(p.cost_price ?? 0),
    stock: Number(p.stock),
    image_url: photo(p.image_path),
    is_active: p.is_active,
  }));

  const lang = await getServerLang();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;

  return (
    <>
      <StoreLaunchChecklist
        storeId={storeId}
        storeSlug={activeStore.slug}
        storeNameAr={settingsRes.data?.store_name || activeStore.name_ar}
        storeNameEn={activeStore.name_en || activeStore.name_ar}
        productsCount={rawProducts.length}
        couponsCount={couponsRes.count ?? 0}
      />
      <AnalyticsDashboard
        orders={analyticsOrders}
        products={analyticsProducts}
        currency={currency}
        openTickets={ticketsRes.count ?? 0}
        referenceNowIso={new Date().toISOString()}
      />
      <section className="card">
        <div className="row">
          <h2>{isEn ? "Recent Orders" : "أحدث الطلبات"}</h2>
          <Link href="/admin/orders">
            {isEn ? "All Orders" : "كل الطلبات"} <ArrowIcon size={15} />
          </Link>
        </div>
        <OrderTable
          rows={rawOrders.slice(0, 8).map((o) => ({
            id: o.id,
            status: o.status,
            created_at: o.created_at,
            total: o.total,
            currency: o.currency,
          }))}
        />
      </section>
    </>
  );
}
