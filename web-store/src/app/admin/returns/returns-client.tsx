"use client";

import { ToastFeedback } from "@/components/floating-toast";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  RotateCcw,
  ArrowLeftRight,
  Wallet,
  CreditCard,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Phone,
  MapPin,
  UserRound,
  ExternalLink,
  Clock3,
  Check,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { date, money } from "@/lib/brand";
import { translateColor, type Lang } from "@/lib/i18n";
import {
  localizeReturnReason,
  refundMethodLabel,
  returnStatusMeta,
  returnTypeLabel,
  type ReturnRequestRecord,
  type ReturnRequestStatus,
} from "@/lib/returns";
import {
  processReturnRequestAction,
  saveReturnWindowDaysAction,
  type ProcessReturnActionType,
} from "../mutations";

export type AdminReturnCardItem = ReturnRequestRecord & {
  currency: string;
  order_total: number | null;
  order_payment_method: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
};

type FilterTab = "all" | ReturnRequestStatus;

export function AdminReturnsClient({
  initialReturns,
  initialLang,
  currency,
  initialReturnWindowDays = 14,
}: {
  initialReturns: AdminReturnCardItem[];
  initialLang: Lang;
  currency: string;
  initialReturnWindowDays?: number;
}) {
  const { lang: ctxLang } = useLanguage();
  const lang = ctxLang ?? initialLang;
  const isEn = lang === "en";

  const [items, setItems] = useState<AdminReturnCardItem[]>(initialReturns);
  const [returnWindowInput, setReturnWindowInput] = useState(
    String(initialReturnWindowDays),
  );
  const [savingWindow, setSavingWindow] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const r of initialReturns) {
      map[r.id] = r.admin_notes ?? "";
    }
    return map;
  });
  const [restockById, setRestockById] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const kpis = useMemo(() => {
    const pending = items.filter((r) => r.status === "pending").length;
    const approved = items.filter(
      (r) => r.status === "approved" || r.status === "received",
    ).length;
    const received = items.filter((r) => r.status === "received").length;
    const refunded = items.filter((r) => r.status === "refunded").length;
    const rejected = items.filter((r) => r.status === "rejected").length;
    const walletRefundedTotal = items
      .filter((r) => r.status === "refunded" && r.wallet_credited)
      .reduce((sum, r) => sum + Number(r.refund_amount ?? 0), 0);
    return {
      total: items.length,
      pending,
      approved,
      received,
      refunded,
      rejected,
      walletRefundedTotal,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((r) => r.status === filter);
  }, [items, filter]);

  async function handleAction(
    item: AdminReturnCardItem,
    action: ProcessReturnActionType,
  ) {
    setBusyId(item.id);
    setNotice(null);
    const shouldRestock = restockById[item.id] ?? true;
    const noteText = (notesById[item.id] ?? "").trim();

    try {
      const res = await processReturnRequestAction({
        returnId: item.id,
        action,
        adminNotes: noteText.length > 0 ? noteText : item.admin_notes,
        restock: shouldRestock,
      });

      if (!res.ok) {
        setNotice({
          kind: "err",
          text: isEn
            ? "Could not process this return request. Please try again."
            : "تعذر تنفيذ الإجراء على طلب الإرجاع. يرجى المحاولة مرة أخرى.",
        });
        return;
      }

      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                status: res.returnRequest.status,
                admin_notes: res.returnRequest.admin_notes,
                restocked: res.returnRequest.restocked,
                wallet_credited: res.returnRequest.wallet_credited,
                updated_at: res.returnRequest.updated_at,
              }
            : row,
        ),
      );

      const okMsg = (() => {
        switch (action) {
          case "approve":
            return isEn
              ? "Return request approved."
              : "تم قبول طلب الإرجاع بنجاح.";
          case "reject":
            return isEn
              ? "Return request rejected."
              : "تم رفض طلب الإرجاع.";
          case "mark_received":
            return res.returnRequest.restocked
              ? isEn
                ? "Marked as received and inventory restocked."
                : "تم تأكيد الاستلام وإعادة الكميات إلى المخزون."
              : isEn
                ? "Marked as received."
                : "تم تأكيد استلام المرتجع.";
          case "complete_refund":
            return res.returnRequest.wallet_credited
              ? isEn
                ? "Refund completed, wallet credited instantly, and inventory updated!"
                : "تم إتمام الاسترداد وإيداع المبلغ فوراً في محفظة العميل وتحديث المخزون!"
              : isEn
                ? "Refund completed and inventory updated."
                : "تم إتمام الاسترداد وتحديث المخزون.";
        }
      })();
      setNotice({ kind: "ok", text: okMsg });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveReturnWindow(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Math.trunc(Number(returnWindowInput));
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 365) {
      setNotice({
        kind: "err",
        text: isEn
          ? "Enter a return window between 0 and 365 days."
          : "يرجى إدخال نافذة إرجاع بين 0 و 365 يوماً.",
      });
      return;
    }
    setSavingWindow(true);
    setNotice(null);
    try {
      const res = await saveReturnWindowDaysAction(parsed);
      if (!res.ok) {
        setNotice({
          kind: "err",
          text: isEn
            ? "Could not save return window."
            : "تعذر حفظ نافذة الإرجاع.",
        });
        return;
      }
      setReturnWindowInput(String(res.days));
      setNotice({
        kind: "ok",
        text:
          res.days === 0
            ? isEn
              ? "Return window updated: unlimited days after delivery."
              : "تم تحديث نافذة الإرجاع: بدون حد زمني بعد التسليم."
            : isEn
              ? `Return window updated to ${res.days} days after delivery.`
              : `تم تحديث نافذة الإرجاع إلى ${res.days} يوماً بعد التسليم.`,
      });
    } finally {
      setSavingWindow(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>
            {isEn ? "Returns & Exchanges Queue" : "إدارة المرتجعات والاستبدال"}
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0",
              color: "var(--muted)",
              fontSize: "0.9rem",
            }}
          >
            {isEn
              ? "Review customer requests, restock returned items automatically, and issue instant Store Wallet refunds."
              : "راجع طلبات الإرجاع والاستبدال، أعد الكميات للمخزون تلقائياً، وأودع الاسترداد فوراً في محفظة المتجر."}
          </p>
        </div>

        <form
          onSubmit={handleSaveReturnWindow}
          className="card"
          style={{
            margin: 0,
            padding: "0.65rem 0.9rem",
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            flexWrap: "wrap",
          }}
        >
          <Clock3 size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.84rem",
              fontWeight: 600,
              margin: 0,
            }}
          >
            <span>{isEn ? "Return Window (days):" : "نافذة الإرجاع (أيام):"}</span>
            <input
              type="number"
              min={0}
              max={365}
              step={1}
              dir="ltr"
              value={returnWindowInput}
              onChange={(e) => setReturnWindowInput(e.target.value)}
              style={{ width: "74px", padding: "0.32rem 0.5rem" }}
              aria-label={isEn ? "Return window in days" : "نافذة الإرجاع بالأيام"}
            />
          </label>
          <button
            type="submit"
            disabled={savingWindow}
            className="btn-compact-admin"
          >
            {savingWindow
              ? isEn
                ? "Saving…"
                : "جارٍ الحفظ…"
              : isEn
                ? "Save"
                : "حفظ"}
          </button>
        </form>
      </div>

      {/* Summary KPI Pills */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <div
          className="card"
          style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.25rem" }}
        >
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Pending" : "قيد المراجعة"}
          </small>
          <strong
            style={{
              fontSize: "1.5rem",
              color: kpis.pending > 0 ? "#d97706" : "inherit",
            }}
          >
            {kpis.pending}
          </strong>
        </div>

        <div
          className="card"
          style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.25rem" }}
        >
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Approved / In Transit" : "مقبولة"}
          </small>
          <strong
            style={{
              fontSize: "1.5rem",
              color: kpis.approved > 0 ? "#1d4ed8" : "inherit",
            }}
          >
            {kpis.approved}
          </strong>
        </div>

        <div
          className="card"
          style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.25rem" }}
        >
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Refunded" : "تم الاسترداد"}
          </small>
          <strong
            style={{
              fontSize: "1.5rem",
              color: kpis.refunded > 0 ? "#047857" : "inherit",
            }}
          >
            {kpis.refunded}
          </strong>
        </div>

        <div
          className="card"
          style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.25rem" }}
        >
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Credited to Wallets" : "إجمالي إيداعات المحفظة"}
          </small>
          <strong style={{ fontSize: "1.35rem", color: "var(--primary)" }} dir="ltr">
            {money(kpis.walletRefundedTotal, currency, lang)}
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
          aria-label={isEn ? "Filter returns" : "تصفية المرتجعات"}
          style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}
        >
          {(
            [
              {
                key: "all" as const,
                label: isEn ? `All (${kpis.total})` : `الكل (${kpis.total})`,
              },
              {
                key: "pending" as const,
                label: isEn
                  ? `Pending (${kpis.pending})`
                  : `قيد المراجعة (${kpis.pending})`,
              },
              {
                key: "approved" as const,
                label: isEn
                  ? `Approved (${items.filter((r) => r.status === "approved").length})`
                  : `مقبولة (${items.filter((r) => r.status === "approved").length})`,
              },
              {
                key: "received" as const,
                label: isEn
                  ? `Received (${kpis.received})`
                  : `تم الاستلام (${kpis.received})`,
              },
              {
                key: "refunded" as const,
                label: isEn
                  ? `Refunded (${kpis.refunded})`
                  : `تم الاسترداد (${kpis.refunded})`,
              },
              {
                key: "rejected" as const,
                label: isEn
                  ? `Rejected (${kpis.rejected})`
                  : `مرفوضة (${kpis.rejected})`,
              },
            ] as const
          ).map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.key)}
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
              </button>
            );
          })}
        </div>

        {notice && <ToastFeedback message={notice.text} kind={notice.kind === "ok" ? "success" : "error"} />}
      </div>

      {/* Returns Queue */}
      {visibleItems.length === 0 ? (
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
          <RotateCcw size={26} style={{ opacity: 0.45 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>
            {filter === "all"
              ? isEn
                ? "No return or exchange requests yet for this store."
                : "لا توجد طلبات إرجاع أو استبدال لهذا المتجر بعد."
              : isEn
                ? "No return requests match this filter."
                : "لا توجد طلبات ضمن هذه الحالة."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {visibleItems.map((item) => {
            const statusMeta = returnStatusMeta(item.status, lang);
            const isBusy = busyId === item.id;
            const restockChecked = restockById[item.id] ?? true;
            const noteValue = notesById[item.id] ?? "";
            const isFinal =
              item.status === "refunded" || item.status === "rejected";

            return (
              <article
                key={item.id}
                className="card"
                style={{
                  padding: "1.15rem 1.25rem",
                  display: "grid",
                  gap: "0.9rem",
                  minWidth: 0,
                }}
              >
                {/* Header: Order #, Type, Refund Method, Status */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <Link
                        href={`/admin/orders/${item.order_id}`}
                        className="code"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontWeight: 800,
                          fontSize: "0.95rem",
                        }}
                      >
                        <span dir="ltr">#{item.order_id.slice(0, 8)}</span>
                        <ExternalLink size={13} />
                      </Link>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.28rem",
                          padding: "0.18rem 0.6rem",
                          borderRadius: "999px",
                          background:
                            item.request_type === "exchange"
                              ? "#eff6ff"
                              : "#f1f5f9",
                          color:
                            item.request_type === "exchange"
                              ? "#1d4ed8"
                              : "#334155",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                        }}
                      >
                        {item.request_type === "exchange" ? (
                          <ArrowLeftRight size={12} />
                        ) : (
                          <RotateCcw size={12} />
                        )}
                        {returnTypeLabel(item.request_type, lang)}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.28rem",
                          padding: "0.18rem 0.62rem",
                          borderRadius: "999px",
                          background:
                            item.refund_method === "wallet"
                              ? "#ecfdf5"
                              : "#f8fafc",
                          color:
                            item.refund_method === "wallet"
                              ? "#047857"
                              : "#475569",
                          border: `1px solid ${
                            item.refund_method === "wallet"
                              ? "#a7f3d0"
                              : "#cbd5e1"
                          }`,
                          fontSize: "0.76rem",
                          fontWeight: 700,
                        }}
                      >
                        {item.refund_method === "wallet" ? (
                          <Wallet size={12} />
                        ) : (
                          <CreditCard size={12} />
                        )}
                        {refundMethodLabel(item.refund_method, lang)}
                      </span>
                    </div>
                    <small
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        color: "var(--muted)",
                        fontSize: "0.78rem",
                      }}
                    >
                      <Clock3 size={12} />
                      <span>{date(item.created_at, lang)}</span>
                      <span>·</span>
                      <span dir="ltr">RET #{item.id.slice(0, 8)}</span>
                    </small>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong
                      dir="ltr"
                      style={{ fontSize: "1.05rem", color: "var(--ink)" }}
                    >
                      {money(item.refund_amount, item.currency, lang)}
                    </strong>
                    <span
                      style={{
                        padding: "0.24rem 0.7rem",
                        borderRadius: "999px",
                        fontSize: "0.78rem",
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

                {/* Customer Info Row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap",
                    fontSize: "0.83rem",
                    color: "var(--muted)",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "10px",
                    background: "var(--wash, #f8fafc)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      color: "var(--ink)",
                      fontWeight: 650,
                    }}
                  >
                    <UserRound size={14} />
                    {item.customer_name ||
                      item.customer_email ||
                      (isEn ? "Registered Customer" : "عميل مسجّل")}
                  </span>
                  {item.customer_phone && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <Phone size={13} />
                      <bdi dir="ltr">{item.customer_phone}</bdi>
                    </span>
                  )}
                  {item.shipping_address && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        minWidth: 0,
                      }}
                    >
                      <MapPin size={13} />
                      <span>{item.shipping_address}</span>
                    </span>
                  )}
                </div>

                {/* Reason + Requested Items */}
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  <p style={{ margin: 0, fontSize: "0.88rem" }}>
                    <strong>{isEn ? "Reason:" : "السبب:"}</strong>{" "}
                    {localizeReturnReason(item.reason, lang)}
                  </p>
                  {item.customer_notes && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        color: "var(--muted)",
                      }}
                    >
                      <strong>{isEn ? "Customer Notes:" : "ملاحظة العميل:"}</strong>{" "}
                      {item.customer_notes}
                    </p>
                  )}

                  {item.items.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.45rem",
                      }}
                    >
                      {item.items.map((line, idx) => (
                        <span
                          key={`${line.order_item_id ?? line.product_id ?? idx}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            padding: "0.32rem 0.7rem",
                            borderRadius: "8px",
                            border: "1px solid var(--line)",
                            background: "var(--surface)",
                            fontSize: "0.82rem",
                          }}
                        >
                          <strong>
                            {line.product_name} × {line.quantity}
                          </strong>
                          {(line.size || line.color) && (
                            <span style={{ color: "var(--muted)" }}>
                              (
                              {[
                                line.size,
                                line.color
                                  ? translateColor(line.color, lang)
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              )
                            </span>
                          )}
                          <span dir="ltr" style={{ color: "var(--primary)", fontWeight: 700 }}>
                            {money(
                              line.line_total ?? line.unit_price * line.quantity,
                              item.currency,
                              lang,
                            )}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Completion Flags */}
                {(item.wallet_credited || item.restocked) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.55rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {item.wallet_credited && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.24rem 0.65rem",
                          borderRadius: "999px",
                          background: "#ecfdf5",
                          color: "#047857",
                          border: "1px solid #a7f3d0",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                        }}
                      >
                        <CheckCircle2 size={13} />
                        {isEn
                          ? "Credited to Store Wallet"
                          : "تم الإيداع في محفظة المتجر"}
                      </span>
                    )}
                    {item.restocked && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.24rem 0.65rem",
                          borderRadius: "999px",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          border: "1px solid #bfdbfe",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                        }}
                      >
                        <PackageCheck size={13} />
                        {isEn ? "Inventory Restocked" : "تمت إعادة المخزون"}
                      </span>
                    )}
                  </div>
                )}

                {/* Merchant Action Bar */}
                {!isFinal ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "0.7rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--line)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: "0.75rem",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        maxLength={1000}
                        value={noteValue}
                        onChange={(e) =>
                          setNotesById((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder={
                          isEn
                            ? "Optional merchant response note (shown to customer)..."
                            : "ملاحظة اختيارية للعميل (تظهر في صفحة الطلب)..."
                        }
                        style={{
                          width: "100%",
                          padding: "0.52rem 0.75rem",
                          borderRadius: "9px",
                          border: "1px solid var(--line)",
                          fontSize: "0.84rem",
                        }}
                      />

                      {!item.restocked && (
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            fontSize: "0.82rem",
                            fontWeight: 650,
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={restockChecked}
                            onChange={(e) =>
                              setRestockById((prev) => ({
                                ...prev,
                                [item.id]: e.target.checked,
                              }))
                            }
                          />
                          <span>
                            {isEn ? "Restock items" : "إعادة للمخزون"}
                          </span>
                        </label>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.55rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {item.status === "pending" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAction(item, "approve")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "0.48rem 0.9rem",
                            borderRadius: "9px",
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          <Check size={14} />
                          <span>{isEn ? "Approve" : "قبول"}</span>
                        </button>
                      )}

                      {item.status === "approved" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleAction(item, "mark_received")
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "0.48rem 0.9rem",
                            borderRadius: "9px",
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            background: "#f5f3ff",
                            color: "#6d28d9",
                            border: "1px solid #ddd6fe",
                          }}
                        >
                          <PackageCheck size={14} />
                          <span>
                            {isEn ? "Mark Received" : "تأكيد الاستلام"}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void handleAction(item, "complete_refund")
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.38rem",
                          padding: "0.5rem 1rem",
                          borderRadius: "9px",
                          fontSize: "0.83rem",
                          fontWeight: 700,
                          background: "#047857",
                          color: "#ffffff",
                          border: "1px solid #047857",
                        }}
                      >
                        <Wallet size={14} />
                        <span>
                          {isBusy
                            ? isEn
                              ? "Processing…"
                              : "جارٍ التنفيذ…"
                            : item.refund_method === "wallet"
                              ? isEn
                                ? "Complete Refund & Restock"
                                : "تأكيد الاستلام وإيداع المحفظة"
                              : isEn
                                ? "Complete Refund & Restock"
                                : "تأكيد الاستلام وإتمام الاسترداد"}
                        </span>
                      </button>

                      {(item.status === "pending" ||
                        item.status === "approved") && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAction(item, "reject")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "0.48rem 0.9rem",
                            borderRadius: "9px",
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            background: "#fef2f2",
                            color: "#b91c1c",
                            border: "1px solid #fecaca",
                          }}
                        >
                          <XCircle size={14} />
                          <span>{isEn ? "Reject" : "رفض"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  item.admin_notes && (
                    <div
                      style={{
                        padding: "0.65rem 0.85rem",
                        borderRadius: "9px",
                        background: "var(--wash, #f8fafc)",
                        borderInlineStart: "3px solid var(--primary)",
                        fontSize: "0.84rem",
                      }}
                    >
                      <strong>
                        {isEn ? "Merchant Note:" : "ملاحظة الإدارة:"}
                      </strong>{" "}
                      {item.admin_notes}
                    </div>
                  )
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
