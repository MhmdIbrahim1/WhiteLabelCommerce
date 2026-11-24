"use client";
import { useMemo, useSyncExternalStore } from "react";
export type Line = {
  id: string;
  name: string;
  name_en?: string | null;
  size: string;
  color: string;
  price: number;
  quantity: number;
  stock: number;
};
const key = "nova.cart.v2";
const guestSessionKey = "nova.guest_session_id";
let memory: string | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

export function getGuestSessionId(): string {
  try {
    let id = localStorage.getItem(guestSessionKey);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(guestSessionKey, id);
    }
    return id;
  } catch {
    return "guest-fallback";
  }
}

function scheduleCartHeartbeat(rows: Line[]) {
  if (typeof window === "undefined") return;
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(() => {
    const itemCount = rows.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = rows.reduce((sum, l) => sum + l.price * l.quantity, 0);
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
  }, 1500);
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
