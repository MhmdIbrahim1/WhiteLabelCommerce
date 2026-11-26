"use server";

import { actionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";
import type { WishlistToggleResult } from "@/lib/reviews-wishlist";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function toggleWishlistAction(
  productId: string,
): Promise<WishlistToggleResult> {
  const cleanId = (productId ?? "").trim();
  if (!UUID_RE.test(cleanId)) {
    return { ok: false, error: "invalid_product" };
  }

  const [db, store] = await Promise.all([
    serverDb(),
    resolveActiveStoreOrDefault(),
  ]);

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return { ok: false, requiresAuth: true, error: "auth_required" };
  }

  const { data, error } = await db.rpc("toggle_wishlist_item", {
    p_store_id: store.id,
    p_product_id: cleanId,
  });

  if (error) {
    return { ok: false, error: actionError(error, "wishlist_toggle_failed") };
  }

  const payload = (data ?? {}) as {
    in_wishlist?: boolean;
    wishlist_count?: number;
  };

  revalidatePath("/wishlist");
  if (store.basePath) {
    revalidatePath(`${store.basePath}/wishlist`);
  }

  return {
    ok: true,
    in_wishlist: Boolean(payload.in_wishlist),
    wishlist_count: Number(payload.wishlist_count ?? 0),
  };
}
