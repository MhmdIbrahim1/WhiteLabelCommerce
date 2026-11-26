import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverDb } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import {
  ADMIN_STORE_COOKIE,
  DEFAULT_STORE_ID,
  computeMobileAppUnlocked,
  getManagedStores,
} from "@/lib/tenant";

export type StoreAppBuildRow = {
  id: string;
  store_id: string;
  app_name: string;
  app_id_suffix: string;
  package_id: string;
  icon_url: string | null;
  version_code: number;
  version_name: string;
  status: "queued" | "building" | "succeeded" | "failed";
  apk_download_url: string | null;
  github_run_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const BUILD_SELECT =
  "id,store_id,app_name,app_id_suffix,package_id,icon_url,version_code,version_name,status,apk_download_url,github_run_url,error_message,created_at,updated_at,completed_at";

function slugToAppIdSuffix(slug: string): string {
  const cleaned = slug
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 28);
  const safe =
    cleaned && /^[a-z]/.test(cleaned) ? cleaned : `s${cleaned || "shop"}`;
  return `.${safe}`;
}

async function resolveAdminBuildContext() {
  const [db, jar] = await Promise.all([serverDb(), cookies()]);
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user) {
    return {
      error: NextResponse.json(
        {
          error: "unauthorized",
          message_ar: "يرجى تسجيل الدخول أولاً.",
          message_en: "Please sign in first.",
        },
        { status: 401 },
      ),
    };
  }

  const managedStores = await getManagedStores(db);
  if (managedStores.length === 0) {
    return {
      error: NextResponse.json(
        {
          error: "forbidden",
          message_ar: "ليس لديك صلاحية إدارة هذا المتجر.",
          message_en: "You do not have permission to manage this store.",
        },
        { status: 403 },
      ),
    };
  }

  const requestedStoreId = jar.get(ADMIN_STORE_COOKIE)?.value?.trim() || "";
  const activeStore =
    managedStores.find((s) => s.store_id === requestedStoreId) ??
    managedStores.find((s) => s.store_id === DEFAULT_STORE_ID) ??
    managedStores[0];

  const { data: unlockedRpc, error: rpcErr } = await db.rpc(
    "store_has_mobile_app_access",
    { p_store_id: activeStore.store_id },
  );
  const unlocked =
    !rpcErr && typeof unlockedRpc === "boolean"
      ? unlockedRpc
      : computeMobileAppUnlocked(activeStore.plan, activeStore.mobile_app_access);

  return { db, user, activeStore, unlocked };
}

export async function GET() {
  const ctx = await resolveAdminBuildContext();
  if ("error" in ctx) return ctx.error;
  const { activeStore, unlocked } = ctx;

  const { data: builds, error } = await adminDb()
    .from("store_app_builds")
    .select(BUILD_SELECT)
    .eq("store_id", activeStore.store_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[mobile-builds][GET] query failed:", error.message);
    return NextResponse.json(
      {
        error: "load_builds_failed",
        message_ar: "تعذر تحميل سجل البناء حالياً. يرجى المحاولة مرة أخرى.",
        message_en: "Failed to load build history right now. Please try again.",
      },
      { status: 500 },
    );
  }

  const githubConfigured = Boolean(
    process.env.GITHUB_ACTIONS_TOKEN?.trim() &&
      process.env.GITHUB_REPO_OWNER?.trim() &&
      process.env.GITHUB_REPO_NAME?.trim(),
  );

  return NextResponse.json({
    store: activeStore,
    unlocked,
    builds: (builds ?? []) as StoreAppBuildRow[],
    githubConfigured,
  });
}

