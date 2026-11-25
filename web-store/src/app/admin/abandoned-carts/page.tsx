import { requireAdmin, checked } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { normalizeAbandonedCartRecord } from "@/lib/marketing";
import { DEFAULT_STORE_ID } from "@/lib/tenant-shared";
import {
  AdminAbandonedCartsClient,
  type ActiveCouponOption,
} from "./abandoned-carts-client";

export default async function AdminAbandonedCartsPage() {
  const [{ db, storeId, activeStore }, lang] = await Promise.all([
    requireAdmin(),
    getServerLang(),
  ]);

  const [cartsRes, couponsRes, settingsRes] = await Promise.all([
    db
      .from("abandoned_carts")
      .select("*")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false })
      .limit(200),
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

  const rawCarts = (checked(cartsRes) ?? []) as Record<string, unknown>[];
  const carts = rawCarts.map(normalizeAbandonedCartRecord);
  const coupons = ((couponsRes.data ?? []) as ActiveCouponOption[]).map((c) => ({
    code: c.code,
    discount_type: c.discount_type,
    discount_value: Number(c.discount_value),
  }));
  const storeName =
    settingsRes.data?.store_name || activeStore.name_ar || "Nova Store";
  const currency = settingsRes.data?.currency || "EGP";
  const cartBasePath =
    storeId === DEFAULT_STORE_ID ? "/cart" : `/s/${activeStore.slug}/cart`;

  return (
    <AdminAbandonedCartsClient
      initialCarts={carts}
      coupons={coupons}
      storeName={storeName}
      currency={currency}
      cartBasePath={cartBasePath}
      initialLang={lang}
    />
  );
}
