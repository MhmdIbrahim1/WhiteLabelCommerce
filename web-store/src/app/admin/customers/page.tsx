import { checked, requireAdmin } from "@/lib/db";
import brand, { money } from "@/lib/brand";
import { getServerLang } from "@/lib/i18n-server";
import { Notice } from "../ui";
import { CustomersClient, type CustomerCrmRow } from "./customers-client";

type RawCustomer = {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  notes: string;
  created_at: string;
};

type RawOrder = {
  id: string;
  customer_id: string | null;
  status: string;
  total: number | null;
  currency: string;
  created_at: string;
  shipping_carrier: string | null;
};

type RawWalletTx = {
  id: string;
  user_id: string;
  order_id: string | null;
  type: string;
  amount: number;
  balance_after: number;
  note_ar: string;
  note_en: string;
  created_at: string;
};

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ db, storeId }, lang] = await Promise.all([requireAdmin("manage_customers"), getServerLang()]);
  const isEn = lang === "en";
  const [params, settingsRes, customersRes, ordersRes] = await Promise.all([
    searchParams,
    db
      .from("store_settings")
      .select("store_id,currency")
      .eq("store_id", storeId)
      .single<{ store_id: string; currency: string }>(),
    db
      .from("store_customers")
      .select("id,user_id,full_name,phone,email,city,address,notes,created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("orders")
      .select("id,customer_id,status,total,currency,created_at,shipping_carrier")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const currency = settingsRes.data?.currency || brand.currency;
  const customers = (checked(customersRes) as RawCustomer[]) ?? [];
  const orders = (checked(ordersRes) as RawOrder[]) ?? [];

  const walletRes = await db
    .from("wallet_transactions")
    .select("id,user_id,order_id,type,amount,balance_after,note_ar,note_en,created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(2000);
  const walletRows = (!walletRes.error && walletRes.data
    ? (walletRes.data as RawWalletTx[])
    : []);

  const walletByUser = new Map<
    string,
    { balance: number; transactions: RawWalletTx[] }
  >();
  for (const tx of walletRows) {
    const entry = walletByUser.get(tx.user_id) ?? {
      balance: 0,
      transactions: [],
    };
    entry.balance = Math.round((entry.balance + Number(tx.amount)) * 100) / 100;
    if (entry.transactions.length < 30) {
      entry.transactions.push(tx);
    }
    walletByUser.set(tx.user_id, entry);
  }

  const ordersByCustomer = new Map<string, RawOrder[]>();
  for (const o of orders) {
    if (!o.customer_id) continue;
    const list = ordersByCustomer.get(o.customer_id) ?? [];
    list.push(o);
    ordersByCustomer.set(o.customer_id, list);
  }

  const crmRows: CustomerCrmRow[] = customers.map((c) => {
    const custOrders = ordersByCustomer.get(c.id) ?? [];
    const totalOrders = custOrders.length;
    const delivered = custOrders.filter((o) => o.status === "delivered");
    const cancelled = custOrders.filter((o) => o.status === "cancelled");
    const nonCancelled = custOrders.filter((o) => o.status !== "cancelled");
    const lifetimeSpend = delivered.reduce(
      (s, o) => s + Number(o.total ?? 0),
      0,
    );
    const basisOrders = delivered.length > 0 ? delivered : nonCancelled;
    const basisSum = basisOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const averageOrderValue = basisOrders.length
      ? basisSum / basisOrders.length
      : 0;
    const lastOrderDate = custOrders[0]?.created_at ?? null;

    let badge: CustomerCrmRow["badge"] = "new";
    if (
      cancelled.length >= 2 ||
      (totalOrders >= 2 && cancelled.length / totalOrders >= 0.4)
    ) {
      badge = "high_return";
    } else if (lifetimeSpend >= 1500 || delivered.length >= 4) {
      badge = "vip";
    } else if (totalOrders >= 2) {
      badge = "repeat";
    }

    const walletInfo = c.user_id ? walletByUser.get(c.user_id) : undefined;

    return {
      id: c.id,
      userId: c.user_id,
      fullName: c.full_name,
      phone: c.phone,
      email: c.email,
      city: c.city,
      address: c.address,
      notes: c.notes,
      createdAt: c.created_at,
      totalOrders,
      deliveredOrders: delivered.length,
      cancelledOrders: cancelled.length,
      lifetimeSpend,
      averageOrderValue,
      lastOrderDate,
      badge,
      walletBalance: Math.max(0, walletInfo?.balance ?? 0),
      walletTransactions: (walletInfo?.transactions ?? []).map((tx) => ({
        id: tx.id,
        order_id: tx.order_id,
        type: tx.type,
        amount: Number(tx.amount),
        balance_after: Number(tx.balance_after),
        note_ar: tx.note_ar,
        note_en: tx.note_en,
        created_at: tx.created_at,
      })),
      orders: custOrders.map((o) => ({
        id: o.id,
        status: o.status,
        total: Number(o.total ?? 0),
        currency: o.currency,
        created_at: o.created_at,
        shipping_carrier: o.shipping_carrier,
      })),
    };
  });

  const totalLtv = crmRows.reduce((s, c) => s + c.lifetimeSpend, 0);
  const vipCount = crmRows.filter((c) => c.badge === "vip").length;
  const repeatCount = crmRows.filter((c) => c.totalOrders >= 2).length;

  return (
    <>
      <h1>{isEn ? "Customers CRM & Analytics" : "إدارة العملاء والتحليلات (CRM)"}</h1>
      <Notice result={params.result} />

      <div className="metrics" style={{ marginBottom: "1rem" }}>
        <article className="card metric">
          <p>{isEn ? "Total Customers" : "إجمالي العملاء"}</p>
          <strong>{crmRows.length}</strong>
        </article>
        <article className="card metric">
          <p>{isEn ? "Repeat Customers" : "عملاء متكررون"}</p>
          <strong>{repeatCount}</strong>
        </article>
        <article className="card metric">
          <p>{isEn ? "VIP Customers" : "عملاء VIP"}</p>
          <strong>{vipCount}</strong>
        </article>
        <article className="card metric">
          <p>{isEn ? "Total Delivered Spend" : "إجمالي الإنفاق المسلّم"}</p>
          <strong>{money(totalLtv, currency, lang)}</strong>
        </article>
      </div>

      <CustomersClient rows={crmRows} currency={currency} />
    </>
  );
}
