import { requireAdmin } from "@/lib/db";
import { computeMobileAppUnlocked } from "@/lib/tenant-shared";
import type { StoreAppBuildRow } from "@/app/api/admin/mobile-builds/route";
import { MobileAppStudio } from "./mobile-app-studio";

export const dynamic = "force-dynamic";

export default async function AdminMobileAppPage() {
  const { db, storeId, activeStore } = await requireAdmin();

  const [settingsRes, accessRes, buildsRes] = await Promise.all([
    db
      .from("store_settings")
      .select("store_name,logo_url,primary_color,secondary_color,whatsapp_number,support_email")
      .eq("store_id", storeId)
      .maybeSingle<{
        store_name: string | null;
        logo_url: string | null;
        primary_color: string | null;
        secondary_color: string | null;
        whatsapp_number: string | null;
        support_email: string | null;
      }>(),
    db.rpc("store_has_mobile_app_access", { p_store_id: storeId }),
    db
      .from("store_app_builds")
      .select(
        "id,store_id,app_name,app_id_suffix,package_id,icon_url,version_code,version_name,status,apk_url,apk_size_bytes,github_run_url,error_message,created_at,finished_at",
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const unlocked =
    !accessRes.error && typeof accessRes.data === "boolean"
      ? accessRes.data
      : computeMobileAppUnlocked(activeStore.plan, activeStore.mobile_app_access);

  const githubConfigured = Boolean(
    process.env.GITHUB_ACTIONS_TOKEN?.trim() &&
      process.env.GITHUB_REPO_OWNER?.trim() &&
      process.env.GITHUB_REPO_NAME?.trim(),
  );

  const s = settingsRes.data;
  const cleanedSlug = activeStore.slug
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 28);
  const safeSlug =
    cleanedSlug && /^[a-z]/.test(cleanedSlug)
      ? cleanedSlug
      : `s${cleanedSlug || "shop"}`;

  return (
    <MobileAppStudio
      key={activeStore.store_id}
      store={{
        storeId: activeStore.store_id,
        slug: activeStore.slug,
        nameAr: s?.store_name || activeStore.name_ar,
        nameEn: activeStore.name_en || s?.store_name || activeStore.name_ar,
        plan: activeStore.plan,
        mobileAppAccess: activeStore.mobile_app_access ?? "plan",
        logoUrl: s?.logo_url ?? "",
        primaryColor: s?.primary_color || "#0f172a",
        secondaryColor: s?.secondary_color || "#0284c7",
        packageId: `com.whitelabel.commerce.${safeSlug}`,
        whatsappNumber: s?.whatsapp_number ?? "",
        supportEmail: s?.support_email ?? "",
      }}
      unlocked={unlocked}
      githubConfigured={githubConfigured}
      initialBuilds={(buildsRes.data ?? []) as StoreAppBuildRow[]}
    />
  );
}
