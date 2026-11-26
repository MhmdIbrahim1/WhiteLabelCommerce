import { hasStorePermission } from "@/lib/access";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverDb } from "@/lib/db";
import { getResourceAllowance } from "@/lib/billing-data";
import { validateImageMagicBytes } from "@/lib/security";
import {
  ADMIN_STORE_COOKIE,
  DEFAULT_STORE_ID,
  getManagedStores,
} from "@/lib/tenant";

const MAX_ICON_BYTES = 2 * 1024 * 1024; // 2 MB

function isValidStoreIconPath(storeId: string, candidate: string): boolean {
  if (!candidate || candidate.includes("..")) return false;
  const strictRe = new RegExp(
    `^app-icons/${storeId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp)$`,
    "i",
  );
  return strictRe.test(candidate);
}

async function resolveActiveAdminStore() {
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
  if (rpcErr) return { error: NextResponse.json({ error: "billing_unavailable",
    message_en: "Builder access is temporarily unavailable.", message_ar: "تعذّر التحقق من إتاحة البناء مؤقتاً." }, { status: 503 }) };
  const unlocked = unlockedRpc === true;

  if (!unlocked) {
    const billing = await getResourceAllowance(activeStore.store_id, "apk_builds");
    return {
      error: NextResponse.json(
        {
          error: "feature_not_in_plan",
          code: "feature_not_in_plan", resource: "apk_builds", current: billing.used, limit: 0,
          message_ar:
            "بناء تطبيق أندرويد معطّل لهذا المتجر.",
          message_en:
            "The Android builder is disabled for this store.",
        },
        { status: 403 },
      ),
    };
  }

  return { db, activeStore };
}

export async function POST(req: Request) {
  const ctx = await resolveActiveAdminStore();
  if ("error" in ctx) return ctx.error;
  const { db, activeStore } = ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      {
        error: "invalid_form_data",
        message_ar: "تعذر قراءة ملف الصورة المرفوع.",
        message_en: "Could not read the uploaded file.",
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json(
      {
        error: "missing_file",
        message_ar: "يرجى اختيار صورة صالحة.",
        message_en: "Please select a valid image file.",
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_ICON_BYTES) {
    return NextResponse.json(
      {
        error: "file_too_large",
        message_ar: "حجم الصورة يتجاوز الحد الأقصى (2 ميجابايت).",
        message_en: "Image exceeds the 2 MB maximum file size.",
      },
      { status: 400 },
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const verified = validateImageMagicBytes(buffer);
  if (!verified) {
    return NextResponse.json(
      {
        error: "unsupported_type",
        message_ar: "نوع الملف غير مدعوم. الصيغ المسموحة: PNG أو JPG أو WEBP.",
        message_en: "Unsupported file format. Allowed formats: PNG, JPG, or WEBP.",
      },
      { status: 400 },
    );
  }

  const storagePath = `app-icons/${activeStore.store_id}/${crypto.randomUUID()}.${verified.ext}`;

  const bucket = db.storage.from("product-images");
  const { error: uploadError } = await bucket.upload(storagePath, buffer, {
    contentType: verified.mime,
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json(
      {
        error: "upload_failed",
        message_ar: "تعذر رفع الصورة إلى الخادم. حاول مرة أخرى.",
        message_en: "Could not upload the icon image. Please try again.",
      },
      { status: 500 },
    );
  }

  const { data: publicData } = bucket.getPublicUrl(storagePath);
  const previousPath = String(formData.get("previousPath") ?? "").trim();
  if (isValidStoreIconPath(activeStore.store_id, previousPath)) {
    await bucket.remove([previousPath]).catch(() => undefined);
  }

  return NextResponse.json(
    {
      url: publicData.publicUrl,
      path: storagePath,
    },
    { status: 201 },
  );
}

export async function DELETE(req: Request) {
  const ctx = await resolveActiveAdminStore();
  if ("error" in ctx) return ctx.error;
  const { db, activeStore } = ctx;

  let body: { path?: unknown } = {};
  try {
    body = (await req.json()) as { path?: unknown };
  } catch {
    return NextResponse.json({ ok: true });
  }

  const path = String(body.path ?? "").trim();
  if (!isValidStoreIconPath(activeStore.store_id, path)) {
    return NextResponse.json({ ok: true });
  }

  await db.storage
    .from("product-images")
    .remove([path])
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
