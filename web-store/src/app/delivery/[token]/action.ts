"use server";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";

export type DeliveryConfirmResult = {
  outcome?: "delivered" | "already_delivered" | "invalid_state" | "not_found";
  deliveredAt?: string | null;
  error?: string;
};

export async function confirmDelivery(
  token: string,
): Promise<DeliveryConfirmResult> {
  const clean = token.trim();
  if (clean.length < 24) {
    return { outcome: "not_found", error: "رابط التسليم غير صالح." };
  }
  const db = await serverDb();
  const { data, error } = await db
    .rpc("confirm_delivery_by_token", { p_token: clean })
    .maybeSingle<{
      outcome: "delivered" | "already_delivered" | "invalid_state" | "not_found";
      order_id: string | null;
      delivered_at: string | null;
    }>();

  if (error || !data) {
    return { error: "تعذر تأكيد التسليم حالياً. حاول مرة أخرى." };
  }

  if (data.outcome === "delivered" || data.outcome === "already_delivered") {
    revalidatePath("/orders");
    revalidatePath("/admin/orders");
    if (data.order_id) revalidatePath("/admin/orders/" + data.order_id);
  }

  return {
    outcome: data.outcome,
    deliveredAt: data.delivered_at,
  };
}
