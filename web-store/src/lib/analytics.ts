"use client";

export type PixelEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export type PixelEventItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  variant?: string;
};

type FbqFn = (...args: unknown[]) => void;
type TtqObj = {
  page?: () => void;
  track?: (event: string, payload?: Record<string, unknown>) => void;
  load?: (id: string) => void;
};
type GtagFn = (...args: unknown[]) => void;

export type FiredPixelEvent = {
  event: PixelEventName;
  timestamp: number;
  payload: Record<string, unknown>;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
    ttq?: TtqObj;
    gtag?: GtagFn;
    dataLayer?: unknown[];
    __wlcInitializedPixels?: Set<string>;
    __wlcPixelEvents?: FiredPixelEvent[];
  }
}

function recordEvent(event: PixelEventName, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (!Array.isArray(window.__wlcPixelEvents)) {
      window.__wlcPixelEvents = [];
    }
    window.__wlcPixelEvents.push({
      event,
      timestamp: Date.now(),
      payload,
    });
    if (window.__wlcPixelEvents.length > 50) {
      window.__wlcPixelEvents.shift();
    }
    window.dispatchEvent(
      new CustomEvent("wlc:pixel-event", {
        detail: { event, payload },
      }),
    );
  } catch {}
}

export function trackPageView(path?: string) {
  if (typeof window === "undefined") return;
  const pagePath = path || window.location.pathname + window.location.search;
  recordEvent("PageView", { page_path: pagePath });

  try {
    if (typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  } catch {}

  try {
    if (window.ttq && typeof window.ttq.page === "function") {
      window.ttq.page();
    }
  } catch {}

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: pagePath,
        page_location: window.location.href,
      });
    }
  } catch {}
}

export function trackViewContent(params: {
  id: string;
  name: string;
  price: number;
  currency?: string;
  category?: string;
}) {
  if (typeof window === "undefined") return;
  const currency = params.currency || "EGP";
  const value = Number(params.price) || 0;
  recordEvent("ViewContent", {
    content_id: params.id,
    content_name: params.name,
    value,
    currency,
  });

  try {
    if (typeof window.fbq === "function") {
      window.fbq("track", "ViewContent", {
        content_ids: [params.id],
        content_name: params.name,
        content_type: "product",
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (window.ttq && typeof window.ttq.track === "function") {
      window.ttq.track("ViewContent", {
        content_id: params.id,
        content_name: params.name,
        content_type: "product",
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", "view_item", {
        currency,
        value,
        items: [
          {
            item_id: params.id,
            item_name: params.name,
            item_category: params.category,
            price: value,
            quantity: 1,
          },
        ],
      });
    }
  } catch {}
}

export function trackAddToCart(params: {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  currency?: string;
  size?: string;
  color?: string;
}) {
  if (typeof window === "undefined") return;
  const currency = params.currency || "EGP";
  const quantity = Math.max(1, Math.round(params.quantity ?? 1));
  const unitPrice = Number(params.price) || 0;
  const value = Math.round(unitPrice * quantity * 100) / 100;
  const variant = [params.size, params.color].filter(Boolean).join(" / ");

  recordEvent("AddToCart", {
    content_id: params.id,
    content_name: params.name,
    quantity,
    value,
    currency,
  });

  try {
    if (typeof window.fbq === "function") {
      window.fbq("track", "AddToCart", {
        content_ids: [params.id],
        content_name: params.name,
        content_type: "product",
        num_items: quantity,
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (window.ttq && typeof window.ttq.track === "function") {
      window.ttq.track("AddToCart", {
        content_id: params.id,
        content_name: params.name,
        content_type: "product",
        quantity,
        price: unitPrice,
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", "add_to_cart", {
        currency,
        value,
        items: [
          {
            item_id: params.id,
            item_name: params.name,
            item_variant: variant || undefined,
            price: unitPrice,
            quantity,
          },
        ],
      });
    }
  } catch {}
}

export function trackInitiateCheckout(params: {
  items: PixelEventItem[];
  value: number;
  currency?: string;
}) {
  if (typeof window === "undefined") return;
  const currency = params.currency || "EGP";
  const value = Math.round((Number(params.value) || 0) * 100) / 100;
  const numItems = params.items.reduce((s, it) => s + it.quantity, 0);

  recordEvent("InitiateCheckout", {
    num_items: numItems,
    value,
    currency,
  });

  try {
    if (typeof window.fbq === "function") {
      window.fbq("track", "InitiateCheckout", {
        content_ids: params.items.map((it) => it.id),
        content_type: "product",
        num_items: numItems,
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (window.ttq && typeof window.ttq.track === "function") {
      window.ttq.track("InitiateCheckout", {
        contents: params.items.map((it) => ({
          content_id: it.id,
          content_name: it.name,
          quantity: it.quantity,
          price: it.price,
        })),
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", "begin_checkout", {
        currency,
        value,
        items: params.items.map((it) => ({
          item_id: it.id,
          item_name: it.name,
          item_variant: it.variant,
          price: it.price,
          quantity: it.quantity,
        })),
      });
    }
  } catch {}
}

export function trackPurchase(params: {
  orderId: string;
  value: number;
  currency?: string;
  items?: PixelEventItem[];
}) {
  if (typeof window === "undefined") return;
  const cleanOrderId = (params.orderId ?? "").trim();
  if (!cleanOrderId) return;

  // Deduplicate per order_id in sessionStorage so refreshes never double-fire
  const dedupeKey = `wlc_purchase_tracked:${cleanOrderId}`;
  try {
    if (sessionStorage.getItem(dedupeKey) === "1") {
      return;
    }
    sessionStorage.setItem(dedupeKey, "1");
  } catch {}

  const currency = params.currency || "EGP";
  const value = Math.round((Number(params.value) || 0) * 100) / 100;
  const items = params.items ?? [];

  recordEvent("Purchase", {
    order_id: cleanOrderId,
    value,
    currency,
    item_count: items.reduce((s, it) => s + it.quantity, 0),
  });

  try {
    if (typeof window.fbq === "function") {
      window.fbq(
        "track",
        "Purchase",
        {
          content_ids: items.map((it) => it.id),
          content_type: "product",
          value,
          currency,
        },
        { eventID: cleanOrderId },
      );
    }
  } catch {}

  try {
    if (window.ttq && typeof window.ttq.track === "function") {
      window.ttq.track("CompletePayment", {
        content_type: "product",
        contents: items.map((it) => ({
          content_id: it.id,
          content_name: it.name,
          quantity: it.quantity,
          price: it.price,
        })),
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", "purchase", {
        transaction_id: cleanOrderId,
        currency,
        value,
        items: items.map((it) => ({
          item_id: it.id,
          item_name: it.name,
          item_variant: it.variant,
          price: it.price,
          quantity: it.quantity,
        })),
      });
    }
  } catch {}
}
