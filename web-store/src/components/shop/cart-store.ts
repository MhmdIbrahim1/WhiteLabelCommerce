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
import { cartSessionEnded, useSessionUser } from "@/components/auth-session";
import { cartScope, type CartScope } from "@/lib/cart-session";
import { browserDb } from "@/lib/supabase/browser";
import { createCartHeartbeat } from "@/lib/cart-heartbeat";
import type { OrderReceipt, ReceiptLine } from "@/lib/order-payment";
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

const CartTenantContext = createContext<{ scope: CartScope; defaultLimit: number | null } | null>(null);
const emptySnapshot = "[]";
const legacyIsolationMarker = "wlc.cart.tenant-scope.v1";
const legacyExactKeys = [
  "nova.cart.v2",
  "nova.guest_session_id",
  "wlc_cart_session",
  "nova.pending_online_order",
];
const memory = new Map<string, string>();
const volatileScopes = new Set<string>();
const heartbeats = new Map<string, ReturnType<typeof createCartHeartbeat>>();
const contactCache = new Map<string, CartContact>();
const fallbackCartSessions = new Map<string, string>();
const fallbackGuestSessions = new Map<string, string>();

function cartKey(scope: CartScope): string {
  return "wlc.cart.v4." + scope.key;
}

export type CheckoutBinding = {
  key: string; buyer: string; fingerprint: string; method: string; signature: string; orderId?: string;
  lines: ReceiptLine[]; remaining: ReceiptLine[];
};
type CartState = { lines: Line[]; attempts: CheckoutBinding[]; consumed: string[] };

function cartState(tenant: CartScope): CartState {
  const raw = snapshot(tenant);
  const lines = decode(raw);
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data.attempts) && Array.isArray(data.consumed)) return { lines, attempts: data.attempts, consumed: data.consumed };
  } catch { /* Legacy carts contain only lines. */ }
  return { lines, attempts: [], consumed: [] };
}

function cartLock<T>(tenant: CartScope, work: () => T, durable = false): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(cartKey(tenant), work);
  // Embedded wallet browsers can lack Web Locks. Read/write IndexedDB transactions
  // on one object store are serialized across tabs. The cart mutation is synchronous
  // inside its request callback, while that transaction still holds the lock.
  if (typeof indexedDB !== "undefined") return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open("wlc-cart-coordination", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("locks");
    open.onerror = () => reject(open.error);
    let blocked = false;
    open.onblocked = () => { blocked = true; reject(new Error("Cart storage busy")); };
    open.onsuccess = () => {
      const db = open.result;
      if (blocked) { db.close(); return; }
      const tx = db.transaction("locks", "readwrite");
      const read = tx.objectStore("locks").get(tenant.key);
      let result: T;
      read.onsuccess = () => {
        try { result = work(); } catch (error) { tx.abort(); reject(error); }
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Cart write aborted")); };
    };
  });
  if (durable) return Promise.reject(new Error("Durable cart storage unavailable"));
  return Promise.resolve(work());
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

export function CartTenantProvider({ storeId, slug, userId, defaultMaxOrderQty, children }: {
  storeId: string; slug: string; userId: string | null; defaultMaxOrderQty: number | null; children: React.ReactNode;
}) {
  const activeUser = useSessionUser();
  const scope = useMemo(() => cartScope(storeId, activeUser), [storeId, activeUser]);
  const value = useMemo(() => ({ scope, defaultLimit: defaultMaxOrderQty }), [scope, defaultMaxOrderQty]);
  useLayoutEffect(() => {
    const heartbeat = createCartHeartbeat(storeId, slug);
    heartbeats.set(scope.key, heartbeat);
    function endSession(event: Event) {
      if ((event as CustomEvent<string>).detail !== scope.owner) return;
      heartbeat.cancel();
      memory.delete(scope.key);
      volatileScopes.delete(scope.key);
      contactCache.delete(scope.key);
      fallbackGuestSessions.delete(scope.key);
      fallbackCartSessions.delete(scope.key);
      heartbeats.delete(scope.key);
    }
    window.addEventListener(cartSessionEnded, endSession);
    window.addEventListener("pagehide", heartbeat.cancel);
    return () => {
      heartbeat.cancel();
      contactCache.delete(scope.key);
      window.removeEventListener(cartSessionEnded, endSession);
      window.removeEventListener("pagehide", heartbeat.cancel);
      if (heartbeats.get(scope.key) === heartbeat) heartbeats.delete(scope.key);
    };
  }, [scope, storeId, slug]);
  // A server-rendered checkout can contain the previous buyer's address and wallet.
  // Remount the whole subtree when the refreshed server identity matches the browser.
  const pending = createElement("p", { role: "status", "aria-busy": true },
    typeof document !== "undefined" && document.documentElement.lang === "en" ? "Updating your session…" : "جارٍ تحديث جلستك…");
  return createElement(CartTenantContext.Provider, { key: scope.key, value }, userId === activeUser ? children : pending);
}

