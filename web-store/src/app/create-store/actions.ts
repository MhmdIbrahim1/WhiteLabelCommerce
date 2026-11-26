"use server";

import { actionError } from "@/lib/action-error";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { isTemplate } from "@/lib/theme-templates";
import { ADMIN_STORE_COOKIE } from "@/lib/tenant-shared";
import { isStoreSlug } from "@/lib/host-routing";

export type SlugCheckResult = {
  available: boolean;
  reason: "ok" | "invalid" | "reserved" | "taken" | "error";
};

export async function checkSlugAvailability(
  rawSlug: string,
): Promise<SlugCheckResult> {
  const slug = (rawSlug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 40) {
    return { available: false, reason: "invalid" };
  }

  if (!isStoreSlug(slug)) return { available: false, reason: "reserved" };
  const db = await serverDb();
  const { data, error } = await db
    .rpc("check_store_slug_available", { p_slug: slug })
    .maybeSingle<{ available: boolean; reason: string }>();

  if (error || !data) {
    return { available: false, reason: "error" };
  }

  const reason =
    data.reason === "ok" ||
    data.reason === "invalid" ||
    data.reason === "reserved" ||
    data.reason === "taken"
      ? data.reason
      : "error";

  return { available: Boolean(data.available), reason };
}

export type CreateStoreResult =
  | { ok: true; storeId: string; slug: string }
  | { ok: false; errorCode: string };

export async function createStoreAction(input: {
  nameAr: string;
  nameEn: string;
  slug: string;
  presetKey: string;
  contactPhone: string;
  currency: string;
}): Promise<CreateStoreResult> {
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return { ok: false, errorCode: "auth_required" };
  }

  const nameAr = (input.nameAr ?? "").trim().slice(0, 120);
  const nameEn = ((input.nameEn ?? "").trim() || nameAr).slice(0, 120);
  const slug = (input.slug ?? "").trim().toLowerCase();
  const presetKey = isTemplate(input.presetKey)
    ? input.presetKey
    : "modern-minimal";
  const contactPhone = (input.contactPhone ?? "").trim().slice(0, 32);
  const currency = /^[A-Z]{3}$/.test((input.currency ?? "").trim().toUpperCase())
    ? input.currency.trim().toUpperCase()
    : "EGP";

  if (nameAr.length < 2) {
    return { ok: false, errorCode: "invalid_store_name" };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 40) {
    return { ok: false, errorCode: "invalid_slug" };
  }

  if (!isStoreSlug(slug)) return { ok: false, errorCode: "reserved_slug" };
  const { data, error } = await db
    .rpc("provision_new_store", {
      p_name_ar: nameAr,
      p_name_en: nameEn,
      p_slug: slug,
      p_preset_key: presetKey,
      p_contact_phone: contactPhone,
      p_currency: currency,
    })
    .single<{ store_id: string; slug: string }>();

  if (error || !data?.store_id) {
    return { ok: false, errorCode: actionError(error, "provision_failed", [
      "slug_taken", "reserved_slug", "invalid_slug", "invalid_store_name", "auth_required",
    ]) };
  }

  // Switch active merchant admin context immediately to the newly created store
  const jar = await cookies();
  jar.set(ADMIN_STORE_COOKIE, data.store_id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/super-admin");
  revalidatePath("/", "layout");

  return {
    ok: true,
    storeId: data.store_id,
    slug: data.slug,
  };
}
