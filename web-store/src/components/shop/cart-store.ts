"use client";
import { useMemo, useSyncExternalStore } from "react";
import { resolveEffectivePrice } from "@/lib/flash-sale";
export type Line = {
  id: string;
  name: string;
  name_en?: string | null;
  size: string;
  color: string;
  price: number;
  regular_price?: number | null;
  flash_sale_price?: number | null;
  flash_sale_starts_at?: string | null;
  flash_sale_ends_at?: string | null;
  quantity: number;
  stock: number;
};

export function lineEffectivePrice(line: Line, nowMs: number = Date.now()): number {
  const basePrice =
    typeof line.regular_price === "number" && Number.isFinite(line.regular_price)
      ? line.regular_price
      : line.price;
  if (
    line.flash_sale_price !== undefined ||
    line.flash_sale_ends_at !== undefined
  ) {
    return resolveEffectivePrice(
      {
        price: basePrice,
        flash_sale_price: line.flash_sale_price ?? null,
        flash_sale_starts_at: line.flash_sale_starts_at ?? null,
        flash_sale_ends_at: line.flash_sale_ends_at ?? null,
      },
      nowMs,
    );
  }
  return line.price;
}
const key = "nova.cart.v2";
const guestSessionKey = "nova.guest_session_id";
const abandonedSessionKey = "wlc_cart_session";
let memory: string | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let contactCache: {
  name?: string;
  email?: string;
  phone?: string;
  currency?: string;
} = {};

export function getCartSessionKey(): string {
  try {
    let id = localStorage.getItem(abandonedSessionKey);
    if (!id || id.length < 24) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `web-${crypto.randomUUID()}`
          : `web-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(abandonedSessionKey, id);
    }
    return id;
  } catch {
    return `web-fallback-${Date.now()}-000000000000`;
  }
}

export function getGuestSessionId(): string {
  try {
    let id = localStorage.getItem(guestSessionKey);
    if (!id || id.length < 24) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(guestSessionKey, id);
    }
    return id;
  } catch {
    return `guest-fallback-${Date.now()}-000000000000`;
  }
}

function scheduleCartHeartbeat(rows: Line[]) {
  if (typeof window === "undefined") return;
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(() => {
    const itemCount = rows.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = rows.reduce(
      (sum, l) => sum + lineEffectivePrice(l) * l.quantity,
      0,
    );
    const locale = document.documentElement.lang === "en" ? "en" : "ar";
    void fetch("/api/notifications/cart-heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guest_session_id: getGuestSessionId(),
        item_count: itemCount,
        subtotal,
        locale,
      }),
    }).catch(() => {});

    const serializedItems = rows.map((l) => ({
      id: l.id,
      name: l.name,
      name_en: l.name_en ?? null,
      quantity: l.quantity,
      price: lineEffectivePrice(l),
      size: l.size || null,
      color: l.color || null,
    }));

    void fetch("/api/abandoned-cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert",
        session_key: getCartSessionKey(),
        items: serializedItems,
        subtotal,
        currency: contactCache.currency || "EGP",
        source: "web",
        customer_name: contactCache.name || null,
        customer_email: contactCache.email || null,
        customer_phone: contactCache.phone || null,
      }),
    }).catch(() => {});
  }, 1500);
}

export function syncAbandonedCartContact(contact: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string | null;
}) {
  if (typeof window === "undefined") return;
  contactCache = {
    name: contact.name?.trim() || contactCache.name,
    email: contact.email?.trim() || contactCache.email,
    phone: contact.phone?.trim() || contactCache.phone,
    currency: contact.currency?.trim() || contactCache.currency,
  };
  const rows = decode(snapshot());
  if (rows.length > 0) {
    scheduleCartHeartbeat(rows);
  }
}

export function markWebCartRecovered(orderId?: string | null) {
  if (typeof window === "undefined") return;
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
  void fetch("/api/abandoned-cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "recover",
      session_key: getCartSessionKey(),
      order_id: orderId || null,
    }),
  }).catch(() => {});
}
function snapshot() {
  try {
    return localStorage.getItem(key) || "[]";
  } catch {
    return memory || "[]";
  }
}
function decode(raw: string): Line[] {
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows)
      ? rows.filter(
          (l) =>
            l &&
            typeof l.id === "string" &&
            typeof l.name === "string" &&
            typeof l.size === "string" &&
            typeof l.color === "string" &&
            Number.isFinite(l.price) &&
            Number.isInteger(l.stock) &&
            Number.isInteger(l.quantity) &&
            l.quantity > 0,
        )
      : [];
  } catch {
    return [];
  }
}
function subscribe(fn: () => void) {
  window.addEventListener("storage", fn);
  window.addEventListener("shop-cart", fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener("shop-cart", fn);
  };
}
export function useCart() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return useMemo(() => decode(raw), [raw]);
}
export const same = (a: Line, b: Line) =>
  a.id === b.id && a.size === b.size && a.color === b.color;
function save(rows: Line[]) {
  memory = JSON.stringify(rows);
  try {
    localStorage.setItem(key, memory);
  } catch {}
  window.dispatchEvent(new Event("shop-cart"));
  scheduleCartHeartbeat(rows);
}
export function change(line: Line, delta: number) {
  const rows = decode(snapshot()),
    i = rows.findIndex((l) => same(l, line)),
    total = rows
      .filter((l) => l.id === line.id)
      .reduce((s, l) => s + l.quantity, 0);
  if (delta > 0 && total + delta > line.stock) return false;
  const quantity = (rows[i]?.quantity ?? 0) + delta;
  if (i >= 0) rows.splice(i, 1);
  if (quantity > 0) rows.push({ ...line, quantity });
  save(rows);
  return true;
}
export function purchased(lines: Line[]) {
  const rows = decode(snapshot()).map((row) => ({
    ...row,
    quantity: row.quantity - (lines.find((l) => same(l, row))?.quantity ?? 0),
  }));
  save(rows.filter((l) => l.quantity > 0));
}

export function clearCart() {
  save([]);
}

const pendingOrderKey = "nova.pending_online_order";

export function setPendingOnlineOrder(orderId: string) {
  try {
    localStorage.setItem(pendingOrderKey, orderId);
  } catch {}
}

export function getPendingOnlineOrder(): string | null {
  try {
    return localStorage.getItem(pendingOrderKey);
  } catch {
    return null;
  }
}

export function clearPendingOnlineOrder() {
  try {
    localStorage.removeItem(pendingOrderKey);
  } catch {}
}
