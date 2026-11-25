import { requireAdmin, checked } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { normalizeReturnRecord } from "@/lib/returns";
import { AdminReturnsClient, type AdminReturnCardItem } from "./returns-client";

type OrderMetaRow = {
  id: string;
  phone: string | null;
  shipping_address: string;
  currency: string;
  total: number | null;
  payment_method: string | null;
  customer_id: string | null;
  user_id: string | null;
};

type CustomerMetaRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string;
};

export default async function AdminReturnsPage() {
  const [{ db, storeId }, lang] = await Promise.all([
    requireAdmin(),
    getServerLang(),
  ]);

  const [returnsRes, settingsRes] = await Promise.all([
    db
      .from("return_requests")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("store_settings")
      .select("currency,return_window_days")
      .eq("store_id", storeId)
      .maybeSingle<{ currency: string; return_window_days?: number | null }>(),
  ]);

  const rawRows = (checked(returnsRes) ?? []) as Record<string, unknown>[];
  const normalized = rawRows.map(normalizeReturnRecord);
  const defaultCurrency = settingsRes.data?.currency || "EGP";
  const returnWindowDays =
    typeof settingsRes.data?.return_window_days === "number" &&
    Number.isFinite(settingsRes.data.return_window_days)
      ? settingsRes.data.return_window_days
      : 14;

  const orderIds = Array.from(new Set(normalized.map((r) => r.order_id)));
  const userIds = Array.from(new Set(normalized.map((r) => r.user_id)));

  const [ordersRes, customersRes] = await Promise.all([
    orderIds.length > 0
      ? db
          .from("orders")
          .select(
            "id,phone,shipping_address,currency,total,payment_method,customer_id,user_id",
          )
          .eq("store_id", storeId)
          .in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? db
          .from("store_customers")
          .select("id,user_id,full_name,phone,email")
          .eq("store_id", storeId)
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const orderMap = new Map<string, OrderMetaRow>();
  for (const o of ((ordersRes.data ?? []) as OrderMetaRow[])) {
    orderMap.set(o.id, o);
  }

  const customerByUser = new Map<string, CustomerMetaRow>();
  for (const c of ((customersRes.data ?? []) as CustomerMetaRow[])) {
    if (c.user_id) customerByUser.set(c.user_id, c);
  }

  const items: AdminReturnCardItem[] = normalized.map((req) => {
    const order = orderMap.get(req.order_id);
    const customer = customerByUser.get(req.user_id);
    return {
      ...req,
      currency: order?.currency || defaultCurrency,
      order_total: order?.total ?? null,
      order_payment_method: order?.payment_method ?? null,
      customer_name: customer?.full_name?.trim() || "",
      customer_email: customer?.email?.trim() || "",
      customer_phone: order?.phone || customer?.phone || "",
      shipping_address: order?.shipping_address || "",
    };
  });

  return (
    <AdminReturnsClient
      initialReturns={items}
      initialLang={lang}
      currency={defaultCurrency}
      initialReturnWindowDays={returnWindowDays}
    />
  );
}