export async function POST(req: Request) {
  const ctx = await resolveAdminBuildContext();
  if ("error" in ctx) return ctx.error;
  const { user, activeStore, unlocked } = ctx;

  // 1. Strict server-side plan & super-admin override enforcement
  if (!unlocked) {
    return NextResponse.json(
      {
        error: "plan_upgrade_required",
        message_ar:
          "مصنع تطبيق الأندرويد متاح لباقات النمو (Growth) والمؤسسي (Enterprise) فقط. قم بترقية باقتك للتفعيل.",
        message_en:
          "White-label Android APK Builder is available on Growth and Enterprise plans. Upgrade your plan to unlock.",
      },
      { status: 403 },
    );
  }

  let body: { appName?: unknown; iconUrl?: unknown } = {};
  try {
    body = (await req.json()) as { appName?: unknown; iconUrl?: unknown };
  } catch {
    return NextResponse.json(
      {
        error: "invalid_json",
        message_ar: "بيانات الطلب غير صالحة.",
        message_en: "Invalid JSON request body.",
      },
      { status: 400 },
    );
  }

  const appName = String(body.appName ?? "")
    .trim()
    .slice(0, 60);
  if (appName.length < 2) {
    return NextResponse.json(
      {
        error: "invalid_app_name",
        message_ar: "يرجى إدخال اسم التطبيق (حرفان على الأقل).",
        message_en: "Please enter an app display name (at least 2 characters).",
      },
      { status: 400 },
    );
  }

  const rawIcon = String(body.iconUrl ?? "").trim();
  if (rawIcon && !/^https:\/\/[^\s]+$/i.test(rawIcon)) {
    return NextResponse.json(
      {
        error: "invalid_icon_url",
        message_ar: "رابط أيقونة التطبيق يجب أن يبدأ بـ https://.",
        message_en: "App icon URL must start with https://.",
      },
      { status: 400 },
    );
  }

  // 2. Verify GitHub Actions configuration before creating a build row
  const ghToken = process.env.GITHUB_ACTIONS_TOKEN?.trim() || "";
  const ghOwner = process.env.GITHUB_REPO_OWNER?.trim() || "";
  const ghRepo = process.env.GITHUB_REPO_NAME?.trim() || "";

  if (!ghToken || !ghOwner || !ghRepo) {
    return NextResponse.json(
      {
        error: "github_actions_not_configured",
        message_ar:
          "خدمة البناء السحابي غير مهيأة بعد على الخادم. تحقق من إعدادات GITHUB_ACTIONS_TOKEN و GITHUB_REPO_OWNER و GITHUB_REPO_NAME.",
        message_en:
          "Cloud APK Builder is not configured on this server. Set GITHUB_ACTIONS_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in .env.local.",
      },
      { status: 503 },
    );
  }

  // 3. Use Service-Role adminDb() for store_app_builds writes (direct client writes are revoked by RLS)
  let serviceDb;
  try {
    serviceDb = adminDb();
  } catch (err) {
    const detail = err instanceof Error ? err.message : "missing_service_role";
    console.error("[mobile-builds][POST] adminDb init failed:", detail);
    return NextResponse.json(
      {
        error: "service_role_missing",
        message_ar:
          "مفتاح الخدمة (SUPABASE_SERVICE_ROLE_KEY) غير مضبوط على الخادم.",
        message_en:
          "Server database service role key (SUPABASE_SERVICE_ROLE_KEY) is not configured.",
      },
      { status: 500 },
    );
  }

  // 4. Concurrency guard: prevent duplicate simultaneous builds for the same store
  const { data: activeBuilds, error: activeErr } = await serviceDb
    .from("store_app_builds")
    .select("id,status,created_at")
    .eq("store_id", activeStore.store_id)
    .in("status", ["queued", "building"])
    .limit(1);

  if (activeErr) {
    console.error("[mobile-builds][POST] concurrency check failed:", activeErr.message);
    return NextResponse.json(
      {
        error: "db_check_failed",
        message_ar: "تعذر التحقق من حالة البناء الحالية. يرجى المحاولة مرة أخرى.",
        message_en: "Failed to check active builds right now. Please try again.",
      },
      { status: 500 },
    );
  }

  if (activeBuilds && activeBuilds.length > 0) {
    return NextResponse.json(
      {
        error: "build_in_progress",
        message_ar:
          "يوجد بناء APK قيد التنفيذ حالياً لهذا المتجر. انتظر حتى ينتهي.",
        message_en:
          "An APK build is already in progress for this store. Please wait for it to finish.",
      },
      { status: 409 },
    );
  }

  // 5. Compute monotonically increasing version_code for this store
  const { data: latestRow } = await serviceDb
    .from("store_app_builds")
    .select("version_code")
    .eq("store_id", activeStore.store_id)
    .order("version_code", { ascending: false })
    .limit(1)
    .maybeSingle<{ version_code: number }>();

  const nextVersionCode = Math.max(100, Number(latestRow?.version_code ?? 99) + 1);
  const nextVersionName = `1.0.${nextVersionCode - 99}`;
  const appIdSuffix = slugToAppIdSuffix(activeStore.slug);
  const packageId = `com.whitelabel.commerce${appIdSuffix}`;
  const workflowPageUrl = `https://github.com/${encodeURIComponent(ghOwner)}/${encodeURIComponent(ghRepo)}/actions/workflows/build-store-apk.yml`;

  const { data: created, error: insertError } = await serviceDb
    .from("store_app_builds")
    .insert({
      store_id: activeStore.store_id,
      requested_by: user.id,
      app_name: appName,
      app_id_suffix: appIdSuffix,
      package_id: packageId,
      icon_url: rawIcon || null,
      version_code: nextVersionCode,
      version_name: nextVersionName,
      status: "queued",
      github_run_url: workflowPageUrl,
    })
    .select(BUILD_SELECT)
    .single<StoreAppBuildRow>();

  if (insertError || !created) {
    const detail = insertError?.message || "Unknown database insert error";
    console.error("[mobile-builds][POST] insert failed:", detail);
    return NextResponse.json(
      {
        error: "insert_build_failed",
        message_ar: "تعذر إنشاء سجل البناء في قاعدة البيانات حالياً.",
        message_en: "Failed to record the build request. Please try again.",
      },
      { status: 500 },
    );
  }

  // 6. Dispatch .github/workflows/build-store-apk.yml with strictly stringified inputs matching workflow YAML 1-to-1
  const dispatchUrl = `https://api.github.com/repos/${encodeURIComponent(ghOwner)}/${encodeURIComponent(ghRepo)}/actions/workflows/build-store-apk.yml/dispatches`;
  const dispatchPayload = {
    ref: "main",
    inputs: {
      build_id: String(created.id),
      store_id: String(activeStore.store_id),
      store_slug: String(activeStore.slug),
      app_name: String(appName),
      app_id_suffix: String(appIdSuffix),
      icon_url: String(rawIcon || ""),
      version_code: String(nextVersionCode),
      version_name: String(nextVersionName),
    },
  };

  let ghResp: Response;
  try {
    ghResp = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${ghToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "WhiteLabelCommerce-WebStore/1.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dispatchPayload),
    });
  } catch (netErr) {
    const msg =
      netErr instanceof Error ? netErr.message : "Network error contacting GitHub";
    console.error("[mobile-builds][POST] GitHub fetch failed:", msg);
    const nowIso = new Date().toISOString();
    await serviceDb
      .from("store_app_builds")
      .update({
        status: "failed",
        error_message: msg,
        updated_at: nowIso,
        completed_at: nowIso,
      })
      .eq("id", created.id);
    return NextResponse.json(
      {
        error: "github_network_error",
        message_ar: `تعذر الاتصال بـ GitHub Actions: ${msg}`,
        message_en: `Failed to reach GitHub Actions: ${msg}`,
      },
      { status: 502 },
    );
  }

  if (!ghResp.ok) {
    const errBody = await ghResp.text().catch(() => "");
    let parsedMsg = errBody.slice(0, 220);
    try {
      const errJson = JSON.parse(errBody) as { message?: string };
      if (errJson.message) parsedMsg = errJson.message;
    } catch {
      /* keep raw snippet */
    }
    const message = `GitHub dispatch failed (HTTP ${ghResp.status}): ${parsedMsg}`;
    console.error("[mobile-builds][POST]", message);

    const nowIso = new Date().toISOString();
    await serviceDb
      .from("store_app_builds")
      .update({
        status: "failed",
        error_message: message,
        updated_at: nowIso,
        completed_at: nowIso,
      })
      .eq("id", created.id);

    const hintAr =
      ghResp.status === 403 || ghResp.status === 401
        ? "تحقق من أن توكن GitHub يملك صلاحية Actions: Read and write."
        : ghResp.status === 404
          ? "ملف workflow غير موجود على فرع main."
          : parsedMsg;

    return NextResponse.json(
      {
        error: "github_dispatch_failed",
        message_ar: `فشل تشغيل البناء في GitHub Actions (HTTP ${ghResp.status}): ${hintAr}`,
        message_en: message,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ build: created }, { status: 201 });
}
