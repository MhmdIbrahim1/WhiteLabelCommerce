import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverDb } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import brand from "@/lib/brand";
import { localizedText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { DeliveryCard, type DeliveryInfo } from "./delivery-card";
import "./delivery.css";

async function resolveOrderStoreNames(orderId: string): Promise<{
  nameAr: string;
  nameEn: string;
}> {
  try {
    const svc = adminDb();
    const { data: orderRow } = await svc
      .from("orders")
      .select("store_id")
      .eq("id", orderId)
      .maybeSingle<{ store_id: string }>();

    if (!orderRow?.store_id) {
      return { nameAr: brand.storeName, nameEn: brand.storeName };
    }

    const [storeRes, settingsRes] = await Promise.all([
      svc
        .from("stores")
        .select("name_ar,name_en")
        .eq("id", orderRow.store_id)
        .maybeSingle<{ name_ar: string | null; name_en: string | null }>(),
      svc
        .from("store_settings")
        .select("store_name")
        .eq("store_id", orderRow.store_id)
        .maybeSingle<{ store_name: string | null }>(),
    ]);

    const nameAr =
      settingsRes.data?.store_name?.trim() ||
      storeRes.data?.name_ar?.trim() ||
      brand.storeName;
    const nameEn =
      storeRes.data?.name_en?.trim() ||
      settingsRes.data?.store_name?.trim() ||
      nameAr;
    return { nameAr, nameEn };
  } catch {
    return { nameAr: brand.storeName, nameEn: brand.storeName };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const clean = decodeURIComponent(token || "").trim();
  if (clean.length < 24) return {};
  const [db, lang] = await Promise.all([serverDb(), getServerLang()]);
  const { data } = await db
    .rpc("get_delivery_by_token", { p_token: clean })
    .maybeSingle<DeliveryInfo>();
  if (!data?.order_id) return {};
  const names = await resolveOrderStoreNames(data.order_id);
  const storeName = localizedText(lang, names.nameAr, names.nameEn);
  return {
    title:
      lang === "en"
        ? `Delivery Confirmation · ${storeName}`
        : `تأكيد التسليم · ${storeName}`,
  };
}

export default async function DriverDeliveryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const clean = decodeURIComponent(token || "").trim();
  if (clean.length < 24) notFound();

  const db = await serverDb();
  const deliveryRes = await db
    .rpc("get_delivery_by_token", { p_token: clean })
    .maybeSingle<DeliveryInfo>();

  if (deliveryRes.error || !deliveryRes.data) notFound();

  const storeNames = await resolveOrderStoreNames(deliveryRes.data.order_id);

  return (
    <DeliveryCard
      token={clean}
      storeName={storeNames.nameAr}
      storeNameEn={storeNames.nameEn}
      info={deliveryRes.data}
    />
  );
}
