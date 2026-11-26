"use client";

import { showToast, ToastFeedback } from "@/components/floating-toast";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  MessageCircle,
  Copy,
  Check,
  XCircle,
  UserRound,
  Phone,
  Mail,
  Clock3,
  Globe,
  Smartphone,
  TicketPercent,
  ExternalLink,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { money } from "@/lib/brand";
import { translateColor, type Lang } from "@/lib/i18n";
import {
  abandonedCartStatusMeta,
  buildWhatsAppRecoveryUrl,
  formatTimeAgo,
  type AbandonedCartRecord,
  type AbandonedCartStatus,
} from "@/lib/marketing";
import { updateAbandonedCartAction } from "../mutations";

export type ActiveCouponOption = {
  code: string;
  discount_type: string;
  discount_value: number;
};

export type AbandonedCartFilter = "all" | "open" | "reminded" | "recovered";

export type AbandonedCartSummary = {
  all: number;
  open: number;
  reminded: number;
  recovered: number;
  recoverable_value: number;
};

export function AdminAbandonedCartsClient({
  initialCarts,
  coupons,
  storeName,
  currency,
  cartBasePath,
  initialLang,
  status,
  page,
  pageSize,
  totalCount,
  summary,
}: {
  initialCarts: AbandonedCartRecord[];
  coupons: ActiveCouponOption[];
  storeName: string;
  currency: string;
  cartBasePath: string;
  initialLang: Lang;
  status: AbandonedCartFilter;
  page: number;
  pageSize: number;
  totalCount: number;
  summary: AbandonedCartSummary;
}) {
  const router = useRouter();
  const { lang: ctxLang } = useLanguage();
  const lang = ctxLang ?? initialLang;
  const isEn = lang === "en";

  const [carts, setCarts] = useState<AbandonedCartRecord[]>(initialCarts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [couponById, setCouponById] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of initialCarts) {
      map[c.id] = c.recovery_coupon_code ?? "";
    }
    return map;
  });
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const kpis = {
    open: summary.open,
    reminded: summary.reminded,
    recovered: summary.recovered,
    recoverableValue: summary.recoverable_value,
  };
  const visibleCarts = carts.filter((cart) =>
    status === "all" ? cart.status !== "dismissed" : cart.status === status,
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageHref = (nextStatus: AbandonedCartFilter, nextPage = 1) => {
    const query = new URLSearchParams();
    if (nextStatus !== "all") query.set("status", nextStatus);
    if (nextPage > 1) query.set("page", String(nextPage));
    const suffix = query.toString();
    return suffix ? `/admin/abandoned-carts?${suffix}` : "/admin/abandoned-carts";
  };

  function getAbsoluteCartUrl(couponCode?: string): string {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const qs = couponCode ? `?coupon=${encodeURIComponent(couponCode)}` : "";
    return `${origin}${cartBasePath}${qs}`;
  }

  async function handleCopyLink(cart: AbandonedCartRecord) {
    const chosenCoupon = (couponById[cart.id] ?? "").trim();
    const url = getAbsoluteCartUrl(chosenCoupon || undefined);
    try {
      await navigator.clipboard.writeText(url);
      showToast({ kind: "success", message: document.documentElement.lang.startsWith("en") ? "Copied to clipboard" : "تم النسخ" });
      setCopiedId(cart.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {}
  }

  async function handleWhatsAppRemind(cart: AbandonedCartRecord) {
    const chosenCoupon = (couponById[cart.id] ?? "").trim() || null;
    const cartUrl = getAbsoluteCartUrl(chosenCoupon ?? undefined);
    const waUrl = buildWhatsAppRecoveryUrl({
      phone: cart.customer_phone,
      customerName: cart.customer_name,
      storeName,
      items: cart.items,
      subtotal: cart.subtotal,
      currency: cart.currency || currency,
      cartUrl,
      couponCode: chosenCoupon,
      lang,
    });

    if (!waUrl) {
      setNotice({
        kind: "err",
        text: isEn
          ? "No phone number captured for this shopper yet."
          : "لا يوجد رقم هاتف مسجّل لهذا العميل بعد.",
      });
      return;
    }

    // Open WhatsApp immediately in a new tab before async DB mark
    window.open(waUrl, "_blank", "noopener,noreferrer");

    setBusyId(cart.id);
    setNotice(null);
    try {
      const res = await updateAbandonedCartAction({
        cartId: cart.id,
        action: "mark_reminded",
        couponCode: chosenCoupon,
      });
      if (!res.ok) {
        setNotice({
          kind: "err",
          text: isEn
            ? "WhatsApp opened, but could not update reminder status."
            : "تم فتح واتساب ولكن تعذر تحديث حالة التذكير.",
        });
        return;
      }
      setCarts((prev) =>
        prev.map((row) =>
          row.id === cart.id
            ? {
                ...row,
                status: res.cart.status as AbandonedCartStatus,
                reminder_count: res.cart.reminder_count,
                last_reminded_at: res.cart.last_reminded_at,
                recovery_coupon_code: res.cart.recovery_coupon_code,
                updated_at: res.cart.updated_at,
              }
            : row,
        ),
      );
      setNotice({
        kind: "ok",
        text: isEn
          ? "WhatsApp recovery message prepared and cart marked as Reminded."
          : "تم تجهيز رسالة التذكير عبر واتساب وتحديث حالة السلة إلى تم التذكير.",
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(cart: AbandonedCartRecord) {
    setBusyId(cart.id);
    setNotice(null);
    try {
      const res = await updateAbandonedCartAction({
        cartId: cart.id,
        action: "dismiss",
      });
      if (!res.ok) {
        setNotice({
          kind: "err",
          text: isEn ? "Could not dismiss cart." : "تعذر تجاهل السلة.",
        });
        return;
      }
      setCarts((prev) =>
        prev.map((row) =>
          row.id === cart.id ? { ...row, status: "dismissed" } : row,
        ),
      );
      setNotice({
        kind: "ok",
        text: isEn ? "Abandoned cart dismissed." : "تم تجاهل السلة المتروكة.",
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem", minWidth: 0 }}>
      <div>
        <h1 style={{ margin: 0 }}>
          {isEn
            ? "Omnichannel Abandoned Cart Recovery"
            : "استرداد السلات المتروكة (الويب والموبايل)"}
        </h1>
        <p
          style={{
            margin: "0.25rem 0 0",
            color: "var(--muted)",
            fontSize: "0.9rem",
          }}
        >
          {isEn
            ? "Recover lost sales from Web & Android shoppers with 1-click WhatsApp reminders and promo incentives."
            : "استرجع المبيعات المفقودة من متسوقي الموقع وتطبيق أندرويد برسالة واتساب بضغطة واحدة مع كوبون خصم اختياري."}
        </p>
      </div>

      {/* Top 3 KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <div
          className="card"
          style={{ padding: "1rem 1.15rem", display: "grid", gap: "0.25rem" }}
        >
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Open Carts" : "سلات مفتوحة"}
          </small>
          <strong
            style={{
              fontSize: "1.55rem",
              color: kpis.open > 0 ? "#d97706" : "inherit",
            }}
          >
            {kpis.open}
          </strong>
        </div>

        <div
          className="card"
          style={{ padding: "1rem 1.15rem", display: "grid", gap: "0.25rem" }}
        >
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Recoverable Value" : "مبيعات قابلة للاسترداد"}
          </small>
          <strong style={{ fontSize: "1.45rem", color: "var(--primary)" }} dir="ltr">
            {money(kpis.recoverableValue, currency, lang)}
          </strong>
        </div>

        <div
          className="card"
          style={{ padding: "1rem 1.15rem", display: "grid", gap: "0.25rem" }}
        >
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Recovered Carts" : "سلات مستردة"}
          </small>
          <strong
            style={{
              fontSize: "1.55rem",
              color: kpis.recovered > 0 ? "#047857" : "inherit",
            }}
          >
            {kpis.recovered}
          </strong>
        </div>
      </div>

      {/* Filter Tabs & Status Notice */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div
          role="tablist"
          aria-label={isEn ? "Filter abandoned carts" : "تصفية السلات المتروكة"}
          style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}
        >
          {(
            [
              {
                key: "all" as const,
                label: isEn
                  ? `All (${summary.all})`
                  : `الكل (${summary.all})`,
              },
              {
                key: "open" as const,
                label: isEn ? `Open (${kpis.open})` : `مفتوحة (${kpis.open})`,
              },
              {
                key: "reminded" as const,
                label: isEn
                  ? `Reminded (${kpis.reminded})`
                  : `تم التذكير (${kpis.reminded})`,
              },
              {
                key: "recovered" as const,
                label: isEn
                  ? `Recovered (${kpis.recovered})`
                  : `تم الاسترداد (${kpis.recovered})`,
              },
            ] as const
          ).map((tab) => {
            const active = status === tab.key;
            return (
              <Link
                key={tab.key}
                href={pageHref(tab.key)}
                role="tab"
                aria-selected={active}
                style={{
                  background: active ? "var(--primary)" : "var(--surface)",
                  color: active ? "#ffffff" : "var(--ink)",
                  border: active
                    ? "1px solid var(--primary)"
                    : "1px solid var(--line)",
                  borderRadius: "999px",
                  padding: "0.4rem 0.9rem",
                  fontSize: "0.82rem",
                  fontWeight: 650,
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {notice && <ToastFeedback message={notice.text} kind={notice.kind === "ok" ? "success" : "error"} />}
      </div>

      {/* Cart Cards */}
      {visibleCarts.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "2.5rem 1.25rem",
            textAlign: "center",
            color: "var(--muted)",
            display: "grid",
            gap: "0.45rem",
            justifyItems: "center",
          }}
        >
          <ShoppingCart size={28} style={{ opacity: 0.45 }} />
          <p style={{ margin: 0, fontWeight: 650 }}>
            {status === "all"
              ? isEn
                ? "No abandoned carts captured yet. Carts from Web & Android shoppers will appear here automatically."
                : "لا توجد سلات متروكة مسجّلة حتى الآن. ستظهر هنا تلقائياً سلات متسوقي الموقع وتطبيق أندرويد."
              : isEn
                ? "No abandoned carts match this filter."
                : "لا توجد سلات ضمن هذا التصنيف."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {visibleCarts.map((cart) => {
            const statusMeta = abandonedCartStatusMeta(cart.status, lang);
            const isBusy = busyId === cart.id;
            const chosenCoupon = couponById[cart.id] ?? "";
            const hasPhone = Boolean(cart.customer_phone?.trim());
            const isRecoverable =
              cart.status === "open" || cart.status === "reminded";

            return (
              <article
                key={cart.id}
                className="card"
                style={{
                  padding: "1.15rem 1.25rem",
                  display: "grid",
                  gap: "0.85rem",
                  minWidth: 0,
                }}
              >
                {/* Header: Customer + Source Badge + Subtotal + Status */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: "0.28rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          fontSize: "0.96rem",
                        }}
                      >
                        <UserRound size={15} />
                        {cart.customer_name ||
                          cart.customer_email ||
                          (isEn ? "Guest Shopper" : "متسوق زائر")}
                      </strong>

                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.28rem",
                          padding: "0.18rem 0.58rem",
                          borderRadius: "999px",
                          background:
                            cart.source === "android" ? "#ecfdf5" : "#eff6ff",
                          color:
                            cart.source === "android" ? "#047857" : "#1d4ed8",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                        }}
                      >
                        {cart.source === "android" ? (
                          <Smartphone size={12} />
                        ) : (
                          <Globe size={12} />
                        )}
                        {cart.source === "android" ? "Android" : "Web"}
                      </span>

                      {cart.reminder_count > 0 && (
                        <span
                          style={{
                            padding: "0.18rem 0.55rem",
                            borderRadius: "999px",
                            background: "#f8fafc",
                            border: "1px solid var(--line)",
                            fontSize: "0.73rem",
                            fontWeight: 650,
                            color: "var(--muted)",
                          }}
                        >
                          {isEn
                            ? `Reminded ${cart.reminder_count}×`
                            : `تذكير ${cart.reminder_count} مرة`}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.85rem",
                        flexWrap: "wrap",
                        fontSize: "0.8rem",
                        color: "var(--muted)",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <Clock3 size={12} />
                        {formatTimeAgo(cart.updated_at, lang)}
                      </span>
                      {cart.customer_phone && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            color: "var(--ink)",
                            fontWeight: 600,
                          }}
                        >
                          <Phone size={12} />
                          <bdi dir="ltr">{cart.customer_phone}</bdi>
                        </span>
                      )}
                      {cart.customer_email && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <Mail size={12} />
                          <bdi dir="ltr">{cart.customer_email}</bdi>
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong dir="ltr" style={{ fontSize: "1.05rem" }}>
                      {money(cart.subtotal, cart.currency || currency, lang)}
                    </strong>
                    <span
                      style={{
                        padding: "0.22rem 0.68rem",
                        borderRadius: "999px",
                        fontSize: "0.77rem",
                        fontWeight: 700,
                        background: statusMeta.bg,
                        color: statusMeta.color,
                        border: `1px solid ${statusMeta.border}`,
                      }}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                </div>

                {/* Items List */}
                {cart.items.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.45rem",
                    }}
                  >
                    {cart.items.map((it, idx) => (
                      <span
                        key={`${it.id}-${idx}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          padding: "0.32rem 0.7rem",
                          borderRadius: "8px",
                          border: "1px solid var(--line)",
                          background: "var(--wash, #f8fafc)",
                          fontSize: "0.82rem",
                        }}
                      >
                        <strong>
                          {it.name} × {it.quantity}
                        </strong>
                        {(it.size || it.color) && (
                          <span style={{ color: "var(--muted)" }}>
                            (
                            {[
                              it.size,
                              it.color ? translateColor(it.color, lang) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            )
                          </span>
                        )}
                        <span
                          dir="ltr"
                          style={{ color: "var(--primary)", fontWeight: 700 }}
                        >
                          {money(
                            it.price * it.quantity,
                            cart.currency || currency,
                            lang,
                          )}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Recovery Actions or Recovered Order Link */}
                {isRecoverable ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--line)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          fontSize: "0.8rem",
                          fontWeight: 650,
                        }}
                      >
                        <TicketPercent size={15} color="var(--primary)" />
                        <select
                          aria-label={
                            isEn ? "Attach recovery coupon" : "إرفاق كوبون خصم"
                          }
                          value={chosenCoupon}
                          onChange={(e) =>
                            setCouponById((prev) => ({
                              ...prev,
                              [cart.id]: e.target.value,
                            }))
                          }
                          style={{
                            padding: "0.38rem 0.65rem",
                            borderRadius: "8px",
                            border: "1px solid var(--line)",
                            fontSize: "0.82rem",
                          }}
                        >
                          <option value="">
                            {isEn ? "No promo coupon" : "بدون كوبون خصم"}
                          </option>
                          {coupons.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} (
                              {c.discount_type === "percent"
                                ? `${c.discount_value}%`
                                : money(c.discount_value, currency, lang)}
                              )
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        disabled={isBusy || !hasPhone}
                        title={
                          hasPhone
                            ? undefined
                            : isEn
                              ? "Customer phone not captured yet"
                              : "رقم هاتف العميل غير متوفر بعد"
                        }
                        onClick={() => void handleWhatsAppRemind(cart)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.38rem",
                          padding: "0.48rem 0.95rem",
                          borderRadius: "9px",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          background: hasPhone ? "#15803d" : "#94a3b8",
                          color: "#ffffff",
                          border: "0",
                        }}
                      >
                        <MessageCircle size={15} />
                        <span>
                          {isEn
                            ? "Send WhatsApp Reminder"
                            : "إرسال تذكير واتساب"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopyLink(cart)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.46rem 0.85rem",
                          borderRadius: "9px",
                          fontSize: "0.82rem",
                          fontWeight: 650,
                          background: "var(--surface)",
                          color: "var(--ink)",
                          border: "1px solid var(--line)",
                        }}
                      >
                        {copiedId === cart.id ? (
                          <Check size={14} color="#047857" />
                        ) : (
                          <Copy size={14} />
                        )}
                        <span>
                          {copiedId === cart.id
                            ? isEn
                              ? "Copied!"
                              : "تم النسخ!"
                            : isEn
                              ? "Copy Cart Link"
                              : "نسخ رابط السلة"}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDismiss(cart)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.46rem 0.8rem",
                          borderRadius: "9px",
                          fontSize: "0.82rem",
                          fontWeight: 650,
                          background: "#fef2f2",
                          color: "#b91c1c",
                          border: "1px solid #fecaca",
                        }}
                      >
                        <XCircle size={14} />
                        <span>{isEn ? "Dismiss" : "تجاهل"}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  cart.recovered_order_id && (
                    <div
                      style={{
                        paddingTop: "0.65rem",
                        borderTop: "1px solid var(--line)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.83rem",
                          color: "#047857",
                          fontWeight: 650,
                        }}
                      >
                        {isEn
                          ? "Converted into completed order"
                          : "تم تحويل السلة إلى طلب مكتمل"}
                      </span>
                      <Link
                        href={`/admin/orders/${cart.recovered_order_id}`}
                        className="btn-outline-admin"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        <span dir="ltr">
                          #{cart.recovered_order_id.slice(0, 8)}
                        </span>
                        <ExternalLink size={13} />
                      </Link>
                    </div>
                  )
                )}
              </article>
            );
          })}
        </div>
      )}
      {totalPages > 1 && (
        <nav
          aria-label={isEn ? "Abandoned carts pagination" : "صفحات السلات المتروكة"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          {page > 1 && (
            <Link className="btn-outline-admin" href={pageHref(status, page - 1)}>
              {isEn ? "Previous" : "السابق"}
            </Link>
          )}
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {isEn
              ? `Page ${page} of ${totalPages} · ${totalCount} carts`
              : `صفحة ${page} من ${totalPages} · ${totalCount} سلة`}
          </span>
          {page < totalPages && (
            <Link className="btn-outline-admin" href={pageHref(status, page + 1)}>
              {isEn ? "Next" : "التالي"}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
