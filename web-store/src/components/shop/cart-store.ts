"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { browserDb } from "@/lib/supabase/browser";
import { createCartHeartbeat } from "@/lib/cart-heartbeat";
import type { Variant } from "@/lib/variant-stock";
import { lineEffectivePrice, resolveEffectivePrice, type FlashSalePriceInput } from "@/lib/flash-sale";
import { remainingQuantity } from "@/lib/variant-stock";
import { useStudioPreview } from "./studio-preview-context";
export { lineEffectivePrice, remainingQuantity };

export type Line = {
  id: string;
  name: string;
  name_en?: string | null;
  image_path?: string | null;
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
const heartbeats = new Map<string, ReturnType<typeof createCartHeartbeat>>();
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
  storeId, slug, defaultMaxOrderQty,
  children,
}: {
  storeId: string;
  slug: string;
  defaultMaxOrderQty: number | null;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ id: requireTenantId(storeId), defaultLimit: defaultMaxOrderQty }), [storeId, defaultMaxOrderQty]);
  useLayoutEffect(() => {
    const heartbeat = createCartHeartbeat(storeId, slug);
    heartbeats.set(storeId, heartbeat);
    window.addEventListener("pagehide", heartbeat.cancel);
    return () => {
      heartbeat.cancel();
      window.removeEventListener("pagehide", heartbeat.cancel);
      if (heartbeats.get(storeId) === heartbeat) heartbeats.delete(storeId);
    };
  }, [storeId, slug]);
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

function snapshot(tenantId: string, preview = false): string {
  const cleanTenant = requireTenantId(tenantId);
  if (!preview) isolateLegacyStorage();
  try {
    return localStorage.getItem(cartKey(cleanTenant)) || emptySnapshot;
  } catch {
    return memory.get(cleanTenant) || emptySnapshot;
  }
}

function scheduleCartHeartbeat(tenantId: string, rows: Line[]) {
  const cleanTenant = requireTenantId(tenantId);
  heartbeats.get(cleanTenant)?.schedule(() => {
    const itemCount = rows.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = rows.reduce(
      (sum, l) => sum + lineEffectivePrice(l) * l.quantity,
      0,
    );
    const locale = document.documentElement.lang === "en" ? "en" : "ar";
    const contact = contactCache.get(cleanTenant) ?? {};

    const serializedItems = rows.map((l) => ({
      id: l.id,
      name: l.name,
      name_en: l.name_en ?? null,
      quantity: l.quantity,
      price: lineEffectivePrice(l),
      size: l.size || null,
      color: l.color || null,
    }));

    return {
      notification: { guest_session_id: getGuestSessionId(cleanTenant), item_count: itemCount, subtotal, locale },
      abandoned: {
        action: "upsert",
        session_key: getCartSessionKey(cleanTenant),
        items: serializedItems,
        subtotal,
        currency: contact.currency || "EGP",
        source: "web",
        customer_name: contact.name || null,
        customer_email: contact.email || null,
        customer_phone: contact.phone || null,
      },
    };
  });
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
  void heartbeats.get(cleanTenant)?.recover({
    session_key: getCartSessionKey(cleanTenant),
    order_id: orderId || null,
  });
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
  const preview = Boolean(useStudioPreview());
  const subscribeToTenant = useCallback(
    (fn: () => void) => subscribe(tenantId, fn),
    [tenantId],
  );
  const getTenantSnapshot = useCallback(() => snapshot(tenantId, preview), [tenantId, preview]);
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

type Inventory = FlashSalePriceInput & {
  id: string; stock: number; image_path: string | null; max_order_qty: number | null; product_variants: Variant[];
};
export async function readInventory(tenant: string, ids: string[]) {
  const { data, error } = await browserDb().from("products")
    .select("id,stock,image_path,price,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at,max_order_qty,product_variants(color,size,stock)")
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
  const now = Date.now();
  const updated = rows.map(row => {
    if (!requested.has(row.id)) return row;
    const product = inventory.get(row.id);
    const stock = inventoryForLine(product, row.color, row.size);
    if (!product) return { ...row, ...stock };
    return {
      ...row, ...stock,
      image_path: row.image_path || product.image_path,
      regular_price: product.price,
      price: resolveEffectivePrice(product, now),
      flash_sale_price: product.flash_sale_price ?? null,
      flash_sale_starts_at: product.flash_sale_starts_at ?? null,
      flash_sale_ends_at: product.flash_sale_ends_at ?? null,
    };
  });
  if (JSON.stringify(updated) !== JSON.stringify(rows)) save(tenant, updated);
}

export function change(tenantId: string, line: Line, delta: number, defaultLimit: number | null) {
  const rows = decode(snapshot(tenantId));
  const i = rows.findIndex(l => same(l, line));
  if (delta > 0 && delta > remainingQuantity(rows, line, defaultLimit)) return false;
  const quantity = (rows[i]?.quantity ?? 0) + delta;
  if (i >= 0 && quantity <= 0) rows.splice(i, 1);
  else if (i >= 0) rows[i] = { ...line, quantity };
  else if (quantity > 0) rows.push({ ...line, quantity });
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
