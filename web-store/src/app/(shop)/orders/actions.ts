"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { normalizePhone } from "@/lib/phone";
import { trackingReference } from "@/lib/order-number";
import { resolveActiveStoreOrDefault } from "@/lib/tenant";
import {
  normalizeReturnRecord,
  type ReturnRefundMethod,
  type ReturnRequestRecord,
  type ReturnRequestType,
} from "@/lib/returns";

export type OrderItemSummary = {
  id: string;
  product_id?: string | null;
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
  currency?: string | null;
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
  return_request?: ReturnRequestRecord | null;
};

export async function track(
  _: { row?: Summary; error?: string },
  f: FormData,
): Promise<{ row?: Summary; error?: string }> {
  const isEn = (await getServerLang()) === "en";
  const phone = normalizePhone(String(f.get("phone") || "")),
    id = trackingReference(String(f.get("number") || ""));
  if (
    !id ||
    !/^\d{8,15}$/.test(phone)
  )
    return {
      error: isEn
        ? "Please check the order ID and phone number."
        : "تحقق من رقم الطلب ورقم الهاتف.",
    };
  const [db, store] = await Promise.all([serverDb(), resolveActiveStoreOrDefault()]);
  const { data, error } = await db
    .rpc("track_guest_order", { p_store_id: store.id, order_number: id, customer_phone: phone })
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

export type SubmitReturnInput = {
  orderId: string;
  requestType: ReturnRequestType;
  refundMethod: ReturnRefundMethod;
  reason: string;
  customerNotes?: string;
  items: { order_item_id: string; quantity: number }[];
};

export type SubmitReturnResult =
  | { ok: true; returnRequest: ReturnRequestRecord }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitReturnRequestAction(
  input: SubmitReturnInput,
): Promise<SubmitReturnResult> {
  const isEn = (await getServerLang()) === "en";
  const cleanOrderId = (input.orderId ?? "").trim();
  const cleanReason = (input.reason ?? "").trim().slice(0, 300);
  const cleanNotes = (input.customerNotes ?? "").trim().slice(0, 1000);

  if (!UUID_RE.test(cleanOrderId)) {
    return {
      ok: false,
      error: isEn ? "Invalid order ID." : "رقم الطلب غير صالح.",
    };
  }
  if (input.requestType !== "return" && input.requestType !== "exchange") {
    return {
      ok: false,
      error: isEn ? "Choose Return or Exchange." : "يرجى اختيار إرجاع أو استبدال.",
    };
  }
  if (
    input.refundMethod !== "wallet" &&
    input.refundMethod !== "original_payment"
  ) {
    return {
      ok: false,
      error: isEn ? "Choose a refund method." : "يرجى اختيار وسيلة الاسترداد.",
    };
  }
  if (cleanReason.length < 2) {
    return {
      ok: false,
      error: isEn
        ? "Please choose a reason for your request."
        : "يرجى اختيار سبب طلب الإرجاع أو الاستبدال.",
    };
  }

  const validItems = (input.items ?? [])
    .filter(
      (it) =>
        typeof it.order_item_id === "string" &&
        UUID_RE.test(it.order_item_id.trim()) &&
        Number.isInteger(it.quantity) &&
        it.quantity > 0,
    )
    .map((it) => ({
      order_item_id: it.order_item_id.trim(),
      quantity: it.quantity,
    }));

  if (validItems.length === 0) {
    return {
      ok: false,
      error: isEn
        ? "Please select at least one item to return or exchange."
        : "يرجى اختيار منتج واحد على الأقل للإرجاع أو الاستبدال.",
    };
  }

  const [db, store] = await Promise.all([
    serverDb(),
    resolveActiveStoreOrDefault(),
  ]);

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: isEn
        ? "Please sign in to submit a return request."
        : "يرجى تسجيل الدخول لإرسال طلب الإرجاع أو الاستبدال.",
    };
  }

  const { data, error } = await db.rpc("submit_return_request", {
    p_store_id: store.id,
    p_order_id: cleanOrderId,
    p_request_type: input.requestType,
    p_refund_method: input.refundMethod,
    p_reason: cleanReason,
    p_customer_notes: cleanNotes || null,
    p_items: validItems,
  });

  if (error || !data) {
    const raw = (error?.message ?? "").toLowerCase();
    let msg = isEn
      ? "Could not submit your return request right now. Please try again."
      : "تعذر إرسال طلب الإرجاع حالياً. يرجى المحاولة مرة أخرى.";
    if (raw.includes("return_already_exists")) {
      msg = isEn
        ? "A return or exchange request already exists for this order."
        : "يوجد بالفعل طلب إرجاع أو استبدال نشط لهذا الطلب.";
    } else if (raw.includes("order_not_delivered")) {
      msg = isEn
        ? "Returns are available once your order has been delivered."
        : "الإرجاع والاستبدال متاحان فقط بعد تسليم الطلب.";
    } else if (raw.includes("return_window_expired")) {
      msg = isEn
        ? "The return window for this order has expired."
        : "انتهت نافذة الإرجاع المسموح بها لهذا الطلب.";
    } else if (raw.includes("invalid_return_quantity")) {
      msg = isEn
        ? "Selected item quantity exceeds the ordered quantity."
        : "الكمية المختارة تتجاوز الكمية الموجودة في الطلب.";
    }
    return { ok: false, error: msg };
  }

  const record = normalizeReturnRecord(data as Record<string, unknown>);

  revalidatePath("/orders");
  revalidatePath(`/orders/${cleanOrderId}`);
  revalidatePath("/account");
  revalidatePath("/admin/returns");

  return { ok: true, returnRequest: record };
}
