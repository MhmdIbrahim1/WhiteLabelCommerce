"use server";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { templates, isTemplate } from "@/lib/theme-templates";
import {
  resolveUiConfig,
  uiConfigFromTemplate,
  type StoreUiConfig,
} from "@/lib/ui-config";
import {
  buildTrackingUrl,
  isSafeHttpUrl,
  resolveCarrierLabel,
} from "@/lib/shipping";
import { requireAdmin } from "@/lib/db";
import { normalizeSpecs } from "@/lib/specs";
import { nextOrder, nextTicket } from "@/lib/workflow";

const catalog = "/admin/products";
const text = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
const list = (value: string) => [
  ...new Set(
    value
      .split(/[,،\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
function finish(path: string, success: boolean): never {
  if (success) {
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
  }
  redirect(path + "?result=" + (success ? "ok" : "error"));
}
function numberField(value: string, integer = false) {
  const n = Number(value);
  return value &&
    Number.isFinite(n) &&
    n >= 0 &&
    (!integer || Number.isSafeInteger(n))
    ? n
    : null;
}
export async function saveCategory(f: FormData) {
  const { db } = await requireAdmin(),
    id = text(f, "id");
  const row = {
    name: text(f, "name"),
    name_en: text(f, "name_en"),
    slug: text(f, "slug"),
  };
  if (!row.name || !row.slug) finish(catalog, false);
  const q = db.from("categories");
  const result = await (id ? q.update(row).eq("id", id) : q.insert(row))
    .select("id")
    .single();
  finish(catalog, !result.error);
}
export async function deleteCategory(f: FormData) {
  const { db } = await requireAdmin();
  const result = await db
    .from("categories")
    .delete()
    .eq("id", text(f, "id"))
    .select("id")
    .single();
  finish(catalog, !result.error);
}
export async function saveProduct(f: FormData) {
  const { db } = await requireAdmin(),
    id = text(f, "id"),
    oldPrice = text(f, "old_price"),
    costPriceRaw = text(f, "cost_price");
  const price = numberField(text(f, "price")),
    stock = numberField(text(f, "stock"), true),
    costPrice = costPriceRaw ? numberField(costPriceRaw) : 0;
  let parsedSpecs: ReturnType<typeof normalizeSpecs> = [];
  const rawSpecs = text(f, "specifications");
  if (rawSpecs) {
    try {
      parsedSpecs = normalizeSpecs(JSON.parse(rawSpecs));
    } catch {
      parsedSpecs = [];
    }
  }
  const row = {
    name: text(f, "name"),
    name_en: text(f, "name_en"),
    slug: text(f, "slug"),
    description: text(f, "description"),
    description_en: text(f, "description_en"),
    category_id: text(f, "category_id"),
    price,
    cost_price: costPrice ?? 0,
    stock,
    old_price: oldPrice ? numberField(oldPrice) : null,
    sizes: list(text(f, "sizes")),
    colors: list(text(f, "colors")),
    specifications: parsedSpecs,
    is_active: f.has("is_active"),
  };
  if (
    !row.name ||
    !row.slug ||
    !row.category_id ||
    price === null ||
    stock === null ||
    costPrice === null ||
    (oldPrice && row.old_price === null)
  )
    finish(catalog, false);
  const bucket = db.storage.from("product-images");
  const file = f.get("image");
  let image: string | undefined;
  if (file instanceof File && file.size) {
    const extensions: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    if (!Object.hasOwn(extensions, file.type) || file.size > 5 * 1024 * 1024)
      finish(catalog, false);
    image = "products/" + crypto.randomUUID() + "." + extensions[file.type];
    const uploaded = await bucket.upload(image, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploaded.error) finish(catalog, false);
  }
  const previous = text(f, "previous_image");
  const values = image ? { ...row, image_path: image } : row;
  const products = db.from("products");
  let update = products.update(values).eq("id", id);
  if (image)
    update = previous
      ? update.eq("image_path", previous)
      : update.is("image_path", null);
  const result = await (id ? update : products.insert(values))
    .select("id")
    .single();
  if (result.error && image) await bucket.remove([image]);
  if (!result.error && image && id && previous.startsWith("products/"))
    await bucket.remove([previous]);
  finish(catalog, !result.error);
}
export async function deleteProduct(f: FormData) {
  const { db } = await requireAdmin();
  const result = await db
    .from("products")
    .delete()
    .eq("id", text(f, "id"))
    .select("image_path")
    .single();
  if (result.data?.image_path && result.data.image_path.startsWith("products/"))
    await db.storage.from("product-images").remove([result.data.image_path]);
  finish(catalog, !result.error);
}
export async function updateOrder(f: FormData) {
  const { db } = await requireAdmin(),
    id = text(f, "id"),
    prev = text(f, "previous"),
    status = text(f, "status"),
    returnTo = text(f, "return_to");
  const destination =
    returnTo === "/admin/orders"
      ? "/admin/orders"
      : "/admin/orders/" + encodeURIComponent(id);

  const allowSameShippedEdit = prev === "shipped" && status === "shipped";
  if (
    !id ||
    !Object.hasOwn(nextOrder, prev) ||
    (!allowSameShippedEdit && !nextOrder[prev].includes(status))
  ) {
    finish(destination, false);
  }

  const updatePayload: Record<string, unknown> = { status };

  if (status === "confirmed" || status === "shipped") {
    const existingToken = text(f, "existing_delivery_token");
    if (!existingToken) {
      updatePayload.delivery_token = randomBytes(24).toString("hex");
    }
  }

  if (status === "shipped") {
    const carrierPreset = text(f, "carrier_preset");
    const customCarrier = text(f, "custom_carrier");
    const trackingNumber = text(f, "tracking_number");
    const rawTrackingUrl = text(f, "tracking_url");
    const courierNote = text(f, "courier_note");

    if (rawTrackingUrl && !isSafeHttpUrl(rawTrackingUrl)) {
      finish(destination, false);
    }

    const carrierLabel = resolveCarrierLabel(carrierPreset, customCarrier);
    const computedUrl = buildTrackingUrl(
      carrierPreset || carrierLabel || "",
      trackingNumber,
      rawTrackingUrl,
    );

    updatePayload.shipping_carrier = carrierLabel;
    updatePayload.tracking_number = trackingNumber || null;
    updatePayload.tracking_url = computedUrl;
    updatePayload.courier_note = courierNote || null;
    if (prev !== "shipped") {
      updatePayload.shipped_at = new Date().toISOString();
    }
  }

  if (status === "delivered") {
    updatePayload.delivered_at = new Date().toISOString();
  }

  const result = await db
    .from("orders")
    .update(updatePayload)
    .eq("id", id)
    .eq("status", prev)
    .select("id")
    .single();

  if (!result.error) {
    revalidatePath("/orders");
    revalidatePath("/products");
    revalidatePath("/");
  }
  finish(destination, !result.error);
}

export async function ensureDeliveryToken(f: FormData) {
  const { db } = await requireAdmin(),
    id = text(f, "id");
  const destination = "/admin/orders/" + encodeURIComponent(id);
  if (!id) finish("/admin/orders", false);
  const token = randomBytes(24).toString("hex");
  const result = await db
    .from("orders")
    .update({ delivery_token: token })
    .eq("id", id)
    .is("delivery_token", null)
    .select("id")
    .maybeSingle();
  finish(destination, !result.error);
}
export async function updateTicket(f: FormData) {
  const { db } = await requireAdmin(),
    id = text(f, "id"),
    prev = text(f, "previous"),
    status = text(f, "status");
  if (
    !Object.hasOwn(nextTicket, prev) ||
    (status !== prev && !nextTicket[prev].includes(status))
  )
    finish("/admin/tickets", false);
  const result = await db
    .from("support_tickets")
    .update({ admin_reply: text(f, "reply"), status })
    .eq("id", id)
    .eq("status", prev)
    .eq("admin_reply", text(f, "previous_reply"))
    .select("id")
    .single();
  finish("/admin/tickets", !result.error);
}
export async function saveSettings(f: FormData) {
  const { db } = await requireAdmin();
  const banners = text(f, "banners")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const fee = numberField(text(f, "shipping_fee"));
  if (
    !text(f, "store_name") ||
    fee === null ||
    banners.some((s) => !URL.canParse(s) || new URL(s).protocol !== "https:")
  )
    finish("/admin/settings", false);
  const result = await db
    .from("store_settings")
    .update({
      store_name: text(f, "store_name"),
      shipping_fee: fee,
      whatsapp_number: text(f, "whatsapp_number"),
      banners,
    })
    .eq("id", true)
    .select("id")
    .single();
  finish("/admin/settings", !result.error);
}

export async function savePaymentSettings(f: FormData) {
  const { db } = await requireAdmin();

  const { data: storeRow, error: storeErr } = await db
    .from("store_settings")
    .select("store_id")
    .eq("id", true)
    .single<{ store_id: string }>();

  if (storeErr || !storeRow?.store_id) {
    finish("/admin/settings", false);
  }

  const codEnabled = f.has("cod_enabled");
  const paymobEnabled = f.has("paymob_enabled");
  const paymobCardEnabled = f.has("paymob_card_enabled");
  const paymobWalletEnabled = f.has("paymob_wallet_enabled");

  const flagsRes = await db
    .from("store_settings")
    .update({
      cod_enabled: codEnabled,
      paymob_enabled: paymobEnabled,
      paymob_card_enabled: paymobCardEnabled,
      paymob_wallet_enabled: paymobWalletEnabled,
    })
    .eq("id", true)
    .select("store_id")
    .single();

  if (flagsRes.error) {
    finish("/admin/settings", false);
  }

  const { data: existing } = await db
    .from("store_payment_secrets")
    .select("paymob_api_key,paymob_hmac_secret")
    .eq("store_id", storeRow.store_id)
    .maybeSingle<{
      paymob_api_key: string | null;
      paymob_hmac_secret: string | null;
    }>();

  const newApiKey = text(f, "paymob_api_key");
  const newHmacSecret = text(f, "paymob_hmac_secret");
  const cardIntegrationId = text(f, "paymob_card_integration_id");
  const walletIntegrationId = text(f, "paymob_wallet_integration_id");
  const iframeId = text(f, "paymob_iframe_id");

  const secretUpsert = await db
    .from("store_payment_secrets")
    .upsert(
      {
        store_id: storeRow.store_id,
        paymob_api_key: newApiKey || existing?.paymob_api_key || null,
        paymob_hmac_secret: newHmacSecret || existing?.paymob_hmac_secret || null,
        paymob_card_integration_id: cardIntegrationId || null,
        paymob_wallet_integration_id: walletIntegrationId || null,
        paymob_iframe_id: iframeId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" },
    )
    .select("store_id")
    .single();

  finish("/admin/settings", !secretUpsert.error);
}
export async function applyTemplate(form: FormData) {
  const { db } = await requireAdmin();
  const id = form.get("template");
  if (!isTemplate(id)) finish("/admin/settings", false);
  const preset = templates[id];
  const uiConfig = uiConfigFromTemplate(id);
  const primaryUpdate = await db
    .from("store_settings")
    .update({
      theme_template: id,
      primary_color: preset.primary,
      secondary_color: preset.accent,
      surface_color: preset.surface,
      border_radius: preset.radius,
      ui_config: uiConfig,
    })
    .eq("id", true)
    .select("id")
    .single();
  let error = primaryUpdate.error;
  if (error?.code === "42703" || error?.code === "PGRST204") {
    const fallback = await db
      .from("store_settings")
      .update({
        theme_template: id,
        primary_color: preset.primary,
        secondary_color: preset.accent,
        surface_color: preset.surface,
        border_radius: preset.radius,
      })
      .eq("id", true)
      .select("id")
      .single();
    error = fallback.error;
  }
  if (!error) revalidatePath("/", "layout");
  finish("/admin/settings", !error);
}

export type SaveUiConfigResult =
  | { ok: true; config: StoreUiConfig }
  | { ok: false; error: string };

export type UploadHeroBannerResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadHeroBannerImage(
  f: FormData,
): Promise<UploadHeroBannerResult> {
  const { db } = await requireAdmin();
  const file = f.get("file");
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  if (
    !(file instanceof File) ||
    !file.size ||
    !Object.hasOwn(extensions, file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    return { ok: false, error: "invalid_file" };
  }

  const { data: storeRow } = await db
    .from("store_settings")
    .select("store_id")
    .eq("id", true)
    .maybeSingle<{ store_id: string }>();

  const storePrefix = storeRow?.store_id || "default";
  const path = `banners/${storePrefix}/${crypto.randomUUID()}.${extensions[file.type]}`;
  const bucket = db.storage.from("product-images");
  const uploaded = await bucket.upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploaded.error) {
    return { ok: false, error: "upload_failed" };
  }
  const { data } = bucket.getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

export async function saveUiConfig(
  raw: unknown,
): Promise<SaveUiConfigResult> {
  const { db } = await requireAdmin();
  const config = resolveUiConfig(raw);
  const { error } = await db
    .from("store_settings")
    .update({
      theme_template: config.baseTemplate,
      primary_color: config.global.primaryButtonBg,
      secondary_color: config.global.accentBadge,
      surface_color: config.global.cardSurface,
      border_radius: config.global.borderRadius,
      ui_config: config,
    })
    .eq("id", true)
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      error:
        error.code === "42703" || error.code === "PGRST204"
          ? "لم يتم تطبيق ترحيل قاعدة البيانات (ui_config) بعد."
          : "تعذر حفظ ونشر تعديلات التصميم. حاول مرة أخرى.",
    };
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true, config };
}


export async function saveCustomerNotes(f: FormData) {
  const { db } = await requireAdmin();
  const id = text(f, "id");
  const notes = text(f, "notes").slice(0, 1000);
  if (!id) finish("/admin/customers", false);
  const { error } = await db
    .from("store_customers")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .single();
  finish("/admin/customers", !error);
}

export async function saveCoupon(f: FormData) {
  const { db } = await requireAdmin();
  const id = text(f, "id");
  const code = text(f, "code").toUpperCase();
  const discountType = text(f, "discount_type");
  const discountValue = numberField(text(f, "discount_value"));
  const minOrderRaw = text(f, "min_order_amount");
  const minOrder = minOrderRaw ? numberField(minOrderRaw) : 0;
  const maxUsesRaw = text(f, "max_uses");
  const maxUses = maxUsesRaw ? numberField(maxUsesRaw, true) : null;
  const expiresRaw = text(f, "expires_at");
  const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;
  const isActive = f.has("is_active");

  if (
    code.length < 2 ||
    code.length > 40 ||
    (discountType !== "percent" && discountType !== "fixed") ||
    discountValue === null ||
    discountValue <= 0 ||
    (discountType === "percent" && discountValue > 100) ||
    minOrder === null ||
    (maxUsesRaw && (maxUses === null || maxUses < 1))
  ) {
    finish("/admin/coupons", false);
  }

  const row = {
    code,
    discount_type: discountType,
    discount_value: discountValue,
    min_order_amount: minOrder,
    max_uses: maxUses,
    expires_at: expiresAt,
    is_active: isActive,
  };

  const q = db.from("coupons");
  const result = await (id ? q.update(row).eq("id", id) : q.insert(row))
    .select("id")
    .single();
  finish("/admin/coupons", !result.error);
}

export async function toggleCoupon(f: FormData) {
  const { db } = await requireAdmin();
  const id = text(f, "id");
  const nextActive = text(f, "next_active") === "true";
  if (!id) finish("/admin/coupons", false);
  const { error } = await db
    .from("coupons")
    .update({ is_active: nextActive })
    .eq("id", id)
    .select("id")
    .single();
  finish("/admin/coupons", !error);
}

export async function deleteCoupon(f: FormData) {
  const { db } = await requireAdmin();
  const id = text(f, "id");
  if (!id) finish("/admin/coupons", false);
  const { error } = await db
    .from("coupons")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  finish("/admin/coupons", !error);
}
