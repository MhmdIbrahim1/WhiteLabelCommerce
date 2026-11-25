"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { normalizePhone } from "@/lib/phone";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";

export type OrderItemSummary = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  size?: string | null;
  color?: string | null;
};

export type Summary = {
  id: string;
  status: string;
  created_at: string;
  phone?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  shipping_carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  courier_note?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  order_items?: OrderItemSummary[] | null;
};

export async function track(
  _: { row?: Summary; error?: string },
  f: FormData,
): Promise<{ row?: Summary; error?: string }> {
  const isEn = (await getServerLang()) === "en";
  const phone = normalizePhone(String(f.get("phone") || "")),
    id = String(f.get("number") || "").trim();
  if (
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
    !/^\d{8,15}$/.test(phone)
  )
    return {
      error: isEn
        ? "Please check the order ID and phone number."
        : "تحقق من رقم الطلب ورقم الهاتف.",
    };
  const db = await serverDb();
  const { data, error } = await db
    .rpc("track_guest_order", { order_number: id, customer_phone: phone })
    .maybeSingle<Summary>();
  return error
    ? {
        error: isEn
          ? "Could not reach tracking service."
          : "تعذر الاتصال بخدمة التتبع.",
      }
    : data
      ? { row: { ...data, phone } }
      : {
          error: isEn
            ? "No order found matching these details."
            : "لم نعثر على طلب بهذه البيانات.",
        };
}

export async function switchOrderToCodAction(
  orderId: string,
  phoneRaw?: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const isEn = (await getServerLang()) === "en";
  const cleanId = orderId.trim();
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(cleanId)) {
    return {
      ok: false,
      error: isEn ? "Invalid order ID." : "رقم الطلب غير صالح.",
    };
  }

  const [db, store] = await Promise.all([
    serverDb(),
    resolveActiveStoreOrDefault(),
  ]);
  const storeId = store.id;
  const phone = normalizePhone(phoneRaw ?? "");

  const { data, error } = await db
    .rpc("switch_order_to_cod", {
      p_store: storeId,
      p_order_id: cleanId,
      p_phone: phone,
    })
    .maybeSingle<{ status: string }>();

  if (error) {
    return {
      ok: false,
      error: isEn
        ? "Could not switch this order to Cash on Delivery."
        : "تعذر تحويل هذا الطلب إلى الدفع عند الاستلام حالياً.",
    };
  }

  revalidatePath("/orders");
  revalidatePath("/account");
  revalidatePath("/admin/orders");
  return { ok: true, status: data?.status ?? "confirmed" };
}

export async function customerLogin(f: FormData) {
  const db = await serverDb();
  const { error } = await db.auth.signInWithPassword({
    email: String(f.get("email") || "").trim(),
    password: String(f.get("password") || ""),
  });
  redirect(error ? "/orders?login=failed" : "/orders");
}

export async function customerLogout() {
  const db = await serverDb();
  const { error } = await db.auth.signOut({ scope: "local" });
  if (error) throw new Error("تعذر تسجيل الخروج");
  redirect("/orders");
}
