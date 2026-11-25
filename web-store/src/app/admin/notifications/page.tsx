import { requireAdmin } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import { CampaignStudio } from "./campaign-studio";

export const dynamic = "force-dynamic";

type NotificationLogRow = {
  id: string;
  target_role: "customer" | "admin";
  category: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  deep_link: string;
  is_read: boolean;
  read_at?: string | null;
  sent_push: boolean;
  created_at: string;
};

export default async function AdminNotificationsPage() {
  const { db, storeId, activeStore } = await requireAdmin();
  const svc = adminDb();

  const { data: storeRow } = await db
    .from("store_settings")
    .select("store_id,store_name")
    .eq("store_id", storeId)
    .maybeSingle<{ store_id: string; store_name: string }>();

  const storeName = storeRow?.store_name || activeStore.name_ar || "Store";

  const [
    androidSubsRes,
    webSubsRes,
    restockPendingRes,
    recentNotifsRes,
    productsRes,
    categoriesRes,
  ] = await Promise.all([
    svc
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("platform", "android")
      .eq("is_active", true),
    svc
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("platform", "web")
      .eq("is_active", true),
    svc
      .from("back_in_stock_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .is("notified_at", null),
    svc
      .from("notifications")
      .select(
        "id,target_role,category,title_ar,title_en,body_ar,body_en,deep_link,is_read,read_at,sent_push,created_at",
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("products")
      .select("id,name,name_en")
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("name")
      .limit(100),
    db
      .from("categories")
      .select("id,name,name_en")
      .eq("store_id", storeId)
      .order("name")
      .limit(50),
  ]);

  const history = ((recentNotifsRes.data ?? []) as NotificationLogRow[]).map(
    (n) => ({
      ...n,
      is_read: Boolean(n.is_read || n.read_at),
    }),
  );
  const readCount = history.filter((n) => n.is_read).length;
  const readRate =
    history.length > 0 ? Math.round((readCount / history.length) * 100) : 0;

  return (
    <CampaignStudio
      storeName={storeName}
      stats={{
        androidSubscribers: androidSubsRes.count ?? 0,
        webSubscribers: webSubsRes.count ?? 0,
        pendingRestock: restockPendingRes.count ?? 0,
        totalSent: history.length,
        readRate,
      }}
      products={(productsRes.data ?? []) as { id: string; name: string; name_en?: string | null }[]}
      categories={(categoriesRes.data ?? []) as { id: string; name: string; name_en?: string | null }[]}
      history={history}
    />
  );
}
