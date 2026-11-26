"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { browserDb } from "@/lib/supabase/browser";
import type { Variant } from "@/lib/variant-stock";
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
  variantStock?: boolean;
  productStock?: number;
  max_order_qty?: number | null;
};

type CartContact = {
  name?: string;
  email?: string;
  phone?: string;
  currency?: string;
};

const CartTenantContext = createContext<{ id: string; defaultLimit: number | null } | null>(null);
const emptySnapshot = "[]";
const legacyIsolationMarker = "wlc.cart.tenant-scope.v1";
const legacyExactKeys = [
  "nova.cart.v2",
  "nova.guest_session_id",
  "wlc_cart_session",
  "nova.pending_online_order",
];
const memory = new Map<string, string>();
const heartbeatTimers = new Map<string, ReturnType<typeof setTimeout>>();
const contactCache = new Map<string, CartContact>();
const fallbackCartSessions = new Map<string, string>();
const fallbackGuestSessions = new Map<string, string>();

function requireTenantId(tenantId: string): string {
  const clean = tenantId.trim();
  if (!clean) throw new Error("Cart tenant is required.");
  return clean;
}

function scopedKey(kind: string, tenantId: string): string {
  return `wlc.${kind}.${requireTenantId(tenantId)}`;
}

function cartKey(tenantId: string): string {
  return scopedKey("cart.v3", tenantId);
}

function pendingOrderKey(tenantId: string): string {
  return scopedKey("pending_online_order", tenantId);
}

function isolateLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(legacyIsolationMarker) === "done") return;
    for (const key of legacyExactKeys) localStorage.removeItem(key);
    const legacyCheckoutKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith("nova.checkout.")) legacyCheckoutKeys.push(key);
    }
    for (const key of legacyCheckoutKeys) localStorage.removeItem(key);
    localStorage.setItem(legacyIsolationMarker, "done");
  } catch {
    // Storage can be disabled. Per-tenant in-memory maps remain isolated.
  }
}

function randomSessionId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function CartTenantProvider({
  storeId, defaultMaxOrderQty,
  children,
}: {
  storeId: string;
  defaultMaxOrderQty: number | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ id: requireTenantId(storeId), defaultLimit: defaultMaxOrderQty }), [storeId, defaultMaxOrderQty]);
  return createElement(
    CartTenantContext.Provider,
    { value },
    children,
  );
}

export function useCartTenant(): string {
  const tenantId = useContext(CartTenantContext);
  if (!tenantId) throw new Error("CartTenantProvider is missing.");
  return tenantId.id;
}

export function useDefaultOrderLimit() {
  const tenant = useContext(CartTenantContext);
  if (!tenant) throw new Error("CartTenantProvider is missing.");
  return tenant.defaultLimit;
}

export function lineEffectivePrice(
  line: Line,
  nowMs: number = Date.now(),
): number {
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

export function getCartSessionKey(tenantId: string): string {
  const cleanTenant = requireTenantId(tenantId);
  isolateLegacyStorage();
  const key = scopedKey("cart_session", cleanTenant);
  try {
    let id = localStorage.getItem(key);
    if (!id || id.length < 24) {
      id = randomSessionId("web");
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    const existing = fallbackCartSessions.get(cleanTenant);
    if (existing) return existing;
    const created = randomSessionId("web-fallback");
    fallbackCartSessions.set(cleanTenant, created);
    return created;
  }
}

export function getGuestSessionId(tenantId: string): string {
  const cleanTenant = requireTenantId(tenantId);
  isolateLegacyStorage();
  const key = scopedKey("guest_session", cleanTenant);
  try {
    let id = localStorage.getItem(key);
    if (!id || id.length < 24) {
      id = randomSessionId("guest");
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    const existing = fallbackGuestSessions.get(cleanTenant);
    if (existing) return existing;
    const created = randomSessionId("guest-fallback");
    fallbackGuestSessions.set(cleanTenant, created);
    return created;
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

function snapshot(tenantId: string): string {
  const cleanTenant = requireTenantId(tenantId);
  isolateLegacyStorage();
  try {
    return localStorage.getItem(cartKey(cleanTenant)) || emptySnapshot;
  } catch {
    return memory.get(cleanTenant) || emptySnapshot;
  }
}

function scheduleCartHeartbeat(tenantId: string, rows: Line[]) {
  if (typeof window === "undefined") return;
  const cleanTenant = requireTenantId(tenantId);
  const existing = heartbeatTimers.get(cleanTenant);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    heartbeatTimers.delete(cleanTenant);
    const itemCount = rows.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = rows.reduce(
      (sum, l) => sum + lineEffectivePrice(l) * l.quantity,
      0,
    );
    const locale = document.documentElement.lang === "en" ? "en" : "ar";
    const contact = contactCache.get(cleanTenant) ?? {};

    void fetch("/api/notifications/cart-heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guest_session_id: getGuestSessionId(cleanTenant),
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
        session_key: getCartSessionKey(cleanTenant),
        items: serializedItems,
        subtotal,
        currency: contact.currency || "EGP",
        source: "web",
        customer_name: contact.name || null,
        customer_email: contact.email || null,
        customer_phone: contact.phone || null,
      }),
    }).catch(() => {});
  }, 1500);
  heartbeatTimers.set(cleanTenant, timer);
}

export function syncAbandonedCartContact(
  tenantId: string,
  contact: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    currency?: string | null;
  },
) {
  if (typeof window === "undefined") return;
  const cleanTenant = requireTenantId(tenantId);
  const current = contactCache.get(cleanTenant) ?? {};
  contactCache.set(cleanTenant, {
    name: contact.name?.trim() || current.name,
    email: contact.email?.trim() || current.email,
    phone: contact.phone?.trim() || current.phone,
    currency: contact.currency?.trim() || current.currency,
  });
  const rows = decode(snapshot(cleanTenant));
  if (rows.length > 0) scheduleCartHeartbeat(cleanTenant, rows);
}

