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
type TtqInstance = {
  page?: () => void;
  track?: (event: string, payload?: Record<string, unknown>) => void;
};
type TtqObj = TtqInstance & {
  load?: (id: string) => void;
  instance?: (id: string) => TtqInstance;
};
type GtagFn = (...args: unknown[]) => void;

export type ActivePixelConfig = {
  storeId: string;
  metaId: string;
  tiktokId: string;
  ga4Id: string;
};

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
    __wlcActivePixels?: ActivePixelConfig;
    __wlcPixelEvents?: FiredPixelEvent[];
  }
}

export function setActivePixelConfig(config: ActivePixelConfig) {
  if (typeof window === "undefined") return;
  window.__wlcActivePixels = {
    storeId: config.storeId,
    metaId: config.metaId.trim(),
    tiktokId: config.tiktokId.trim(),
    ga4Id: config.ga4Id.trim(),
  };
}

function getActivePixelConfig(): ActivePixelConfig {
  if (typeof window === "undefined") {
    return { storeId: "", metaId: "", tiktokId: "", ga4Id: "" };
  }
  if (window.__wlcActivePixels) {
    return window.__wlcActivePixels;
  }
  const root = document.getElementById("wlc-pixels-root");
  if (root) {
    return {
      storeId: root.dataset.storeId ?? "",
      metaId: (root.dataset.metaPixel ?? "").trim(),
      tiktokId: (root.dataset.tiktokPixel ?? "").trim(),
      ga4Id: (root.dataset.ga4Id ?? "").trim(),
    };
  }
  return { storeId: "", metaId: "", tiktokId: "", ga4Id: "" };
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

export function trackPageView(path?: string, configOverride?: ActivePixelConfig) {
  if (typeof window === "undefined") return;
  const active = configOverride ?? getActivePixelConfig();
  const pagePath = path || window.location.pathname + window.location.search;
  recordEvent("PageView", {
    page_path: pagePath,
    store_id: active.storeId,
  });

  try {
    if (active.metaId && typeof window.fbq === "function") {
      window.fbq("trackSingle", active.metaId, "PageView");
    }
  } catch {}

  try {
    if (active.tiktokId && window.ttq) {
      const inst =
        typeof window.ttq.instance === "function"
          ? window.ttq.instance(active.tiktokId)
          : null;
      if (inst && typeof inst.page === "function") {
        inst.page();
      }
    }
  } catch {}

  try {
    if (active.ga4Id && typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        send_to: active.ga4Id,
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
  const active = getActivePixelConfig();
  const currency = params.currency || "EGP";
  const value = Number(params.price) || 0;
  recordEvent("ViewContent", {
    store_id: active.storeId,
    content_id: params.id,
    content_name: params.name,
    value,
    currency,
  });

  try {
    if (active.metaId && typeof window.fbq === "function") {
      window.fbq("trackSingle", active.metaId, "ViewContent", {
        content_ids: [params.id],
        content_name: params.name,
        content_type: "product",
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (active.tiktokId && window.ttq && typeof window.ttq.instance === "function") {
      window.ttq.instance(active.tiktokId).track?.("ViewContent", {
        content_id: params.id,
        content_name: params.name,
        content_type: "product",
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (active.ga4Id && typeof window.gtag === "function") {
      window.gtag("event", "view_item", {
        send_to: active.ga4Id,
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
  const active = getActivePixelConfig();
  const currency = params.currency || "EGP";
  const quantity = Math.max(1, Math.round(params.quantity ?? 1));
  const unitPrice = Number(params.price) || 0;
  const value = Math.round(unitPrice * quantity * 100) / 100;
  const variant = [params.size, params.color].filter(Boolean).join(" / ");

  recordEvent("AddToCart", {
    store_id: active.storeId,
    content_id: params.id,
    content_name: params.name,
    quantity,
    value,
    currency,
  });

  try {
    if (active.metaId && typeof window.fbq === "function") {
      window.fbq("trackSingle", active.metaId, "AddToCart", {
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
    if (active.tiktokId && window.ttq && typeof window.ttq.instance === "function") {
      window.ttq.instance(active.tiktokId).track?.("AddToCart", {
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
    if (active.ga4Id && typeof window.gtag === "function") {
      window.gtag("event", "add_to_cart", {
        send_to: active.ga4Id,
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
  const active = getActivePixelConfig();
  const currency = params.currency || "EGP";
  const value = Math.round((Number(params.value) || 0) * 100) / 100;
  const numItems = params.items.reduce((s, it) => s + it.quantity, 0);

  recordEvent("InitiateCheckout", {
    store_id: active.storeId,
    num_items: numItems,
    value,
    currency,
  });

  try {
    if (active.metaId && typeof window.fbq === "function") {
      window.fbq("trackSingle", active.metaId, "InitiateCheckout", {
        content_ids: params.items.map((it) => it.id),
        content_type: "product",
        num_items: numItems,
        value,
        currency,
      });
    }
  } catch {}

  try {
    if (active.tiktokId && window.ttq && typeof window.ttq.instance === "function") {
      window.ttq.instance(active.tiktokId).track?.("InitiateCheckout", {
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
    if (active.ga4Id && typeof window.gtag === "function") {
      window.gtag("event", "begin_checkout", {
        send_to: active.ga4Id,
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
  storeId?: string;
  value: number;
  currency?: string;
  items?: PixelEventItem[];
}) {
  if (typeof window === "undefined") return;
  const active = getActivePixelConfig();
  if (params.storeId && params.storeId !== active.storeId) return;
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
    store_id: active.storeId,
    order_id: cleanOrderId,
    value,
    currency,
    item_count: items.reduce((s, it) => s + it.quantity, 0),
  });

  try {
    if (active.metaId && typeof window.fbq === "function") {
      window.fbq(
        "trackSingle",
        active.metaId,
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
    if (active.tiktokId && window.ttq && typeof window.ttq.instance === "function") {
      window.ttq.instance(active.tiktokId).track?.("CompletePayment", {
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
    if (active.ga4Id && typeof window.gtag === "function") {
      window.gtag("event", "purchase", {
        send_to: active.ga4Id,
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
