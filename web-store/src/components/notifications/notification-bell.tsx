"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  CheckCheck,
  X,
  Package,
  ShoppingCart,
  Sparkles,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { browserDb } from "@/lib/supabase/browser";
import { getGuestSessionId } from "@/components/shop/cart-store";

export type InboxItem = {
  id: string;
  user_id: string | null;
  target_role: "customer" | "admin";
  category:
    | "order_update"
    | "payment_recovery"
    | "abandoned_cart"
    | "back_in_stock"
    | "promo_campaign"
    | "admin_alert";
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  deep_link: string;
  is_read: boolean;
  created_at: string;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function formatRelativeTime(iso: string, lang: "ar" | "en", justNow: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return justNow;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return lang === "en" ? `${mins}m ago` : `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === "en" ? `${hrs}h ago` : `منذ ${hrs} س`;
  const days = Math.floor(hrs / 24);
  return lang === "en" ? `${days}d ago` : `منذ ${days} ي`;
}

function CategoryIcon({ category }: { category: InboxItem["category"] }) {
  switch (category) {
    case "order_update":
      return <Package size={16} />;
    case "abandoned_cart":
      return <ShoppingCart size={16} />;
    case "payment_recovery":
    case "admin_alert":
      return <AlertTriangle size={16} />;
    case "back_in_stock":
      return <BellRing size={16} />;
    default:
      return <Sparkles size={16} />;
  }
}

export function NotificationBell({
  storeId,
  userId = null,
  scope = "customer",
}: {
  storeId: string;
  userId?: string | null;
  scope?: "customer" | "admin";
}) {
  const { lang, t } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<
    "idle" | "granted" | "denied" | "unsupported"
  >("idle");
  const [pushNotice, setPushNotice] = useState("");
  const drawerRef = useRef<HTMLDivElement>(null);

  const refreshInbox = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications/inbox?scope=${scope}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { items?: InboxItem[] };
      if (Array.isArray(body.items)) {
        setItems(body.items);
      }
    } catch {
      // Silent network resilience
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    let active = true;
    fetch(`/api/notifications/inbox?scope=${scope}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { items?: InboxItem[] } | null) => {
        if (active && body && Array.isArray(body.items)) {
          setItems(body.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope]);

  function syncBrowserPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPushState("unsupported");
    } else if (Notification.permission === "granted") {
      setPushState("granted");
    } else if (Notification.permission === "denied") {
      setPushState("denied");
    } else {
      setPushState("idle");
    }
  }

  // Supabase Realtime subscription on public.notifications
  useEffect(() => {
    if (!storeId) return;
    const supabase = browserDb();

    const channelName = `notifications:${scope}:${storeId}:${userId ?? "guest"}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `store_id=eq.${storeId}`,
        },
        (payload: { new?: unknown }) => {
          const row = payload.new as InboxItem | undefined;
          if (!row) return;
          const matchesScope =
            scope === "admin"
              ? row.target_role === "admin"
              : row.target_role === "customer" &&
                (row.user_id === null || (userId !== null && row.user_id === userId));
          if (!matchesScope) return;
          setItems((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [row, ...prev].slice(0, 40);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, userId, scope]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items],
  );

  async function markOneRead(item: InboxItem) {
    setItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
    );
    if (item.user_id || scope === "admin") {
      void fetch("/api/notifications/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, scope }),
      }).catch(() => {});
    }
    setOpen(false);
    if (item.deep_link && item.deep_link.startsWith("/")) {
      router.push(item.deep_link);
    }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    void fetch("/api/notifications/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true, scope }),
    }).catch(() => {});
  }

  async function enableBrowserPush() {
    setPushNotice("");
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator)
    ) {
      setPushState("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushState("denied");
      setPushNotice(t("notifPushDenied"));
      return;
    }

    setPushState("granted");
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
    if (!vapidKey) {
      setPushNotice(t("notifPushUnavailable"));
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const subscription =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));

      const token = JSON.stringify(subscription.toJSON());
      await fetch("/api/notifications/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "web",
          token,
          locale: lang,
          guest_session_id: getGuestSessionId(),
        }),
      });
      setPushNotice(t("notifPushEnabled"));
    } catch {
      setPushNotice(t("notifPushUnavailable"));
    }
  }

  return (
    <>
      <button
        type="button"
        className={`notif-bell-btn ${scope === "admin" ? "is-admin" : ""}`}
        aria-label={`${t("notifTitle")}${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
        aria-expanded={open}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            syncBrowserPermission();
            void refreshInbox();
          }
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-bell-badge" aria-live="polite">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="notif-drawer-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <aside
            ref={drawerRef}
            className="notif-drawer"
            role="dialog"
            aria-label={t("notifTitle")}
          >
            <header className="notif-drawer-head">
              <div className="notif-drawer-title">
                <BellRing size={18} />
                <h2>{t("notifTitle")}</h2>
                {unreadCount > 0 && (
                  <span className="notif-pill-count">{unreadCount}</span>
                )}
              </div>
              <div className="notif-drawer-actions">
                <button
                  type="button"
                  className="notif-icon-btn"
                  title={t("notifMarkAllRead")}
                  aria-label={t("notifMarkAllRead")}
                  onClick={() => void markAllRead()}
                >
                  <CheckCheck size={16} />
                </button>
                <button
                  type="button"
                  className="notif-icon-btn"
                  aria-label={t("notifClose")}
                  onClick={() => setOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            {pushState !== "unsupported" && (
              <div className="notif-push-bar">
                {pushState === "granted" ? (
                  <span className="notif-push-ok">
                    <BellRing size={14} />
                    {pushNotice || t("notifPushEnabled")}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="notif-enable-btn"
                    onClick={() => void enableBrowserPush()}
                  >
                    <BellRing size={14} />
                    <span>{t("notifEnablePush")}</span>
                  </button>
                )}
                {pushNotice && pushState !== "granted" && (
                  <small className="notif-push-note">{pushNotice}</small>
                )}
              </div>
            )}

            <div className="notif-list">
              {loading ? (
                <div className="notif-empty">
                  <RefreshCw size={18} className="notif-spin" />
                  <p>{t("notifLoading")}</p>
                </div>
              ) : items.length === 0 ? (
                <div className="notif-empty">
                  <Bell size={26} strokeWidth={1.4} />
                  <p>{t("notifEmpty")}</p>
                </div>
              ) : (
                items.map((item) => {
                  const title = lang === "en" ? item.title_en : item.title_ar;
                  const body = lang === "en" ? item.body_en : item.body_ar;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`notif-card ${item.is_read ? "is-read" : "is-unread"}`}
                      onClick={() => void markOneRead(item)}
                    >
                      <span className={`notif-cat-icon cat-${item.category}`}>
                        <CategoryIcon category={item.category} />
                      </span>
                      <span className="notif-card-content">
                        <span className="notif-card-top">
                          <strong>{title}</strong>
                          <small>
                            {formatRelativeTime(
                              item.created_at,
                              lang,
                              t("notifJustNow"),
                            )}
                          </small>
                        </span>
                        <span className="notif-card-body">{body}</span>
                      </span>
                      {!item.is_read && <span className="notif-unread-dot" />}
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
