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
  operation: "toggle" | "remove" = "toggle",
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

  // A retry after a lost response must leave the item removed.
  const { data, error } = operation === "remove"
    ? await db.from("wishlists").delete().eq("store_id", store.id).eq("user_id", user.id).eq("product_id", cleanId)
    : await db.rpc("toggle_wishlist_item", { p_store_id: store.id, p_product_id: cleanId });

  if (error) {
    return { ok: false, error: actionError(error, "wishlist_toggle_failed") };
  }

  if (operation !== "remove" && typeof data?.in_wishlist !== "boolean") {
    return { ok: false, error: "wishlist_toggle_failed" };
  }

  revalidatePath("/wishlist");
  if (store.basePath) {
    revalidatePath(`${store.basePath}/wishlist`);
  }

  return operation === "remove" ? { ok: true, in_wishlist: false } :
    { ok: true, in_wishlist: data.in_wishlist, wishlist_count: data.wishlist_count };
}
