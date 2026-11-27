export type CartScope = { storeId: string; owner: string; key: string };

export function cartScope(storeId: string, userId: string | null): CartScope {
  const owner = userId || "guest";
  if (!storeId.trim() || storeId.includes(":") || owner.includes(":")) throw new Error("Invalid cart scope");
  return { storeId, owner, key: storeId + ":" + owner };
}

export function clearCartSessionStorage(userId: string) {
  try {
    // Keep each owner's durable checkout ledger for retries and paid receipt reconciliation.
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && ((key.endsWith(":" + userId) && /^wlc\.(?:cart_session|guest_session|pending_online_order|checkout)\./.test(key)) ||
          key === "nova.pending_online_order" || key.startsWith("nova.checkout."))) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch { /* Browsers with disabled persistence still drop the in-memory session. */ }
}
