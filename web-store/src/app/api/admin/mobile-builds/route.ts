import { hasStorePermission } from "@/lib/access";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverDb } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import { getResourceAllowance } from "@/lib/billing-data";
import { limitReached, quotaFailure, quotaMessage, type QuotaFailure } from "@/lib/billing";
import {
  ADMIN_STORE_COOKIE,
  DEFAULT_STORE_ID,
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
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const BUILD_SELECT =
  "id,store_id,app_name,app_id_suffix,package_id,icon_url,version_code,version_name,status,apk_download_url,github_run_url,created_at,updated_at,completed_at";

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

  if (!(await hasStorePermission(db, activeStore.store_id, "manage_mobile_app"))) {
    return { error: NextResponse.json({ error: "forbidden", message_en: "Mobile app access is restricted.",
      message_ar: "صلاحية إدارة التطبيق مطلوبة." }, { status: 403 }) };
  }

  const { data: unlockedRpc, error: rpcErr } = await db.rpc(
    "store_has_mobile_app_access",
    { p_store_id: activeStore.store_id },
  );
  const billing = await getResourceAllowance(activeStore.store_id, "apk_builds").catch(() => null);
  if (rpcErr || !billing) return { error: NextResponse.json({ error: "billing_unavailable",
    message_en: "Build allowances are temporarily unavailable.", message_ar: "تعذّر تحميل رصيد البناء مؤقتاً." }, { status: 503 }) };
  return { db, user, activeStore, unlocked: unlockedRpc === true,
    quota: { current: billing.used, limit: billing.cap } };
}

function quotaResponse(failure: QuotaFailure) {
  const blocked = failure.code === "feature_not_in_plan";
  return NextResponse.json({ ...failure, error: failure.code, message_en: quotaMessage(failure.resource, "en", blocked),
    message_ar: quotaMessage(failure.resource, "ar", blocked) }, { status: blocked ? 403 : 409 });
}

export async function GET() {
  const ctx = await resolveAdminBuildContext();
  if ("error" in ctx) return ctx.error;
  const { activeStore, unlocked } = ctx;

  const { data: builds, error } = await ctx.db
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
    quota: ctx.quota,
    builds: (builds ?? []) as StoreAppBuildRow[],
    githubConfigured,
  });
}

export async function POST(req: Request) {
  const ctx = await resolveAdminBuildContext();
  if ("error" in ctx) return ctx.error;
  const { user, activeStore, unlocked, quota } = ctx;

  // The queue transaction rechecks access and capacity after acquiring the store lock.
  if (!unlocked) {
    return quotaResponse({ code: "feature_not_in_plan", resource: "apk_builds", current: quota.current, limit: 0 });
  }
  if (quota.limit !== null && limitReached(quota.current, quota.limit)) {
    return quotaResponse({ code: "plan_limit_reached", resource: "apk_builds", current: quota.current, limit: quota.limit });
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

  // Check dispatch configuration before reserving a build.
  const ghToken = process.env.GITHUB_ACTIONS_TOKEN?.trim() || "";
  const ghOwner = process.env.GITHUB_REPO_OWNER?.trim() || "";
  const ghRepo = process.env.GITHUB_REPO_NAME?.trim() || "";

  if (!ghToken || !ghOwner || !ghRepo) {
    return NextResponse.json(
      {
        error: "github_actions_not_configured",
        message_ar:
          "خدمة بناء التطبيقات غير متاحة حالياً. تواصل مع الدعم.",
        message_en:
          "App builds are currently unavailable. Please contact support.",
      },
      { status: 503 },
    );
  }

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
          "خدمة بناء التطبيقات غير متاحة حالياً.",
        message_en:
          "App builds are currently unavailable.",
      },
      { status: 500 },
    );
  }

  const appIdSuffix = slugToAppIdSuffix(activeStore.slug);
  const packageId = `com.whitelabel.commerce${appIdSuffix}`;
  const workflowPageUrl = `https://github.com/${encodeURIComponent(ghOwner)}/${encodeURIComponent(ghRepo)}/actions/workflows/build-store-apk.yml`;

  const { data: created, error: insertError } = await serviceDb
    .rpc("queue_store_apk", { p_store: activeStore.store_id, p_requester: user.id, p_name: appName,
      p_suffix: appIdSuffix, p_package: packageId, p_icon: rawIcon || null, p_workflow: workflowPageUrl })
    .select(BUILD_SELECT)
    .single<StoreAppBuildRow>();

  if (insertError || !created) {
    if (insertError?.code === "42501") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const failure = quotaFailure(insertError);
    if (failure) return quotaResponse(failure);
    if (insertError?.message === "build_in_progress") return NextResponse.json({ error: "build_in_progress",
      message_en: "An APK build is already in progress for this store.", message_ar: "يوجد طلب بناء قيد التنفيذ لهذا المتجر." }, { status: 409 });
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

  // Dispatch the exact version reserved by PostgreSQL.
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
      version_code: String(created.version_code),
      version_name: created.version_name,
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
        error_message: "build_failed",
        updated_at: nowIso,
        completed_at: nowIso,
      })
      .eq("id", created.id);
    return NextResponse.json(
      {
        error: "github_network_error",
        message_ar: "تعذر بدء البناء. حاول مرة أخرى.",
        message_en: "Could not start the build. Please try again.",
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
        error_message: "build_failed",
        updated_at: nowIso,
        completed_at: nowIso,
      })
      .eq("id", created.id);

    return NextResponse.json(
      {
        error: "github_dispatch_failed",
        message_ar: "تعذر بدء البناء. حاول مرة أخرى.",
        message_en: "Could not start the build. Please try again.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ build: created }, { status: 201 });
}