export function useCartScope(): CartScope {
  const tenant = useContext(CartTenantContext);
  if (!tenant) throw new Error("CartTenantProvider is missing.");
  return tenant.scope;
}

export function useDefaultOrderLimit() {
  const tenant = useContext(CartTenantContext);
  if (!tenant) throw new Error("CartTenantProvider is missing.");
  return tenant.defaultLimit;
}

function sessionId(scope: CartScope, kind: "cart_session" | "guest_session"): string {
  isolateLegacyStorage();
  const key = "wlc." + kind + "." + scope.key;
  const prefix = kind === "cart_session" ? "web" : "guest";
  try {
    let id = localStorage.getItem(key);
    if (!id || id.length < 24) {
      id = randomSessionId(prefix);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    const fallback = kind === "cart_session" ? fallbackCartSessions : fallbackGuestSessions;
    const id = fallback.get(scope.key) ?? randomSessionId(prefix + "-fallback");
    fallback.set(scope.key, id);
    return id;
  }
}

export const getCartSessionKey = (scope: CartScope) => sessionId(scope, "cart_session");
export const getGuestSessionId = (scope: CartScope) => sessionId(scope, "guest_session");

function decode(raw: string): Line[] {
  try {
    const data = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : data.lines;
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

function legacySnapshot(scope: CartScope): string {
  const raw = localStorage.getItem("wlc.cart.v3." + scope.storeId);
  if (!raw) return emptySnapshot;
  try {
    const legacy = JSON.parse(raw);
    // V3 lines had no owner. Only a saved checkout binds a quantity to a buyer.
    const attempts: CheckoutBinding[] = Array.isArray(legacy.attempts) ? legacy.attempts.filter(
      (a: CheckoutBinding) => a?.buyer === scope.owner && Array.isArray(a.lines) && Array.isArray(a.remaining)) : [];
    if (!attempts.length) return emptySnapshot;
    const lines = decode(raw).map(row => {
      const reserved = attempts.map(a => a.remaining.find(l => same(l, row))?.quantity ?? 0);
      return { ...row, quantity: Math.min(row.quantity, Math.max(0, ...reserved)) };
    }).filter(row => row.quantity > 0);
    return JSON.stringify({ lines, attempts, consumed: [] });
  } catch { return emptySnapshot; }
}

function snapshot(scope: CartScope, preview = false): string {
  if (!preview) isolateLegacyStorage();
  if (volatileScopes.has(scope.key)) return memory.get(scope.key) ?? emptySnapshot;
  try {
    return localStorage.getItem(cartKey(scope)) ?? legacySnapshot(scope);
  } catch {
    return memory.get(scope.key) ?? emptySnapshot;
  }
}

function scheduleCartHeartbeat(scope: CartScope, rows: Line[]) {
  const scopeKey = scope.key;
  heartbeats.get(scopeKey)?.schedule(() => {
    const itemCount = rows.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = rows.reduce(
      (sum, l) => sum + lineEffectivePrice(l) * l.quantity,
      0,
    );
    const locale = document.documentElement.lang === "en" ? "en" : "ar";
    const contact = contactCache.get(scopeKey) ?? {};

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
      notification: { guest_session_id: getGuestSessionId(scope), item_count: itemCount, subtotal, locale },
      abandoned: {
        action: "upsert",
        session_key: getCartSessionKey(scope),
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
  scope: CartScope,
  contact: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    currency?: string | null;
  },
) {
  if (typeof window === "undefined") return;
  const scopeKey = scope.key;
  const current = contactCache.get(scopeKey) ?? {};
  contactCache.set(scopeKey, {
    name: contact.name?.trim() || current.name,
    email: contact.email?.trim() || current.email,
    phone: contact.phone?.trim() || current.phone,
    currency: contact.currency?.trim() || current.currency,
  });
  const rows = decode(snapshot(scope));
  if (rows.length > 0) scheduleCartHeartbeat(scope, rows);
}

export function markWebCartRecovered(
  scope: CartScope,
  orderId?: string | null,
) {
  if (typeof window === "undefined") return;
  const scopeKey = scope.key;
  void heartbeats.get(scopeKey)?.recover({
    session_key: getCartSessionKey(scope),
    order_id: orderId || null,
  });
}

function subscribe(scope: CartScope, fn: () => void) {
  const eventName = `shop-cart:${scope.key}`;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === cartKey(scope)) fn();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(eventName, fn);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(eventName, fn);
  };
}

export function useCart() {
  const scope = useCartScope();
  const preview = Boolean(useStudioPreview());
  const subscribeToTenant = useCallback(
    (fn: () => void) => subscribe(scope, fn),
    [scope],
  );
  const getTenantSnapshot = useCallback(() => snapshot(scope, preview), [scope, preview]);
  const raw = useSyncExternalStore(
    subscribeToTenant,
    getTenantSnapshot,
    () => emptySnapshot,
  );
  return useMemo(() => decode(raw), [raw]);
}

export const same = (a: ReceiptLine, b: ReceiptLine) =>
  a.id === b.id && a.size === b.size && a.color === b.color;

function save(scope: CartScope, rows: Line[], state = cartState(scope), durable = false) {
  const scopeKey = scope.key;
  const serialized = JSON.stringify({ ...state, lines: rows });
  isolateLegacyStorage();
  try {
    localStorage.setItem(cartKey(scope), serialized);
    volatileScopes.delete(scopeKey);
  } catch (error) {
    if (durable) throw error;
    volatileScopes.add(scopeKey);
  }
  memory.set(scopeKey, serialized);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(`shop-cart:${scopeKey}`));
  }
  scheduleCartHeartbeat(scope, rows);
}

type Inventory = FlashSalePriceInput & {
  id: string; stock: number; image_path: string | null; max_order_qty: number | null; product_variants: Variant[];
};
export async function readInventory(tenant: CartScope, ids: string[]) {
  const { data, error } = await browserDb().from("products")
    .select("id,stock,image_path,price,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at,max_order_qty,product_variants(color,size,stock)")
    .eq("store_id", tenant.storeId).eq("is_active", true).in("id", ids).returns<Inventory[]>();
  if (error) throw error;
  return new Map(data.map(p => [p.id, p]));
}

export function inventoryForLine(p: Inventory | undefined, color: string, size: string) {
  const tracked = Boolean(p?.product_variants.length);
  const stock = tracked ? p?.product_variants.find(v => v.color === color && v.size === size)?.stock : p?.stock;
  return { stock: stock ?? 0, productStock: p?.stock ?? 0, variantStock: tracked, max_order_qty: p?.max_order_qty ?? null };
}

export async function refreshCartInventory(tenant: CartScope, ids: string[], isCurrent: () => boolean) {
  const inventory = await readInventory(tenant, ids);
  return cartLock(tenant, () => {
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
  });
}

export function change(scope: CartScope, line: Line, delta: number, defaultLimit: number | null) {
  return cartLock(scope, () => {
    const state = cartState(scope);
    const rows = state.lines;
    const i = rows.findIndex(l => same(l, line));
    if (delta > 0 && delta > remainingQuantity(rows, line, defaultLimit)) return false;
    const quantity = (rows[i]?.quantity ?? 0) + delta;
    if (i >= 0 && quantity <= 0) rows.splice(i, 1);
    else if (i >= 0) rows[i] = { ...line, quantity };
    else if (quantity > 0) rows.push({ ...line, quantity });
    if (delta < 0) reduceReserved(state, line, -delta);
    save(scope, rows, state);
    return true;
  });
}

function reduceReserved(state: CartState, line: ReceiptLine, removed: number) {
  for (const attempt of state.attempts) {
    const original = attempt.remaining.find(l => same(l, line));
    if (original) original.quantity = Math.max(0, original.quantity - removed);
  }
}

export function clearCart(tenant: CartScope) {
  const state = cartState(tenant);
  for (const attempt of state.attempts) attempt.remaining = [];
  save(tenant, [], state);
}

export function pendingCheckout(tenant: CartScope, buyer: string, signature: string) {
  const matching = cartState(tenant).attempts.filter(a => a.buyer === buyer && a.signature === signature);
  return matching.find(a => a.orderId) ?? matching[0];
}

export function reserveCartCheckout(tenant: CartScope, buyer: string, signature: string, fingerprint: string, method: string, lines: ReceiptLine[]) {
  return cartLock(tenant, () => {
    const state = cartState(tenant);
    if (buyer !== tenant.owner) throw new Error("Cart buyer changed");
    const prior = state.attempts.find(a => a.buyer === buyer && (a.signature === signature || a.fingerprint === fingerprint));
    if (prior) return prior;
    const attempt: CheckoutBinding = {
      key: crypto.randomUUID(), buyer, signature, fingerprint, method,
      lines: lines.map(l => ({ ...l })), remaining: lines.map(l => ({ ...l }))
    };
    state.attempts.push(attempt);
    save(tenant, state.lines, state, true);
    return attempt;
  }, true);
}

export function bindCartCheckout(tenant: CartScope, key: string, id: string) {
  return cartLock(tenant, () => {
    const state = cartState(tenant);
    const attempt = state.attempts.find(a => a.key === key);
    if (attempt && !state.consumed.includes(id)) {
      if (attempt.orderId && attempt.orderId !== id) throw new Error("Checkout binding changed");
      attempt.orderId = id;
      save(tenant, state.lines, state, true);
    }
  }, true);
}

export function discardCheckout(tenant: CartScope, keyOrOrder: string) {
  return cartLock(tenant, () => {
    const state = cartState(tenant);
    state.attempts = state.attempts.filter(a => a.key !== keyOrOrder && a.orderId !== keyOrOrder);
    save(tenant, state.lines, state, true);
  }, true);
}

export function consumeReceipt(tenant: CartScope, receipt: OrderReceipt) {
  return cartLock(tenant, () => {
    const state = cartState(tenant);
    const attempt = state.attempts.find(a => a.orderId === receipt.id);
    if (tenant.storeId !== receipt.store_id || !attempt || state.consumed.includes(receipt.id) || receipt.status === "cancelled" ||
      !(receipt.payment_status === "paid" || (receipt.payment_method === "cod" && ["unpaid", "cod_pending"].includes(receipt.payment_status ?? ""))) ||
      !Number.isFinite(receipt.total) || receipt.total < 0 || !receipt.currency || !receipt.lines.length) return false;
    // Verify the entire variant/quantity snapshot before touching a single cart line.
    const quantity = (lines: ReceiptLine[], line: ReceiptLine) => lines.filter(l => same(l, line)).reduce((n, l) => n + l.quantity, 0);
    if ([...receipt.lines, ...attempt.lines].some(l => quantity(receipt.lines, l) !== quantity(attempt.lines, l))) return false;
    for (const row of state.lines) {
      const remove = Math.min(row.quantity, quantity(attempt.remaining, row));
      row.quantity -= remove;
      reduceReserved(state, row, remove);
    }
    state.attempts = state.attempts.filter(a => a.key !== attempt.key);
    state.consumed.push(receipt.id);
    save(tenant, state.lines.filter(row => row.quantity > 0), state, true);
    return true;
  }, true);
}