export function markWebCartRecovered(
  tenantId: string,
  orderId?: string | null,
) {
  if (typeof window === "undefined") return;
  const cleanTenant = requireTenantId(tenantId);
  const timer = heartbeatTimers.get(cleanTenant);
  if (timer) {
    clearTimeout(timer);
    heartbeatTimers.delete(cleanTenant);
  }
  void fetch("/api/abandoned-cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "recover",
      session_key: getCartSessionKey(cleanTenant),
      order_id: orderId || null,
    }),
  }).catch(() => {});
}

function subscribe(tenantId: string, fn: () => void) {
  const eventName = `shop-cart:${requireTenantId(tenantId)}`;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === cartKey(tenantId)) fn();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(eventName, fn);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(eventName, fn);
  };
}

export function useCart() {
  const tenantId = useCartTenant();
  const subscribeToTenant = useCallback(
    (fn: () => void) => subscribe(tenantId, fn),
    [tenantId],
  );
  const getTenantSnapshot = useCallback(() => snapshot(tenantId), [tenantId]);
  const raw = useSyncExternalStore(
    subscribeToTenant,
    getTenantSnapshot,
    () => emptySnapshot,
  );
  return useMemo(() => decode(raw), [raw]);
}

export const same = (a: Line, b: Line) =>
  a.id === b.id && a.size === b.size && a.color === b.color;

function save(tenantId: string, rows: Line[]) {
  const cleanTenant = requireTenantId(tenantId);
  const serialized = JSON.stringify(rows);
  memory.set(cleanTenant, serialized);
  isolateLegacyStorage();
  try {
    localStorage.setItem(cartKey(cleanTenant), serialized);
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(`shop-cart:${cleanTenant}`));
  }
  scheduleCartHeartbeat(cleanTenant, rows);
}

type InventoryLine = Pick<Line, "id" | "size" | "color" | "stock" | "variantStock" | "productStock" | "max_order_qty">;

export function remainingQuantity(rows: Line[], line: InventoryLine, defaultLimit: number | null) {
  const productLimit = Math.min(line.productStock ?? (line.variantStock ? Infinity : line.stock),
    line.max_order_qty ?? defaultLimit ?? Infinity);
  let total = 0, selected = 0;
  for (const row of rows) {
    if (row.id !== line.id) continue;
    total += row.quantity;
    if (row.size === line.size && row.color === line.color) selected += row.quantity;
  }
  return Math.min(productLimit - total, line.stock - (line.variantStock ? selected : total));
}

type Inventory = { id: string; stock: number; max_order_qty: number | null; product_variants: Variant[] };
export async function readInventory(tenant: string, ids: string[]) {
  const { data, error } = await browserDb().from("products")
    .select("id,stock,max_order_qty,product_variants(color,size,stock)")
    .eq("store_id", tenant).eq("is_active", true).in("id", ids).returns<Inventory[]>();
  if (error) throw error;
  return new Map(data.map(p => [p.id, p]));
}

export function inventoryForLine(p: Inventory | undefined, color: string, size: string) {
  const tracked = Boolean(p?.product_variants.length);
  const stock = tracked ? p?.product_variants.find(v => v.color === color && v.size === size)?.stock : p?.stock;
  return { stock: stock ?? 0, productStock: p?.stock ?? 0, variantStock: tracked, max_order_qty: p?.max_order_qty ?? null };
}

export async function refreshCartInventory(tenant: string, ids: string[], isCurrent: () => boolean) {
  const inventory = await readInventory(tenant, ids);
  if (!isCurrent()) return;
  const rows = decode(snapshot(tenant));
  const requested = new Set(ids);
  const updated = rows.map(row => requested.has(row.id)
    ? { ...row, ...inventoryForLine(inventory.get(row.id), row.color, row.size) } : row);
  if (JSON.stringify(updated) !== JSON.stringify(rows)) save(tenant, updated);
}

export function change(tenantId: string, line: Line, delta: number, defaultLimit: number | null) {
  const rows = decode(snapshot(tenantId));
  const i = rows.findIndex(l => same(l, line));
  if (delta > 0 && delta > remainingQuantity(rows, line, defaultLimit)) return false;
  const quantity = (rows[i]?.quantity ?? 0) + delta;
  if (i >= 0) rows.splice(i, 1);
  if (quantity > 0) rows.push({ ...line, quantity });
  save(tenantId, rows);
  return true;
}

export function purchased(tenantId: string, lines: Line[]) {
  const rows = decode(snapshot(tenantId)).map((row) => ({
    ...row,
    quantity: row.quantity - (lines.find((l) => same(l, row))?.quantity ?? 0),
  }));
  save(
    tenantId,
    rows.filter((l) => l.quantity > 0),
  );
}

export function clearCart(tenantId: string) {
  save(tenantId, []);
}

export function setPendingOnlineOrder(tenantId: string, orderId: string) {
  isolateLegacyStorage();
  try {
    localStorage.setItem(pendingOrderKey(tenantId), orderId);
  } catch {}
}

export function getPendingOnlineOrder(tenantId: string): string | null {
  isolateLegacyStorage();
  try {
    return localStorage.getItem(pendingOrderKey(tenantId));
  } catch {
    return null;
  }
}

export function clearPendingOnlineOrder(tenantId: string) {
  isolateLegacyStorage();
  try {
    localStorage.removeItem(pendingOrderKey(tenantId));
  } catch {}
}

export function checkoutAttemptKey(tenantId: string, hash: string): string {
  return scopedKey(`checkout.${hash}`, tenantId);
}
