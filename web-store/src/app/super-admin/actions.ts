"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/db";
import {
  ADMIN_STORE_COOKIE,
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

  const parsedExpiry =
    input.subscriptionExpiresAt && input.subscriptionExpiresAt.trim()
      ? new Date(input.subscriptionExpiresAt).toISOString()
      : null;

  const { data, error } = await db
    .rpc("super_admin_update_store_plan_and_status", {
      p_store_id: cleanStoreId,
      p_plan: input.plan ?? null,
      p_status: input.status ?? null,
      p_max_products: parsedMax,
      p_subscription_expires_at: parsedExpiry,
      p_clear_expiry: Boolean(input.clearExpiry),
    })
    .single<{
      store_id: string;
      slug: string;
      plan: StorePlan;
      status: StoreStatus;
      max_products: number;
      subscription_expires_at: string | null;
    }>();

  if (error || !data) {
    return { ok: false, error: error?.message || "update_failed" };
  }

  revalidatePath("/super-admin");
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");

  return {
    ok: true,
    updated: {
      ...data,
      max_products: Number(data.max_products ?? 50),
    },
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
