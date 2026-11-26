"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
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
  Trash2,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { browserDb } from "@/lib/supabase/browser";
import { syncWebPushSubscription } from "@/lib/notifications/web-push";
import { safeRelativePath } from "@/lib/security";
import { CARRIER_PRESETS } from "@/lib/shipping";
import { storeHref } from "@/lib/tenant-shared";

function normalizeEnglishCarrierText(text: string): string {
  let out = text;
  for (const preset of CARRIER_PRESETS) {
    if (out.includes(preset.label)) {
      out = out.replaceAll(preset.label, preset.label_en);
    }
  }
  return out;
}

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
  read_at?: string | null;
  created_at: string;
};

const emptySubscribe = () => () => {};

function readLocalSet(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function addLocalIds(storageKey: string, ids: string[]) {
  if (typeof window === "undefined" || ids.length === 0) return;
  try {
    const set = readLocalSet(storageKey);
    for (const id of ids) set.add(id);
    localStorage.setItem(storageKey, JSON.stringify(Array.from(set).slice(-200)));
  } catch {}
}

function formatRelativeTime(
  iso: string,
  lang: "ar" | "en",
  justNow: string,
): string {
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
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
  basePath = "",
}: {
  storeId: string;
  userId?: string | null;
  scope?: "customer" | "admin";
  basePath?: string;
}) {
  const { lang, t } = useLanguage();
  const router = useRouter();
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<
    "idle" | "granted" | "denied" | "unsupported"
  >("idle");
  const [pushNotice, setPushNotice] = useState("");
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasOpenedRef = useRef(false);

  const localReadKey = `nova.notif.read.${storeId}.${scope}`;
  const localDismissedKey = `nova.notif.dismissed.${storeId}.${scope}`;

  const hydrateInbox = useCallback(
    (rawItems: InboxItem[]) => {
      const localRead = readLocalSet(localReadKey);
      const localDismissed = readLocalSet(localDismissedKey);
      return rawItems
        .filter((n) => !localDismissed.has(n.id))
        .map((n) => ({
          ...n,
          is_read: Boolean(n.is_read || n.read_at || localRead.has(n.id)),
        }));
    },
    [localReadKey, localDismissedKey],
  );

  const refreshInbox = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications/inbox?scope=${scope}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { items?: InboxItem[] };
      if (Array.isArray(body.items)) {
        setItems(hydrateInbox(body.items));
      }
    } catch {
      // Silent network resilience
    } finally {
      setLoading(false);
    }
  }, [scope, hydrateInbox]);

  useEffect(() => {
    let active = true;
    fetch(`/api/notifications/inbox?scope=${scope}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { items?: InboxItem[] } | null) => {
        if (active && body && Array.isArray(body.items)) {
          setItems(hydrateInbox(body.items));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, hydrateInbox]);

  // Auto-mark notification as read if opened from an external Web Push link (?notif_id=<uuid>)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const notifId = params.get("notif_id")?.trim();
    if (!notifId || !/^[0-9a-f-]{36}$/i.test(notifId)) return;

    addLocalIds(localReadKey, [notifId]);
    void fetch("/api/notifications/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ id: notifId, scope }),
    })
      .then(() => {
        setItems((prev) =>
          prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n)),
        );
      })
      .catch(() => {});

    params.delete("notif_id");
    const nextSearch = params.toString();
    const cleanUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", cleanUrl);
  }, [localReadKey, scope]);

  // Auto-register / refresh Web Push subscription on mount & language/user changes when permission is granted
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    void syncWebPushSubscription(lang, storeId);
  }, [lang, userId, storeId]);

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

  // Supabase Realtime subscription on public.notifications (INSERT, UPDATE, DELETE)
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
                (row.user_id === null ||
                  (userId !== null && row.user_id === userId));
          if (!matchesScope) return;
          setItems((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [
              { ...row, is_read: Boolean(row.is_read || row.read_at) },
              ...prev,
            ].slice(0, 40);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `store_id=eq.${storeId}`,
        },
        (payload: { new?: unknown }) => {
          const row = payload.new as Partial<InboxItem> | undefined;
          if (!row?.id) return;
          setItems((prev) =>
            prev.map((n) =>
              n.id === row.id
                ? {
                    ...n,
                    ...row,
                    is_read: Boolean(row.is_read || row.read_at || n.is_read),
                  }
                : n,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
        },
        (payload: { old?: unknown }) => {
          const deleted = payload.old as { id?: string } | undefined;
          if (!deleted?.id) return;
          setItems((prev) => prev.filter((n) => n.id !== deleted.id));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storeId, userId, scope]);

  // Close on Escape and lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        drawerRef.current?.querySelector<HTMLElement>("button")?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (hasOpenedRef.current) {
      hasOpenedRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items],
  );

  async function markOneRead(item: InboxItem) {
    setItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
    );
    addLocalIds(localReadKey, [item.id]);
    // Persist read_at for both personal AND broadcast (user_id === null) rows via SECURITY DEFINER RPC
    void fetch("/api/notifications/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ id: item.id, scope }),
    }).catch(() => {});
    setOpen(false);
    const safeLink = safeRelativePath(item.deep_link, "");
    if (safeLink) {
      const target =
        scope === "customer" && basePath && !safeLink.startsWith("/admin")
          ? storeHref(basePath, safeLink)
          : safeLink;
      router.push(target);
    }
  }

  async function markAllRead() {
    const ids = items.map((n) => n.id);
    addLocalIds(localReadKey, ids);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    void fetch("/api/notifications/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true, mark_all: true, scope }),
    }).catch(() => {});
  }

  async function deleteOne(item: InboxItem, e: React.MouseEvent) {
    e.stopPropagation();
    addLocalIds(localDismissedKey, [item.id]);
    setItems((prev) => prev.filter((n) => n.id !== item.id));
    if (item.user_id || scope === "admin") {
      void fetch(
        `/api/notifications/inbox?id=${encodeURIComponent(item.id)}&scope=${scope}`,
        { method: "DELETE" },
      ).catch(() => {});
    }
  }

  async function clearAllItems() {
    const ids = items.map((n) => n.id);
    if (ids.length === 0) return;
    addLocalIds(localDismissedKey, ids);
    setItems([]);
    void fetch(`/api/notifications/inbox?clearAll=true&scope=${scope}`, {
      method: "DELETE",
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
    const result = await syncWebPushSubscription(lang, storeId);
    setPushNotice(result.ok ? t("notifPushEnabled") : t("notifPushUnavailable"));
  }

  const drawerNode =
    open && isClient
      ? createPortal(
          <div
            className="notif-drawer-backdrop"
            dir={lang === "en" ? "ltr" : "rtl"}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <aside
              ref={drawerRef}
              className="notif-drawer"
              role="dialog"
              aria-modal="true"
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
                  {items.length > 0 && (
                    <>
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
                        className="notif-icon-btn is-danger"
                        title={t("notifClearAll")}
                        aria-label={t("notifClearAll")}
                        onClick={() => void clearAllItems()}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
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
                    const title =
                      lang === "en"
                        ? normalizeEnglishCarrierText(item.title_en)
                        : item.title_ar;
                    const body =
                      lang === "en"
                        ? normalizeEnglishCarrierText(item.body_en)
                        : item.body_ar;
                    return (
                      <div
                        key={item.id}
                        className={`notif-item-row ${item.is_read ? "is-read" : "is-unread"}`}
                      >
                        <button
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
                        <button
                          type="button"
                          className="notif-item-del-btn"
                          title={t("notifDeleteItem")}
                          aria-label={`${t("notifDeleteItem")}: ${title}`}
                          onClick={(e) => void deleteOne(item, e)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          </div>,
          scope === "admin" ? document.querySelector("[data-workspace-overlay]") ?? document.body : document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
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
      {drawerNode}
    </>
  );
}
