"use server";

import { serverDb } from "@/lib/db";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";
import { normalizePhone } from "@/lib/phone";
import type { DeliveryAddress, SavedAddress } from "@/lib/customer-address";

export async function changeAddress(storeId: string, action: "add" | "edit" | "delete" | "default", id: string, draft?: DeliveryAddress) {
  const [db, store] = await Promise.all([serverDb(), resolveActiveStoreOrDefault()]);
  if (store.id !== storeId) return null;
  const { data, error } = await db.rpc("change_address", {
    p_store_id: store.id, p_action: action, p_id: id,
    p_address: draft ? { ...draft, phone: normalizePhone(draft.phone) } : {},
  });
  return error ? null : data as SavedAddress[];
}
