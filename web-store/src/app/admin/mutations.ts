"use server";
import { actionError } from "@/lib/action-error";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
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
import { ADMIN_STORE_COOKIE } from "@/lib/tenant-shared";
import { adminDb } from "@/lib/supabase/admin";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import {
  notifyBackInStock,
  notifyOrderStatusChanged,
  notifyReturnStatusUpdate,
  notifyReviewReply,
  notifyWalletCashback,
  notifyWishlistProductAlert,
  runRecoveryAutomations,
} from "@/lib/notifications/events";
import {
  validateGa4Id,
  validateMetaPixelId,
  validateTiktokPixelId,
} from "@/lib/marketing";
import type { ProductReview } from "@/lib/reviews-wishlist";
import { resolveEffectivePrice } from "@/lib/flash-sale";
import { normalizeSpecs } from "@/lib/specs";
import { nextOrder, nextTicket, pagination } from "@/lib/workflow";
import { safeRelativePath, validateImageMagicBytes } from "@/lib/security";

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
function finish(path: string, success: boolean, code?: string): never {
  if (success) {
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
  }
  redirect(path + (path.includes("?") ? "&result=" : "?result=") + (code ?? (success ? "ok" : "error")));
}

export async function switchAdminStore(nextStoreId: string): Promise<{ ok: boolean }> {
  const { managedStores } = await requireAdmin();
  const cleanId = (nextStoreId ?? "").trim();
  if (!managedStores.some((s) => s.store_id === cleanId)) {
    return { ok: false };
  }
  const jar = await cookies();
  jar.set(ADMIN_STORE_COOKIE, cleanId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
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
  const { db, storeId } = await requireAdmin(),
    id = text(f, "id");
  const row = {
    name: text(f, "name"),
    name_en: text(f, "name_en"),
    slug: text(f, "slug"),
  };
  if (!row.name || !row.slug) finish(catalog, false);
  const q = db.from("categories");
  const result = await (id
    ? q.update(row).eq("id", id).eq("store_id", storeId)
    : q.insert({ ...row, store_id: storeId })
  )
    .select("id")
    .single();
  finish(catalog, !result.error);
}
export async function deleteCategory(f: FormData) {
  const { db, storeId } = await requireAdmin();
  const result = await db
    .from("categories")
    .delete()
    .eq("id", text(f, "id"))
    .eq("store_id", storeId)
    .select("id")
    .single();
  finish(catalog, !result.error);
}
function productListDestination(form: FormData) {
  const params = new URLSearchParams();
  const q = text(form, "q").slice(0, 100);
  const { page } = pagination(text(form, "page"));
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  return params.size ? catalog + "?" + params : catalog;
}

function orderLimitField(form: FormData, name: string, destination: string) {
  if (!form.has(name)) return {};
  const raw = text(form, name);
  if (raw && (!/^[1-9]\d*$/.test(raw) || Number(raw) > 2147483647)) finish(destination, false);
  return { [name]: raw ? Number(raw) : null };
}

export async function saveProduct(f: FormData) {
  const destination = productListDestination(f);
  const { db, storeId, activeStore } = await requireAdmin(),
    id = text(f, "id"),
    oldPrice = text(f, "old_price"),
    costPriceRaw = text(f, "cost_price"),
    flashPriceRaw = text(f, "flash_sale_price"),
    flashStartsRaw = text(f, "flash_sale_starts_at"),
    flashEndsRaw = text(f, "flash_sale_ends_at");
  const price = numberField(text(f, "price")),
    stock = numberField(text(f, "stock"), true),
    costPrice = costPriceRaw ? numberField(costPriceRaw) : 0;

  let flashSalePrice: number | null = null;
  let flashSaleStartsAt: string | null = null;
  let flashSaleEndsAt: string | null = null;

  if (flashPriceRaw) {
    const parsedFlash = numberField(flashPriceRaw);
    if (
      parsedFlash === null ||
      parsedFlash <= 0 ||
      (price !== null && parsedFlash >= price)
    ) {
      finish(destination, false);
    }
    flashSalePrice = parsedFlash;
  }

  if (flashStartsRaw) {
    const ms = Date.parse(flashStartsRaw);
    if (!Number.isFinite(ms)) finish(destination, false);
    flashSaleStartsAt = new Date(ms).toISOString();
  }

  if (flashEndsRaw) {
    const ms = Date.parse(flashEndsRaw);
    if (!Number.isFinite(ms)) finish(destination, false);
    flashSaleEndsAt = new Date(ms).toISOString();
  }

  if (flashSalePrice !== null && !flashSaleEndsAt) {
    finish(destination, false);
  }
  if (
    flashSaleStartsAt &&
    flashSaleEndsAt &&
    Date.parse(flashSaleEndsAt) <= Date.parse(flashSaleStartsAt)
  ) {
    finish(destination, false);
  }
  if (flashSalePrice === null) {
    flashSaleStartsAt = null;
    flashSaleEndsAt = null;
  }

  let parsedSpecs: ReturnType<typeof normalizeSpecs> = [];
  const rawSpecs = text(f, "specifications");
  if (rawSpecs) {
    try {
      parsedSpecs = normalizeSpecs(JSON.parse(rawSpecs));
    } catch {
      parsedSpecs = [];
    }
  }
  const imagePaths = [...new Set(text(f, "image_paths").split(/\r?\n/).map((v) => v.trim()).filter(Boolean))];
  if (imagePaths.some((url) => !URL.canParse(url) || new URL(url).protocol !== "https:")) {
    finish(destination, false);
  }
  const row = {
    ...(f.has("image_paths") && { image_paths: imagePaths.length ? imagePaths : null }),
    name: text(f, "name"),
    name_en: text(f, "name_en"),
    slug: text(f, "slug"),
    description: text(f, "description"),
    description_en: text(f, "description_en"),
    category_id: text(f, "category_id"),
    price,
    cost_price: costPrice ?? 0,
    ...orderLimitField(f, "max_order_qty", destination),
    stock,
    old_price: oldPrice ? numberField(oldPrice) : null,
    flash_sale_price: flashSalePrice,
    flash_sale_starts_at: flashSaleStartsAt,
    flash_sale_ends_at: flashSaleEndsAt,
    sizes: list(text(f, "sizes")),
    colors: list(text(f, "colors")),
    specifications: parsedSpecs,
    is_active: f.has("is_active"),
  };
  if (
    !row.name ||
    !row.slug ||
    !row.category_id ||
    !UUID_REGEX.test(row.category_id) ||
    price === null ||
    stock === null ||
    costPrice === null ||
    (oldPrice && row.old_price === null)
  )
    finish(destination, false);

  // Verify category_id strictly belongs to the active store
  const { data: ownedCategory } = await db
    .from("categories")
    .select("id")
    .eq("id", row.category_id)
    .eq("store_id", storeId)
    .maybeSingle<{ id: string }>();
  if (!ownedCategory) {
    finish(destination, false);
  }

  // Enforce plan max_products cap before uploading/inserting a new product
  if (!id) {
    const { count } = await db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);
    if ((count ?? 0) >= activeStore.max_products) {
      finish(destination, false, "limit_reached");
    }
  }

  const bucket = db.storage.from("product-images");
  const file = f.get("image");
  let image: string | undefined;
  if (file instanceof File && file.size) {
    if (file.size > 5 * 1024 * 1024) finish(destination, false);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const verified = validateImageMagicBytes(bytes);
    if (!verified) finish(destination, false);
    image = `${storeId}/products/${crypto.randomUUID()}.${verified.ext}`;
    const uploaded = await bucket.upload(image, bytes, {
      contentType: verified.mime,
      upsert: false,
    });
    if (uploaded.error) finish(destination, false);
  }
  const previous = text(f, "previous_image");
  let previousStock: number | null = null;
  let previousEffectivePrice: number | null = null;
  if (id) {
    const { data: existingProd } = await db
      .from("products")
      .select(
        "stock,price,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at",
      )
      .eq("id", id)
      .eq("store_id", storeId)
      .maybeSingle<{
        stock: number;
        price: number;
        flash_sale_price: number | null;
        flash_sale_starts_at: string | null;
        flash_sale_ends_at: string | null;
      }>();
    if (existingProd) {
      previousStock = Number(existingProd.stock ?? 0);
      previousEffectivePrice = resolveEffectivePrice({
        price: Number(existingProd.price ?? 0),
        flash_sale_price: existingProd.flash_sale_price,
        flash_sale_starts_at: existingProd.flash_sale_starts_at,
        flash_sale_ends_at: existingProd.flash_sale_ends_at,
      });
    }
  }
  const values = image ? { ...row, image_path: image } : row;
  const result = await db.rpc("save_catalog_product", {
    p_store: storeId, p_id: id || null, p_fields: { ...values, color_images: JSON.parse(text(f, "color_images") || "{}") },
    p_variants: JSON.parse(text(f, "variants") || "[]"),
    p_original_variants: JSON.parse(text(f, "original_variants") || "[]"),
    p_original_stock: Number(text(f, "original_stock")), p_previous_image: previous,
  });
  if (result.error && image) await bucket.remove([image]);
  if (
    !result.error &&
    image &&
    id &&
    !previous.includes("..") &&
    (previous.startsWith(`${storeId}/products/`) ||
      previous.startsWith("products/"))
  )
    await bucket.remove([previous]).catch(() => undefined);
  if (result.error?.message?.includes("store_product_limit_reached")) {
    finish(destination, false, "limit_reached");
  }
  if (!result.error && id) {
    if (previousStock !== null && previousStock <= 0 && stock > 0) {
      void notifyBackInStock(id, storeId);
      void notifyWishlistProductAlert({
        storeId,
        productId: id,
        kind: "restock",
      });
    }
    const nextEffectivePrice = resolveEffectivePrice({
      price,
      flash_sale_price: flashSalePrice,
      flash_sale_starts_at: flashSaleStartsAt,
      flash_sale_ends_at: flashSaleEndsAt,
    });
    if (
      previousEffectivePrice !== null &&
      nextEffectivePrice < previousEffectivePrice
    ) {
      void notifyWishlistProductAlert({
        storeId,
        productId: id,
        kind: "price_drop",
        oldPrice: previousEffectivePrice,
        newPrice: nextEffectivePrice,
      });
    }
  }
  finish(destination, !result.error);
}
export async function deleteProduct(f: FormData) {
  const destination = productListDestination(f);
  const { db, storeId } = await requireAdmin();
  const result = await db
    .from("products")
    .delete()
    .eq("id", text(f, "id"))
    .eq("store_id", storeId)
    .select("image_path")
    .single();
  if (
    result.data?.image_path &&
    !result.data.image_path.includes("..") &&
    (result.data.image_path.startsWith(`${storeId}/products/`) ||
      result.data.image_path.startsWith("products/"))
  )
    await db.storage
      .from("product-images")
      .remove([result.data.image_path])
      .catch(() => undefined);
  finish(destination, !result.error);
}
export async function updateOrder(f: FormData) {
  const { db, storeId } = await requireAdmin(),
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
    .eq("store_id", storeId)
    .eq("status", prev)
    .select("id,store_id,user_id,currency,wallet_discount")
    .single<{
      id: string;
      store_id: string;
      user_id: string | null;
      currency: string;
      wallet_discount: number | null;
    }>();

  if (!result.error && result.data) {
    const orderRow = result.data;
    if (status === "delivered" && orderRow.user_id) {
      try {
        const svc = adminDb();
        const { data: cbData } = await svc.rpc("award_order_cashback", {
          p_store_id: orderRow.store_id,
          p_order_id: id,
          p_create_notification: false,
        });
        const cbRow = Array.isArray(cbData)
          ? (cbData[0] as
              | {
                  awarded?: boolean;
                  amount?: number;
                  balance_after?: number;
                  user_id?: string;
                }
              | undefined)
          : (cbData as
              | {
                  awarded?: boolean;
                  amount?: number;
                  balance_after?: number;
                  user_id?: string;
                }
              | null);
        if (cbRow?.awarded && Number(cbRow.amount ?? 0) > 0 && cbRow.user_id) {
          void notifyWalletCashback({
            storeId: orderRow.store_id,
            userId: cbRow.user_id,
            orderId: id,
            amount: Number(cbRow.amount),
            balanceAfter: Number(cbRow.balance_after ?? 0),
            currency: orderRow.currency || "EGP",
          });
        }
      } catch (err) {
        console.error("[wallet] award_order_cashback failed", {
          code: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    void notifyOrderStatusChanged({
      orderId: id,
      status,
      shippingCarrier:
        typeof updatePayload.shipping_carrier === "string"
          ? updatePayload.shipping_carrier
          : null,
      trackingNumber:
        typeof updatePayload.tracking_number === "string"
          ? updatePayload.tracking_number
          : null,
    });
    revalidatePath("/orders");
    revalidatePath("/account");
    revalidatePath("/admin/customers");
    revalidatePath("/products");
    revalidatePath("/");
  }
  finish(destination, !result.error);
}

export async function ensureDeliveryToken(f: FormData) {
  const { db, storeId } = await requireAdmin(),
    id = text(f, "id");
  const destination = "/admin/orders/" + encodeURIComponent(id);
  if (!id) finish("/admin/orders", false);
  const token = randomBytes(24).toString("hex");
  const result = await db
    .from("orders")
    .update({ delivery_token: token })
    .eq("id", id)
    .eq("store_id", storeId)
    .is("delivery_token", null)
    .select("id")
    .maybeSingle();
  finish(destination, !result.error);
}
export async function updateTicket(f: FormData) {
  const { db, storeId } = await requireAdmin(),
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
    .eq("store_id", storeId)
    .eq("status", prev)
    .eq("admin_reply", text(f, "previous_reply"))
    .select("id")
    .single();
  finish("/admin/tickets", !result.error);
}
export async function saveSettings(f: FormData) {
  const { db, storeId } = await requireAdmin();
  const banners = text(f, "banners")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const fee = numberField(text(f, "shipping_fee"));
  const returnWindowRaw = text(f, "return_window_days");
  const returnWindowDays = returnWindowRaw
    ? numberField(returnWindowRaw, true)
    : null;
  if (
    !text(f, "store_name") ||
    fee === null ||
    (returnWindowRaw && (returnWindowDays === null || returnWindowDays > 365)) ||
    banners.some((s) => !URL.canParse(s) || new URL(s).protocol !== "https:")
  )
    finish("/admin/settings", false);
  const payload: Record<string, unknown> = {
    store_name: text(f, "store_name"),
    shipping_fee: fee,
    ...orderLimitField(f, "default_max_order_qty", "/admin/settings"),
    whatsapp_number: text(f, "whatsapp_number"),
    banners,
  };
  if (returnWindowDays !== null) {
    payload.return_window_days = returnWindowDays;
  }
  const result = await db
    .from("store_settings")
    .update(payload)
    .eq("store_id", storeId)
    .select("store_id")
    .single();
  finish("/admin/settings", !result.error);
}

export async function saveReturnWindowDaysAction(
  daysRaw: number,
): Promise<{ ok: true; days: number } | { ok: false; error: string }> {
  const { db, storeId } = await requireAdmin();
  const days = Math.trunc(Number(daysRaw));
  if (!Number.isSafeInteger(days) || days < 0 || days > 365) {
    return { ok: false, error: "invalid_return_window_days" };
  }
  const { error } = await db
    .from("store_settings")
    .update({ return_window_days: days })
    .eq("store_id", storeId)
    .select("store_id")
    .single();
  if (error) {
    return { ok: false, error: "save_failed" };
  }
  revalidatePath("/admin/returns");
  revalidatePath("/admin/settings");
  return { ok: true, days };
}

export async function savePaymentSettings(f: FormData) {
  const { db, storeId } = await requireAdmin();

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
    .eq("store_id", storeId)
    .select("store_id")
    .single();

  if (flagsRes.error) {
    finish("/admin/settings", false);
  }

  const { data: existing } = await db
    .from("store_payment_secrets")
    .select("paymob_api_key,paymob_hmac_secret")
    .eq("store_id", storeId)
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
        store_id: storeId,
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

export async function saveWalletIncentiveSettings(f: FormData) {
  const { db, storeId } = await requireAdmin();

  const cartIncentiveEnabled = f.has("cart_incentive_enabled");
  const cashbackEnabled = f.has("cashback_enabled");
  const freeShippingThreshold = numberField(text(f, "free_shipping_threshold"));
  const cashbackPercentage = numberField(text(f, "cashback_percentage"));

  if (
    freeShippingThreshold === null ||
    cashbackPercentage === null ||
    cashbackPercentage < 0 ||
    cashbackPercentage > 50
  ) {
    finish("/admin/settings", false);
  }

  const res = await db
    .from("store_settings")
    .update({
      cart_incentive_enabled: cartIncentiveEnabled,
      free_shipping_threshold: freeShippingThreshold,
      cashback_enabled: cashbackEnabled,
      cashback_percentage: cashbackPercentage,
    })
    .eq("store_id", storeId)
    .select("store_id")
    .single();

  finish("/admin/settings", !res.error);
}

export type AdjustWalletResult =
  | { ok: true; transactionId: string; balanceAfter: number }
  | { ok: false; error: string };

export async function adjustCustomerWallet(input: {
  userId: string;
  amount: number;
  noteAr?: string;
  noteEn?: string;
}): Promise<AdjustWalletResult> {
  const { db, storeId } = await requireAdmin();
  const cleanUserId = (input.userId ?? "").trim();
  const amount = Number(input.amount);
  if (!UUID_REGEX.test(cleanUserId) || !Number.isFinite(amount) || amount === 0) {
    return { ok: false, error: "invalid_wallet_adjustment" };
  }

  const { data, error } = await db.rpc("admin_adjust_customer_wallet", {
    p_store_id: storeId,
    p_user_id: cleanUserId,
    p_amount: Math.round(amount * 100) / 100,
    p_note_ar: (input.noteAr ?? "").trim().slice(0, 300),
    p_note_en: (input.noteEn ?? "").trim().slice(0, 300),
  });

  if (error) {
    return {
      ok: false,
      error: actionError(error, "wallet_adjustment_failed", ["insufficient_wallet_balance"]),
    };
  }

  const row = Array.isArray(data)
    ? (data[0] as { transaction_id?: string; balance_after?: number } | undefined)
    : (data as { transaction_id?: string; balance_after?: number } | null);

  revalidatePath("/admin/customers");
  revalidatePath("/account");
  revalidatePath("/checkout");

  return {
    ok: true,
    transactionId: row?.transaction_id || crypto.randomUUID(),
    balanceAfter: Number(row?.balance_after ?? 0),
  };
}
export async function applyTemplate(form: FormData) {
  const { db, storeId } = await requireAdmin();
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
    .eq("store_id", storeId)
    .select("store_id")
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
      .eq("store_id", storeId)
      .select("store_id")
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
  const { db, storeId } = await requireAdmin();
  const file = f.get("file");
  if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "invalid_file" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const verified = validateImageMagicBytes(bytes);
  if (!verified) {
    return { ok: false, error: "invalid_file" };
  }

  const path = `${storeId}/banners/${crypto.randomUUID()}.${verified.ext}`;
  const bucket = db.storage.from("product-images");
  const uploaded = await bucket.upload(path, bytes, {
    contentType: verified.mime,
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
  const { db, storeId } = await requireAdmin();
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
    .eq("store_id", storeId)
    .select("store_id")
    .single();
  if (error) {
    return {
      ok: false,
      error: actionError(error, "publish_failed"),
    };
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true, config };
}


export async function saveCustomerNotes(f: FormData) {
  const { db, storeId } = await requireAdmin();
  const id = text(f, "id");
  const notes = text(f, "notes").slice(0, 1000);
  if (!id || !UUID_REGEX.test(id)) finish("/admin/customers", false);
  const { error } = await db.rpc("admin_update_customer_notes", {
    p_store_id: storeId,
    p_customer_id: id,
    p_notes: notes,
  });
  finish("/admin/customers", !error);
}

export async function saveCoupon(f: FormData) {
  const { db, storeId } = await requireAdmin();
  const id = text(f, "id");
  const code = text(f, "code").toUpperCase();
  const discountType = text(f, "discount_type");
  const discountValue = numberField(text(f, "discount_value"));
  const minOrderRaw = text(f, "min_order_amount");
  const minOrder = minOrderRaw ? numberField(minOrderRaw) : 0;
  const maxUsesRaw = text(f, "max_uses");
  const maxUses = maxUsesRaw ? numberField(maxUsesRaw, true) : null;
  const expiresRaw = text(f, "expires_at");
  let expiresAt: string | null = null;
  if (expiresRaw) {
    const ms = Date.parse(expiresRaw);
    if (!Number.isFinite(ms)) {
      finish("/admin/coupons", false);
    }
    expiresAt = new Date(ms).toISOString();
  }
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
  const result = await (id
    ? q.update(row).eq("id", id).eq("store_id", storeId)
    : q.insert({ ...row, store_id: storeId })
  )
    .select("id")
    .single();
  finish("/admin/coupons", !result.error);
}

export async function toggleCoupon(f: FormData) {
  const { db, storeId } = await requireAdmin();
  const id = text(f, "id");
  const nextActive = text(f, "next_active") === "true";
  if (!id) finish("/admin/coupons", false);
  const { error } = await db
    .from("coupons")
    .update({ is_active: nextActive })
    .eq("id", id)
    .eq("store_id", storeId)
    .select("id")
    .single();
  finish("/admin/coupons", !error);
}

export async function deleteCoupon(f: FormData) {
  const { db, storeId } = await requireAdmin();
  const id = text(f, "id");
  if (!id) finish("/admin/coupons", false);
  const { error } = await db
    .from("coupons")
    .delete()
    .eq("id", id)
    .eq("store_id", storeId)
    .select("id")
    .single();
  finish("/admin/coupons", !error);
}

export type CampaignSendResult =
  | {
      ok: true;
      recipientsCount: number;
      pushDelivered: number;
      suppressedByQuietHours: boolean;
    }
  | { ok: false; error: string };

export async function sendPromoCampaign(
  f: FormData,
): Promise<CampaignSendResult> {
  const { storeId } = await requireAdmin();

  const titleAr = text(f, "title_ar").slice(0, 120);
  const titleEn = text(f, "title_en").slice(0, 120);
  const bodyAr = text(f, "body_ar").slice(0, 400);
  const bodyEn = text(f, "body_en").slice(0, 400);
  const audience = text(f, "audience") || "all";
  const rawDeepLink = text(f, "deep_link") || "/";
  const deepLink = safeRelativePath(rawDeepLink, "/");
  const bypassQuietHours = f.get("bypass_quiet_hours") === "true";

  if (!titleAr || !titleEn || !bodyAr || !bodyEn) {
    return { ok: false, error: "missing_fields" };
  }
  if (!["all", "registered", "buyers"].includes(audience)) {
    return { ok: false, error: "invalid_audience" };
  }

  const svc = adminDb();
  const campaignId = `camp_${Date.now()}_${randomBytes(3).toString("hex")}`;

  try {
    if (audience === "all") {
      // Public broadcast notification row visible to all customers (logged-in + guests)
      // plus push dispatch to all active Android & Web push subscriptions for this store.
      const { data: activeSubs } = await svc
        .from("push_subscriptions")
        .select("token,platform,locale")
        .eq("store_id", storeId)
        .eq("is_active", true);

      const explicitTokens = ((activeSubs ?? []) as {
        token: string;
        platform: "android" | "web";
        locale: "ar" | "en";
      }[]).map((s) => ({
        token: s.token,
        platform: s.platform,
        locale: s.locale,
      }));

      const res = await dispatchNotification({
        storeId,
        userId: null,
        targetRole: "customer",
        category: "promo_campaign",
        titleAr,
        titleEn,
        bodyAr,
        bodyEn,
        deepLink,
        dedupeKey: `${campaignId}:broadcast`,
        explicitTokens,
        bypassQuietHours,
        data: { campaign_id: campaignId, audience: "all" },
      });

      revalidatePath("/admin/notifications");
      return {
        ok: true,
        recipientsCount: Math.max(1, explicitTokens.length),
        pushDelivered: res.pushDelivered,
        suppressedByQuietHours: res.suppressedByQuietHours,
      };
    }

    // Targeted audience: registered customers or active buyers
    let targetUserIds: string[] = [];
    if (audience === "registered") {
      const { data: profiles } = await svc
        .from("profiles")
        .select("id")
        .eq("store_id", storeId)
        .neq("role", "admin");
      targetUserIds = ((profiles ?? []) as { id: string }[]).map((p) => p.id);
    } else if (audience === "buyers") {
      const { data: buyerOrders } = await svc
        .from("orders")
        .select("user_id")
        .eq("store_id", storeId)
        .not("user_id", "is", null)
        .neq("status", "cancelled");
      targetUserIds = Array.from(
        new Set(
          ((buyerOrders ?? []) as { user_id: string | null }[])
            .map((o) => o.user_id)
            .filter((uid): uid is string => Boolean(uid)),
        ),
      );
    }

    if (targetUserIds.length === 0) {
      return { ok: false, error: "empty_audience" };
    }

    let pushDelivered = 0;
    let suppressed = false;
    for (const uid of targetUserIds) {
      const res = await dispatchNotification({
        storeId,
        userId: uid,
        targetRole: "customer",
        category: "promo_campaign",
        titleAr,
        titleEn,
        bodyAr,
        bodyEn,
        deepLink,
        dedupeKey: `${campaignId}:${uid}`,
        bypassQuietHours,
        data: { campaign_id: campaignId, audience },
      });
      pushDelivered += res.pushDelivered;
      if (res.suppressedByQuietHours) suppressed = true;
    }

    revalidatePath("/admin/notifications");
    return {
      ok: true,
      recipientsCount: targetUserIds.length,
      pushDelivered,
      suppressedByQuietHours: suppressed,
    };
  } catch (err) {
    console.error("[notifications] sendPromoCampaign failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, error: "dispatch_failed" };
  }
}

export async function triggerRecoveryScan(): Promise<{
  ok: boolean;
  abandonedCartsNotified: number;
  unpaidOrdersNotified: number;
}> {
  const { storeId } = await requireAdmin();
  const result = await runRecoveryAutomations(storeId);
  revalidatePath("/admin/notifications");
  return { ok: true, ...result };
}

export type DeleteAdminNotificationsInput = {
  ids?: string[];
  mode: "single" | "selected" | "read" | "all";
};

export type DeleteAdminNotificationsResult =
  | { ok: true; deletedCount: number }
  | { ok: false; error: string };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteAdminNotifications(
  input: DeleteAdminNotificationsInput,
): Promise<DeleteAdminNotificationsResult> {
  const { storeId } = await requireAdmin();
  const svc = adminDb();

  try {
    let query = svc
      .from("notifications")
      .delete()
      .eq("store_id", storeId)
      .eq("target_role", "admin");

    if (input.mode === "single" || input.mode === "selected") {
      const cleanIds = Array.from(
        new Set(
          (input.ids ?? [])
            .map((id) => (typeof id === "string" ? id.trim() : ""))
            .filter((id) => UUID_REGEX.test(id)),
        ),
      );
      if (cleanIds.length === 0) {
        return { ok: false, error: "invalid_ids" };
      }
      query = query.in("id", cleanIds);
    } else if (input.mode === "read") {
      query = query.or("is_read.eq.true,read_at.not.is.null");
    } else if (input.mode !== "all") {
      return { ok: false, error: "invalid_mode" };
    }

    const { data, error } = await query.select("id");
    if (error) {
      return { ok: false, error: "delete_failed" };
    }

    revalidatePath("/admin/notifications");
    return { ok: true, deletedCount: (data ?? []).length };
  } catch (err) {
    console.error("[notifications] deleteAdminNotifications failed", {
      code: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, error: "delete_failed" };
  }
}


export type ModerateReviewResult =
  | { ok: true; review: ProductReview }
  | { ok: false; error: string };

export async function moderateReviewAction(input: {
  reviewId: string;
  status: "published" | "hidden";
  adminReply?: string;
}): Promise<ModerateReviewResult> {
  const { db, storeId } = await requireAdmin();
  const cleanId = (input.reviewId ?? "").trim();
  if (!UUID_REGEX.test(cleanId)) {
    return { ok: false, error: "invalid_review" };
  }
  if (input.status !== "published" && input.status !== "hidden") {
    return { ok: false, error: "invalid_status" };
  }

  const rpcParams: {
    p_store_id: string;
    p_review_id: string;
    p_status: string;
    p_admin_reply?: string;
  } = {
    p_store_id: storeId,
    p_review_id: cleanId,
    p_status: input.status,
  };
  if (typeof input.adminReply === "string") {
    rpcParams.p_admin_reply = input.adminReply.trim().slice(0, 1500);
  }

  const { data, error } = await db.rpc("admin_moderate_review", rpcParams);
  if (error || !data) {
    return { ok: false, error: actionError(error, "moderate_review_failed") };
  }

  const updated = data as ProductReview;

  // Dispatch Phase 9 notification when merchant submits a non-empty reply
  if (
    typeof input.adminReply === "string" &&
    input.adminReply.trim().length > 0 &&
    updated.user_id &&
    updated.product_id
  ) {
    void notifyReviewReply({
      storeId,
      userId: updated.user_id,
      productId: updated.product_id,
      reviewId: updated.id,
      replyText: input.adminReply.trim(),
    });
  }

  revalidatePath("/admin/reviews");
  revalidatePath(`/products/${updated.product_id}`);
  revalidatePath("/products");
  revalidatePath("/");

  return { ok: true, review: updated };
}

export type ProcessReturnActionType =
  | "approve"
  | "reject"
  | "mark_received"
  | "complete_refund";

export type ProcessReturnResult =
  | {
      ok: true;
      returnRequest: {
        id: string;
        status: "pending" | "approved" | "rejected" | "received" | "refunded";
        admin_notes: string | null;
        restocked: boolean;
        wallet_credited: boolean;
        updated_at: string;
      };
    }
  | { ok: false; error: string };

export async function processReturnRequestAction(input: {
  returnId: string;
  action: ProcessReturnActionType;
  adminNotes?: string | null;
  restock?: boolean;
}): Promise<ProcessReturnResult> {
  const { db, storeId } = await requireAdmin();
  const cleanId = (input.returnId ?? "").trim();
  if (!UUID_REGEX.test(cleanId)) {
    return { ok: false, error: "invalid_return_id" };
  }
  if (
    input.action !== "approve" &&
    input.action !== "reject" &&
    input.action !== "mark_received" &&
    input.action !== "complete_refund"
  ) {
    return { ok: false, error: "invalid_return_action" };
  }

  // Enforce active admin store scoping before processing the return request
  const { data: ownedReturn } = await db
    .from("return_requests")
    .select("id")
    .eq("id", cleanId)
    .eq("store_id", storeId)
    .maybeSingle<{ id: string }>();

  if (!ownedReturn) {
    return { ok: false, error: "return_request_not_found" };
  }

  const rpcParams: {
    p_return_id: string;
    p_action: string;
    p_admin_notes?: string | null;
    p_restock: boolean;
  } = {
    p_return_id: cleanId,
    p_action: input.action,
    p_restock: input.restock ?? true,
  };
  if (typeof input.adminNotes === "string") {
    rpcParams.p_admin_notes = input.adminNotes.trim().slice(0, 1000);
  }

  const { data, error } = await db.rpc("admin_process_return_request", rpcParams);
  if (error || !data) {
    return {
      ok: false,
      error: actionError(error, "process_return_failed"),
    };
  }

  const row = data as {
    id: string;
    order_id?: string;
    status: "pending" | "approved" | "rejected" | "received" | "refunded";
    admin_notes: string | null;
    restocked: boolean;
    wallet_credited: boolean;
    updated_at: string;
  };

  if (
    row.status === "approved" ||
    row.status === "rejected" ||
    row.status === "received" ||
    row.status === "refunded"
  ) {
    await notifyReturnStatusUpdate({
      storeId,
      returnId: row.id,
      orderId: row.order_id,
      status: row.status,
      action: input.action,
    });
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/returns");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/products");
  revalidatePath("/admin/customers");
  revalidatePath("/orders");
  if (row.order_id) {
    revalidatePath(`/orders/${row.order_id}`);
    revalidatePath(`/admin/orders/${row.order_id}`);
  }
  revalidatePath("/account");

  return {
    ok: true,
    returnRequest: {
      id: row.id,
      status: row.status,
      admin_notes: row.admin_notes ?? null,
      restocked: Boolean(row.restocked),
      wallet_credited: Boolean(row.wallet_credited),
      updated_at: row.updated_at,
    },
  };
}

export type SaveMarketingPixelsResult =
  | {
      ok: true;
      metaPixelId: string;
      tiktokPixelId: string;
      ga4MeasurementId: string;
    }
  | { ok: false; error: string };

export async function saveMarketingPixelsAction(input: {
  metaPixelId: string;
  tiktokPixelId: string;
  ga4MeasurementId: string;
}): Promise<SaveMarketingPixelsResult> {
  const { db, storeId } = await requireAdmin();

  const meta = validateMetaPixelId(input.metaPixelId);
  const tiktok = validateTiktokPixelId(input.tiktokPixelId);
  const ga4 = validateGa4Id(input.ga4MeasurementId);

  if (!meta.valid) return { ok: false, error: "invalid_meta_pixel_id" };
  if (!tiktok.valid) return { ok: false, error: "invalid_tiktok_pixel_id" };
  if (!ga4.valid) return { ok: false, error: "invalid_ga4_measurement_id" };

  const { error } = await db
    .from("store_settings")
    .update({
      meta_pixel_id: meta.value || null,
      tiktok_pixel_id: tiktok.value || null,
      ga4_measurement_id: ga4.value || null,
    })
    .eq("store_id", storeId)
    .select("store_id")
    .single();

  if (error) {
    return { ok: false, error: actionError(error, "save_pixels_failed") };
  }

  revalidatePath("/admin/marketing");
  revalidatePath("/", "layout");

  return {
    ok: true,
    metaPixelId: meta.value,
    tiktokPixelId: tiktok.value,
    ga4MeasurementId: ga4.value,
  };
}

export type UpdateAbandonedCartResult =
  | {
      ok: true;
      cart: {
        id: string;
        status: "open" | "reminded" | "recovered" | "dismissed";
        reminder_count: number;
        last_reminded_at: string | null;
        recovery_coupon_code: string | null;
        updated_at: string;
      };
    }
  | { ok: false; error: string };

export async function updateAbandonedCartAction(input: {
  cartId: string;
  action: "mark_reminded" | "dismiss";
  couponCode?: string | null;
}): Promise<UpdateAbandonedCartResult> {
  const { db, storeId } = await requireAdmin();
  const cleanId = (input.cartId ?? "").trim();
  if (!UUID_REGEX.test(cleanId)) {
    return { ok: false, error: "invalid_cart_id" };
  }
  if (input.action !== "mark_reminded" && input.action !== "dismiss") {
    return { ok: false, error: "invalid_action" };
  }

  // Enforce active admin store scoping before mutating the abandoned cart
  const { data: ownedCart } = await db
    .from("abandoned_carts")
    .select("id")
    .eq("id", cleanId)
    .eq("store_id", storeId)
    .maybeSingle<{ id: string }>();

  if (!ownedCart) {
    return { ok: false, error: "abandoned_cart_not_found" };
  }

  const cleanCoupon =
    typeof input.couponCode === "string" && input.couponCode.trim()
      ? input.couponCode.trim().toUpperCase().slice(0, 40)
      : null;

  const { data, error } = await db.rpc("admin_update_abandoned_cart", {
    p_cart_id: cleanId,
    p_action: input.action,
    p_coupon_code: cleanCoupon,
  });

  if (error || !data) {
    return {
      ok: false,
      error: actionError(error, "update_abandoned_cart_failed"),
    };
  }

  const row = data as {
    id: string;
    status: "open" | "reminded" | "recovered" | "dismissed";
    reminder_count: number;
    last_reminded_at: string | null;
    recovery_coupon_code: string | null;
    updated_at: string;
  };

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/abandoned-carts");

  return {
    ok: true,
    cart: {
      id: row.id,
      status: row.status,
      reminder_count: Number(row.reminder_count ?? 0),
      last_reminded_at: row.last_reminded_at ?? null,
      recovery_coupon_code: row.recovery_coupon_code ?? null,
      updated_at: row.updated_at,
    },
  };
}
