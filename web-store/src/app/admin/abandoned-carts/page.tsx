import { requireAdmin, checked } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { normalizeAbandonedCartRecord } from "@/lib/marketing";
import { storefrontPath } from "@/lib/tenant-shared";
import {
  AdminAbandonedCartsClient,
  type ActiveCouponOption,
  type AbandonedCartFilter,
  type AbandonedCartSummary,
} from "./abandoned-carts-client";

const PAGE_SIZE = 25;
const VALID_FILTERS: AbandonedCartFilter[] = [
  "all",
  "open",
  "reminded",
  "recovered",
];

export default async function AdminAbandonedCartsPage({
  searchParams,
}: PageProps<"/admin/abandoned-carts">) {
  const [params, { db, storeId, activeStore }, lang] = await Promise.all([
    searchParams,
    requireAdmin(),
    getServerLang(),
  ]);
  const statusRaw = typeof params.status === "string" ? params.status : "all";
  const status: AbandonedCartFilter = VALID_FILTERS.includes(
    statusRaw as AbandonedCartFilter,
  )
    ? (statusRaw as AbandonedCartFilter)
    : "all";
  const pageRaw = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let cartsQuery = db
    .from("abandoned_carts")
    .select("*", { count: "exact" })
    .eq("store_id", storeId);
  cartsQuery =
    status === "all"
      ? cartsQuery.neq("status", "dismissed")
      : cartsQuery.eq("status", status);

  const [cartsRes, summaryRes, couponsRes, settingsRes] = await Promise.all([
    cartsQuery.order("updated_at", { ascending: false }).order("id").range(from, to),
    db.rpc("admin_abandoned_cart_summary", { p_store_id: storeId }),
    db
      .from("coupons")
      .select("code,discount_type,discount_value")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("code"),
    db
      .from("store_settings")
      .select("store_name,currency")
      .eq("store_id", storeId)
      .maybeSingle<{ store_name: string; currency: string }>(),
  ]);

  if (cartsRes.error || summaryRes.error || couponsRes.error || settingsRes.error) {
    throw new Error("Could not load abandoned carts.");
  }

  const rawCarts = (checked(cartsRes) ?? []) as Record<string, unknown>[];
  const carts = rawCarts.map(normalizeAbandonedCartRecord);
  const rawSummary = (checked(summaryRes) ?? {}) as Partial<
    Record<keyof AbandonedCartSummary, number | string>
  >;
  const summary: AbandonedCartSummary = {
    all: Number(rawSummary.all ?? 0),
    open: Number(rawSummary.open ?? 0),
    reminded: Number(rawSummary.reminded ?? 0),
    recovered: Number(rawSummary.recovered ?? 0),
    recoverable_value: Number(rawSummary.recoverable_value ?? 0),
  };
  const coupons = ((couponsRes.data ?? []) as ActiveCouponOption[]).map((c) => ({
    code: c.code,
    discount_type: c.discount_type,
    discount_value: Number(c.discount_value),
  }));
  const storeName =
    settingsRes.data?.store_name || activeStore.name_ar || "Nova Store";
  const currency = settingsRes.data?.currency || "EGP";
  const cartBasePath = storefrontPath(activeStore.slug) + "/cart";

  return (
    <AdminAbandonedCartsClient
      key={`${status}:${page}:${carts.map((cart) => cart.updated_at).join(",")}`}
      initialCarts={carts}
      coupons={coupons}
      storeName={storeName}
      currency={currency}
      cartBasePath={cartBasePath}
      initialLang={lang}
      status={status}
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={cartsRes.count ?? 0}
      summary={summary}
    />
  );
}
