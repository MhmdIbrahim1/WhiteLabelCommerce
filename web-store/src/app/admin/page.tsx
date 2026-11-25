import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import brand from "@/lib/brand";
import { photo } from "@/lib/shop";
import { getServerLang } from "@/lib/i18n-server";
import { OrderTable } from "./ui";
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
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    unit_cost: number | null;
  }[];
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
  const { db, storeId } = await requireAdmin();
  const [settingsRes, ordersRes, productsRes, ticketsRes] = await Promise.all([
    db
      .from("store_settings")
      .select("currency")
      .eq("store_id", storeId)
      .single<{ currency: string }>(),
    db
      .from("orders")
      .select(
        "id,status,subtotal,shipping_fee,discount_amount,total,currency,created_at,order_items(product_id,product_name,quantity,unit_price,unit_cost)",
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1000),
    db
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
  ]);

  if (ordersRes.error || productsRes.error || ticketsRes.error) {
    throw new Error("تعذر تحميل الإحصاءات.");
  }

  const currency = settingsRes.data?.currency || brand.currency;
  const rawOrders = (checked(ordersRes) as RawAnalyticsOrder[]) ?? [];
  const rawProducts = (checked(productsRes) as RawAnalyticsProduct[]) ?? [];

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
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      unit_cost: Number(it.unit_cost ?? 0),
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
