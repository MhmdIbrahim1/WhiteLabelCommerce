import { requireAdmin, checked } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { DEFAULT_STORE_ID } from "@/lib/tenant-shared";
import { AdminMarketingClient } from "./marketing-client";

export default async function AdminMarketingPage() {
  const [{ db, storeId, activeStore }, lang] = await Promise.all([
    requireAdmin(),
    getServerLang(),
  ]);

  const settingsRes = await db
    .from("store_settings")
    .select("meta_pixel_id,tiktok_pixel_id,ga4_measurement_id")
    .eq("store_id", storeId)
    .single<{
      meta_pixel_id: string | null;
      tiktok_pixel_id: string | null;
      ga4_measurement_id: string | null;
    }>();

  const data = checked(settingsRes);
  const storefrontPath =
    storeId === DEFAULT_STORE_ID ? "/" : `/s/${activeStore.slug}`;

  return (
    <AdminMarketingClient
      initialMetaPixelId={data.meta_pixel_id ?? ""}
      initialTiktokPixelId={data.tiktok_pixel_id ?? ""}
      initialGa4Id={data.ga4_measurement_id ?? ""}
      storefrontPath={storefrontPath}
      initialLang={lang}
    />
  );
}
