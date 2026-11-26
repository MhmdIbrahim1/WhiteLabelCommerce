"use server";

import { actionError } from "@/lib/action-error";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/db";
import {
  ADMIN_STORE_COOKIE,
  computeMobileAppUnlocked,
  type MobileAppAccess,
  type StorePlan,
  type StoreStatus,
} from "@/lib/tenant-shared";

export type SuperAdminStoreOverview = {
  store_id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  custom_domain: string | null;
  plan: StorePlan;
  status: StoreStatus;
  max_products: number;
  owner_user_id: string | null;
  owner_email: string;
  pending_owner_email: string | null;
  mobile_app_access: MobileAppAccess;
  mobile_app_unlocked: boolean;
  subscription_expires_at: string | null;
  created_at: string;
  products_count: number;
  active_products_count: number;
  orders_count: number;
  gmv: number;
  currency: string;
};

export type UpdateStorePlanResult =
  | {
      ok: true;
      updated: {
        store_id: string;
        slug: string;
        plan: StorePlan;
        status: StoreStatus;
        max_products: number;
        subscription_expires_at: string | null;
        mobile_app_access: MobileAppAccess;
        mobile_app_unlocked: boolean;
      };
    }
  | { ok: false; error: string };

export async function updateStorePlanAndStatusAction(input: {
  storeId: string;
  plan?: StorePlan | null;
  status?: StoreStatus | null;
  maxProducts?: number | null;
  subscriptionExpiresAt?: string | null;
  clearExpiry?: boolean;
  mobileAppAccess?: MobileAppAccess | null;
}): Promise<UpdateStorePlanResult> {
  const { db } = await requireSuperAdmin();

  const cleanStoreId = (input.storeId ?? "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cleanStoreId,
    )
  ) {
    return { ok: false, error: "invalid_store_id" };
  }

  const parsedMax =
    input.maxProducts !== undefined && input.maxProducts !== null
      ? Math.max(0, Math.trunc(Number(input.maxProducts)))
      : null;

  let parsedExpiry: string | null = null;
  if (input.subscriptionExpiresAt && input.subscriptionExpiresAt.trim()) {
    const ms = Date.parse(input.subscriptionExpiresAt.trim());
    if (!Number.isFinite(ms)) {
      return { ok: false, error: "invalid_expiry_date" };
    }
    parsedExpiry = new Date(ms).toISOString();
  }

  const { data, error } = await db
    .rpc("super_admin_update_store_plan_and_status", {
      p_store_id: cleanStoreId,
      p_plan: input.plan ?? null,
      p_status: input.status ?? null,
      p_max_products: parsedMax,
      p_subscription_expires_at: parsedExpiry,
      p_clear_expiry: Boolean(input.clearExpiry),
      p_mobile_app_access: input.mobileAppAccess ?? null,
    })
    .single<{
      store_id: string;
      slug: string;
      plan: StorePlan;
      status: StoreStatus;
      max_products: number;
      subscription_expires_at: string | null;
      mobile_app_access: MobileAppAccess;
      mobile_app_unlocked: boolean;
    }>();

  if (error || !data) {
    return { ok: false, error: actionError(error, "update_failed") };
  }

  const access: MobileAppAccess =
    data.mobile_app_access === "enabled" || data.mobile_app_access === "disabled"
      ? data.mobile_app_access
      : "plan";

  revalidatePath("/super-admin");
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/mobile-app");
  revalidatePath("/", "layout");

  return {
    ok: true,
    updated: {
      ...data,
      max_products: Number(data.max_products ?? 50),
      mobile_app_access: access,
      mobile_app_unlocked:
        typeof data.mobile_app_unlocked === "boolean"
          ? data.mobile_app_unlocked
          : computeMobileAppUnlocked(data.plan, access),
    },
  };
}

export type AssignStoreOwnerResult =
  | {
      ok: true;
      mode: "assigned_existing" | "pending_signup";
      ownerEmail: string;
      ownerUserId: string | null;
      pendingOwnerEmail: string | null;
    }
  | { ok: false; error: string };

export async function assignStoreOwnerAction(input: {
  storeId: string;
  ownerEmail: string;
}): Promise<AssignStoreOwnerResult> {
  const { db } = await requireSuperAdmin();

  const cleanStoreId = (input.storeId ?? "").trim();
  const cleanEmail = (input.ownerEmail ?? "").trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cleanStoreId,
    )
  ) {
    return { ok: false, error: "invalid_store_id" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, error: "invalid_email" };
  }

  const { data, error } = await db
    .rpc("super_admin_assign_store_owner", {
      p_store_id: cleanStoreId,
      p_owner_email: cleanEmail,
    })
    .single<{
      status: "assigned" | "pending_signup";
      owner_email?: string | null;
      user_id?: string | null;
      pending_owner_email?: string | null;
    }>();

  if (error || !data) {
    return { ok: false, error: actionError(error, "assign_failed") };
  }

  const isAssigned = data.status === "assigned";
  const resolvedEmail =
    (isAssigned ? data.owner_email : data.pending_owner_email)?.trim() ||
    cleanEmail;

  revalidatePath("/super-admin");
  revalidatePath("/admin", "layout");

  return {
    ok: true,
    mode: isAssigned ? "assigned_existing" : "pending_signup",
    ownerEmail: resolvedEmail,
    ownerUserId: isAssigned ? (data.user_id ?? null) : null,
    pendingOwnerEmail: isAssigned
      ? null
      : (data.pending_owner_email?.trim() || cleanEmail),
  };
}

export async function openStoreInAdminAction(storeId: string): Promise<never> {
  await requireSuperAdmin();
  const cleanId = (storeId ?? "").trim();
  const jar = await cookies();
  jar.set(ADMIN_STORE_COOKIE, cleanId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/admin", "layout");
  redirect("/admin");
}
