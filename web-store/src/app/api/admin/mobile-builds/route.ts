import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverDb } from "@/lib/db";
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
  apk_url: string | null;
  apk_size_bytes: number | null;
  github_run_url: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
};

function slugToAppIdSuffix(slug: string): string {
  const cleaned = slug
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 28);
  const safe = cleaned && /^[a-z]/.test(cleaned) ? cleaned : `s${cleaned || "shop"}`;
  return `.${safe}`;
}

async function resolveAdminBuildContext() {
  const [db, jar] = await Promise.all([serverDb(), cookies()]);
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const managedStores = await getManagedStores(db);
  if (managedStores.length === 0) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
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
  const { db, activeStore, unlocked } = ctx;

  const { data: builds, error } = await db
    .from("store_app_builds")
    .select(
      "id,store_id,app_name,app_id_suffix,package_id,icon_url,version_code,version_name,status,apk_url,apk_size_bytes,github_run_url,error_message,created_at,finished_at",
    )
    .eq("store_id", activeStore.store_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: "load_builds_failed", detail: error.message },
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
  const { db, user, activeStore, unlocked } = ctx;

  // Strict server-side plan & super-admin override enforcement
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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
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
  if (
    rawIcon &&
    !/^https:\/\/[^\s]+$/i.test(rawIcon)
  ) {
    return NextResponse.json(
      {
        error: "invalid_icon_url",
        message_ar: "رابط أيقونة التطبيق يجب أن يبدأ بـ https://.",
        message_en: "App icon URL must start with https://.",
      },
      { status: 400 },
    );
  }

  // Concurrency guard: prevent duplicate simultaneous builds for the same store
  const { data: activeBuilds } = await db
    .from("store_app_builds")
    .select("id,status,created_at")
    .eq("store_id", activeStore.store_id)
    .in("status", ["queued", "building"])
    .limit(1);

  if (activeBuilds && activeBuilds.length > 0) {
    return NextResponse.json(
      {
        error: "build_in_progress",
        message_ar: "يوجد بناء APK قيد التنفيذ حالياً لهذا المتجر. انتظر حتى ينتهي.",
        message_en: "An APK build is already in progress for this store. Please wait for it to finish.",
      },
      { status: 409 },
    );
  }

  // Check GitHub Actions configuration before inserting
  const ghToken = process.env.GITHUB_ACTIONS_TOKEN?.trim() || "";
  const ghOwner = process.env.GITHUB_REPO_OWNER?.trim() || "";
  const ghRepo = process.env.GITHUB_REPO_NAME?.trim() || "";

  if (!ghToken || !ghOwner || !ghRepo) {
    return NextResponse.json(
      {
        error: "github_actions_not_configured",
        message_ar:
          "مفاتيح تشغيل GitHub Actions غير مضبوطة بعد على الخادم (GITHUB_ACTIONS_TOKEN / GITHUB_REPO_OWNER / GITHUB_REPO_NAME في .env.local).",
        message_en:
          "GitHub Actions dispatch is not configured on this server yet. Set GITHUB_ACTIONS_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in .env.local.",
      },
      { status: 503 },
    );
  }

  // Compute monotonically increasing version_code for this store
  const { data: latestRow } = await db
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

  const { data: created, error: insertError } = await db
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
    })
    .select(
      "id,store_id,app_name,app_id_suffix,package_id,icon_url,version_code,version_name,status,apk_url,apk_size_bytes,github_run_url,error_message,created_at,finished_at",
    )
    .single<StoreAppBuildRow>();

  if (insertError || !created) {
    return NextResponse.json(
      {
        error: "insert_build_failed",
        detail: insertError?.message || "unknown",
      },
      { status: 500 },
    );
  }

  // Dispatch .github/workflows/build-store-apk.yml
  const dispatchUrl = `https://api.github.com/repos/${encodeURIComponent(ghOwner)}/${encodeURIComponent(ghRepo)}/actions/workflows/build-store-apk.yml/dispatches`;
  const ghResp = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${ghToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: {
        build_id: created.id,
        store_id: activeStore.store_id,
        store_slug: activeStore.slug,
        store_name: appName,
        app_id_suffix: appIdSuffix,
        version_code: String(nextVersionCode),
        version_name: nextVersionName,
        icon_url: rawIcon || "",
      },
    }),
  });

  if (!ghResp.ok) {
    const errBody = await ghResp.text().catch(() => "");
    const message = `GitHub dispatch failed (HTTP ${ghResp.status}): ${errBody.slice(0, 180)}`;
    await db
      .from("store_app_builds")
      .update({
        status: "failed",
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", created.id);

    return NextResponse.json(
      {
        error: "github_dispatch_failed",
        message_ar: "تعذر إرسال طلب البناء إلى GitHub Actions. تحقق من صلاحيات التوكن.",
        message_en: message,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ build: created }, { status: 201 });
}
