"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Download,
  MessageCircle,
  X,
  Phone,
  Mail,
  MapPin,
  ArrowLeft,
  Save,
  UserRound,
  Wallet,
  PlusCircle,
  MinusCircle,
  History,
} from "lucide-react";
import { date, money } from "@/lib/brand";
import { orderStatusLabel } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import { adjustCustomerWallet, saveCustomerNotes } from "../mutations";

export type CustomerOrderSummary = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  shipping_carrier: string | null;
};

export type CustomerWalletTxSummary = {
  id: string;
  order_id: string | null;
  type: string;
  amount: number;
  balance_after: number;
  note_ar: string;
  note_en: string;
  created_at: string;
};

export type CustomerCrmRow = {
  id: string;
  userId: string | null;
  fullName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  notes: string;
  createdAt: string;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  lifetimeSpend: number;
  averageOrderValue: number;
  lastOrderDate: string | null;
  badge: "vip" | "repeat" | "new" | "high_return";
  walletBalance: number;
  walletTransactions: CustomerWalletTxSummary[];
  orders: CustomerOrderSummary[];
};

const BADGE_META: Record<
  CustomerCrmRow["badge"],
  { label_ar: string; label_en: string; className: string }
> = {
  vip: { label_ar: "عميل VIP", label_en: "VIP", className: "crm-badge crm-badge--vip" },
  repeat: { label_ar: "عميل متكرر", label_en: "Repeat", className: "crm-badge crm-badge--repeat" },
  new: { label_ar: "عميل جديد", label_en: "New", className: "crm-badge crm-badge--new" },
  high_return: {
    label_ar: "مرتجعات مرتفعة",
    label_en: "High Returns",
    className: "crm-badge crm-badge--risk",
  },
};

export function CustomersClient({
  rows,
  currency,
}: {
  rows: CustomerCrmRow[];
  currency: string;
}) {
  const router = useRouter();
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const [localRows, setLocalRows] = useState<CustomerCrmRow[]>(rows);
  const [query, setQuery] = useState("");
  const [badgeFilter, setBadgeFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [walletModalId, setWalletModalId] = useState<string | null>(null);
  const [adjustDirection, setAdjustDirection] = useState<"credit" | "debit">("credit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustFeedback, setAdjustFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const selected = useMemo(
    () => localRows.find((r) => r.id === selectedId) ?? null,
    [localRows, selectedId],
  );
  const walletTarget = useMemo(
    () => localRows.find((r) => r.id === walletModalId) ?? null,
    [localRows, walletModalId],
  );

  const openWalletModal = (customer: CustomerCrmRow) => {
    setWalletModalId(customer.id);
    setAdjustDirection("credit");
    setAdjustAmount("");
    setAdjustNote("");
    setAdjustFeedback(null);
  };

  const handleWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletTarget?.userId || adjustBusy) return;
    const rawNum = Number(adjustAmount);
    if (!Number.isFinite(rawNum) || rawNum <= 0) {
      setAdjustFeedback({
        ok: false,
        text: isEn ? "Enter a valid positive amount." : "أدخل مبلغاً صحيحاً أكبر من الصفر.",
      });
      return;
    }
    const signedAmount = adjustDirection === "credit" ? rawNum : -rawNum;
    setAdjustBusy(true);
    setAdjustFeedback(null);
    try {
      const res = await adjustCustomerWallet({
        userId: walletTarget.userId,
        amount: signedAmount,
        noteAr: adjustNote.trim(),
        noteEn: adjustNote.trim(),
      });
      if (!res.ok) {
        setAdjustFeedback({
          ok: false,
          text:
            res.error === "insufficient_wallet_balance"
              ? isEn
                ? "Cannot deduct more than the customer's current balance."
                : "لا يمكن خصم مبلغ أكبر من رصيد المحفظة الحالي للعميل."
              : isEn
                ? "Could not update wallet right now."
                : "تعذر تحديث رصيد المحفظة حالياً.",
        });
        return;
      }

      const newTx: CustomerWalletTxSummary = {
        id: res.transactionId,
        order_id: null,
        type: signedAmount > 0 ? "admin_credit" : "admin_debit",
        amount: signedAmount,
        balance_after: res.balanceAfter,
        note_ar:
          adjustNote.trim() ||
          (signedAmount > 0
            ? "رصيد إضافي من إدارة المتجر"
            : "خصم إداري من رصيد المحفظة"),
        note_en:
          adjustNote.trim() ||
          (signedAmount > 0
            ? "Store credit added by merchant"
            : "Store credit deducted by merchant"),
        created_at: new Date().toISOString(),
      };

      setLocalRows((prev) =>
        prev.map((row) =>
          row.userId === walletTarget.userId
            ? {
                ...row,
                walletBalance: res.balanceAfter,
                walletTransactions: [newTx, ...row.walletTransactions].slice(0, 30),
              }
            : row,
        ),
      );
      setAdjustAmount("");
      setAdjustNote("");
      setAdjustFeedback({
        ok: true,
        text: isEn
          ? `Wallet updated! New balance: ${money(res.balanceAfter, currency, "en")}`
          : `تم تحديث المحفظة بنجاح! الرصيد الجديد: ${money(res.balanceAfter, currency, "ar")}`,
      });
      router.refresh();
    } catch {
      setAdjustFeedback({
        ok: false,
        text: isEn ? "Network error while updating wallet." : "حدث خطأ أثناء تحديث المحفظة.",
      });
    } finally {
      setAdjustBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return localRows.filter((c) => {
      if (badgeFilter !== "all" && c.badge !== badgeFilter) return false;
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    });
  }, [localRows, query, badgeFilter]);

  const handleExportCsv = () => {
    const headers = [
      "الاسم",
      "الهاتف",
      "البريد الإلكتروني",
      "المدينة",
      "العنوان",
      "التصنيف",
      "إجمالي الطلبات",
      "المسلّمة",
      "الملغاة",
      "إجمالي الإنفاق (LTV)",
      "متوسط الطلب (AOV)",
      "رصيد المحفظة",
      "آخر طلب",
      "ملاحظات",
    ];
    const escapeCell = (v: string | number) =>
      `"${String(v).replace(/"/g, '""')}"`;
    const csvLines = [
      headers.map(escapeCell).join(","),
      ...filtered.map((c) =>
        [
          c.fullName || "عميل",
          c.phone,
          c.email,
          c.city,
          c.address,
          isEn ? BADGE_META[c.badge].label_en : BADGE_META[c.badge].label_ar,
          c.totalOrders,
          c.deliveredOrders,
          c.cancelledOrders,
          c.lifetimeSpend.toFixed(2),
          c.averageOrderValue.toFixed(2),
          c.walletBalance.toFixed(2),
          c.lastOrderDate ? date(c.lastOrderDate, lang) : "",
          c.notes,
        ]
          .map(escapeCell)
          .join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + csvLines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="card">
        <div className="crm-toolbar">
          <div className="crm-search-wrap">
            <Search size={16} />
            <input
              type="search"
              placeholder={
                isEn
                  ? "Search by name, phone, or city..."
                  : "ابحث بالاسم، رقم الهاتف، أو المدينة..."
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={isEn ? "Search customers" : "البحث في العملاء"}
            />
          </div>

          <div className="crm-filter-pills">
            {(
              [
                ["all", isEn ? `All (${localRows.length})` : `الكل (${localRows.length})`],
                ["vip", isEn ? "VIP" : "عميل VIP"],
                ["repeat", isEn ? "Repeat" : "عميل متكرر"],
                ["new", isEn ? "New" : "عميل جديد"],
                ["high_return", isEn ? "High Returns" : "مرتجعات مرتفعة"],
              ] as [string, string][]
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                className={`crm-pill ${badgeFilter === k ? "is-active" : ""}`}
                onClick={() => setBadgeFilter(k)}
              >
                {lbl}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-outline-admin"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
          >
            <Download size={15} /> {isEn ? "Export CSV" : "تصدير CSV"}
          </button>
        </div>

        {filtered.length === 0 ? (
          <p className="empty">
            {isEn
              ? "No customers match your filters."
              : "لا يوجد عملاء مطابقون لخيارات البحث."}
          </p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>{isEn ? "Customer" : "العميل"}</th>
                  <th>{isEn ? "City / Address" : "المدينة / العنوان"}</th>
                  <th>{isEn ? "Orders (Del / Can)" : "الطلبات (مسلّم / ملغي)"}</th>
                  <th>{isEn ? "Lifetime Spend (LTV)" : "إجمالي الإنفاق (LTV)"}</th>
                  <th>{isEn ? "Wallet Balance" : "رصيد المحفظة"}</th>
                  <th>{isEn ? "Segment" : "التصنيف"}</th>
                  <th>{isEn ? "Actions" : "إجراءات"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const badge = BADGE_META[c.badge];
                  return (
                    <tr
                      key={c.id}
                      className="crm-clickable-row"
                      onClick={() => setSelectedId(c.id)}
                    >
                      <td className="order-cell-wrap">
                        <strong>
                          {c.fullName ||
                            c.email ||
                            (isEn ? "Store Customer" : "عميل المتجر")}
                        </strong>
                        {c.phone && (
                          <small className="order-meta-line" dir="ltr">
                            {c.phone}
                          </small>
                        )}
                      </td>
                      <td className="order-cell-wrap">
                        <span>{c.city || c.address.slice(0, 38) || "—"}</span>
                      </td>
                      <td>
                        <strong>{c.totalOrders}</strong>{" "}
                        <small>
                          ({c.deliveredOrders}{" "}
                          {isEn ? "del" : "مسلّم"} · {c.cancelledOrders}{" "}
                          {isEn ? "can" : "ملغي"})
                        </small>
                      </td>
                      <td>
                        <strong>{money(c.lifetimeSpend, currency, lang)}</strong>
                      </td>
                      <td>
                        {c.userId ? (
                          <span
                            className={`crm-wallet-badge ${c.walletBalance > 0 ? "has-credit" : ""}`}
                          >
                            <Wallet size={13} aria-hidden="true" />
                            {money(c.walletBalance, currency, lang)}
                          </span>
                        ) : (
                          <small>{isEn ? "Guest" : "زائر"}</small>
                        )}
                      </td>
                      <td>
                        <span className={badge.className}>
                          {isEn ? badge.label_en : badge.label_ar}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {c.userId ? (
                          <button
                            type="button"
                            className="btn-outline-admin crm-wallet-btn"
                            onClick={() => openWalletModal(c)}
                          >
                            <Wallet size={14} aria-hidden="true" />
                            <span>
                              {isEn ? "Manage Wallet" : "إدارة المحفظة"}
                            </span>
                          </button>
                        ) : (
                          <small>—</small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Customer Detail Slide-Over Drawer */}
      {selected && (
        <div
          className="crm-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={isEn ? "Customer details" : "تفاصيل العميل"}
          onClick={() => setSelectedId(null)}
        >
          <aside
            className="crm-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="crm-drawer-head">
              <div className="with-icon">
                <span className="metric-icon">
                  <UserRound size={19} />
                </span>
                <div>
                  <h2>
                    {selected.fullName ||
                      selected.email ||
                      (isEn ? "Store Customer" : "عميل المتجر")}
                  </h2>
                  <span className={BADGE_META[selected.badge].className}>
                    {isEn
                      ? BADGE_META[selected.badge].label_en
                      : BADGE_META[selected.badge].label_ar}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-outline-admin"
                onClick={() => setSelectedId(null)}
                aria-label={isEn ? "Close" : "إغلاق"}
              >
                <X size={16} />
              </button>
            </header>

            <div className="crm-drawer-metrics">
              <div>
                <small>{isEn ? "Lifetime Spend (LTV)" : "إجمالي الإنفاق (LTV)"}</small>
                <strong>{money(selected.lifetimeSpend, currency, lang)}</strong>
              </div>
              <div>
                <small>{isEn ? "Wallet Balance" : "رصيد المحفظة"}</small>
                <strong>{money(selected.walletBalance, currency, lang)}</strong>
              </div>
              <div>
                <small>{isEn ? "Delivered / Cancelled" : "مسلّم / ملغي"}</small>
                <strong>
                  {selected.deliveredOrders} / {selected.cancelledOrders}
                </strong>
              </div>
            </div>

            {selected.userId && (
              <button
                type="button"
                className="btn-ship-link"
                style={{ width: "100%" }}
                onClick={() => openWalletModal(selected)}
              >
                <Wallet size={15} />{" "}
                {isEn ? "Manage Customer Wallet" : "إدارة محفظة العميل"}
              </button>
            )}

            <div className="crm-drawer-contact">
              {selected.phone && (
                <div className="row">
                  <span className="with-icon">
                    <Phone size={15} /> <bdi dir="ltr">{selected.phone}</bdi>
                  </span>
                  <a
                    href={`https://wa.me/${(() => {
                      const d = selected.phone.replace(/\D/g, "").replace(/^00/, "");
                      return /^01[0-9]{9}$/.test(d) ? `20${d.slice(1)}` : d;
                    })()}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-whatsapp-admin"
                  >
                    <MessageCircle size={14} />{" "}
                    {isEn ? "Chat on WhatsApp" : "تواصل واتساب"}
                  </a>
                </div>
              )}
              {selected.email && (
                <span className="with-icon">
                  <Mail size={15} /> <bdi dir="ltr">{selected.email}</bdi>
                </span>
              )}
              {(selected.city || selected.address) && (
                <span className="with-icon">
                  <MapPin size={15} />{" "}
                  {[selected.city, selected.address].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>

            <form action={saveCustomerNotes} className="crm-notes-form">
              <input type="hidden" name="id" value={selected.id} />
              <label>
                {isEn
                  ? "Internal Merchant Notes (delivery preferences / follow-up)"
                  : "ملاحظات التاجر الداخلية (تفضيلات التوصيل / ملاحظات المتابعة)"}
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={selected.notes}
                  placeholder={
                    isEn
                      ? "e.g. Prefers evening delivery after 5 PM..."
                      : "مثال: يفضل التوصيل بعد الساعة 5 مساءً..."
                  }
                />
              </label>
              <button type="submit">
                <Save size={15} /> {isEn ? "Save Note" : "حفظ الملاحظة"}
              </button>
            </form>

            <div className="crm-drawer-orders">
              <h3>
                {isEn
                  ? `Order History (${selected.orders.length})`
                  : `سجل طلبات العميل (${selected.orders.length})`}
              </h3>
              {selected.orders.length === 0 ? (
                <p>
                  {isEn
                    ? "No orders recorded for this customer."
                    : "لا توجد طلبات مسجلة لهذا العميل."}
                </p>
              ) : (
                <div className="crm-order-list">
                  {selected.orders.map((o) => (
                    <Link
                      key={o.id}
                      href={"/admin/orders/" + o.id}
                      className="crm-order-item"
                    >
                      <div>
                        <strong className="code">#{o.id.slice(0, 8)}</strong>
                        <small style={{ display: "block" }}>
                          {date(o.created_at, lang)}
                        </small>
                      </div>
                      <div style={{ textAlign: "end" }}>
                        <strong>{money(o.total, o.currency, lang)}</strong>
                        <small style={{ display: "block" }}>
                          {orderStatusLabel(o.status, lang)}
                        </small>
                      </div>
                      <ArrowLeft size={14} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Manage Wallet Modal */}
      {walletTarget && walletTarget.userId && (
        <div
          className="wallet-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={isEn ? "Manage Customer Wallet" : "إدارة محفظة العميل"}
          onClick={() => setWalletModalId(null)}
        >
          <div
            className="wallet-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wallet-modal-head">
              <div className="with-icon">
                <span className="metric-icon">
                  <Wallet size={18} />
                </span>
                <div>
                  <h2>
                    {isEn ? "Manage Wallet" : "إدارة المحفظة"}
                  </h2>
                  <small>
                    {walletTarget.fullName || walletTarget.email}
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="btn-outline-admin"
                onClick={() => setWalletModalId(null)}
                aria-label={isEn ? "Close" : "إغلاق"}
              >
                <X size={16} />
              </button>
            </header>

            <div className="wallet-modal-balance">
              <small>
                {isEn ? "Current Available Balance" : "الرصيد الحالي المتاح"}
              </small>
              <strong>
                {money(walletTarget.walletBalance, currency, lang)}
              </strong>
            </div>

            <form className="wallet-modal-form" onSubmit={handleWalletSubmit}>
              <div className="wallet-dir-toggle">
                <button
                  type="button"
                  className={adjustDirection === "credit" ? "is-credit-active" : ""}
                  onClick={() => setAdjustDirection("credit")}
                >
                  <PlusCircle size={15} />
                  {isEn ? "Add Credit (+)" : "إضافة رصيد (+)"}
                </button>
                <button
                  type="button"
                  className={adjustDirection === "debit" ? "is-debit-active" : ""}
                  onClick={() => setAdjustDirection("debit")}
                >
                  <MinusCircle size={15} />
                  {isEn ? "Deduct Credit (-)" : "خصم رصيد (-)"}
                </button>
              </div>

              <label>
                {isEn ? `Amount (${currency})` : `المبلغ (${currency})`}
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  dir="ltr"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="100"
                  required
                />
              </label>

              <label>
                {isEn ? "Reason / Note" : "السبب / ملاحظة"}
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder={
                    isEn
                      ? "e.g. VIP Bonus or Refund credit"
                      : "مثال: مكافأة عميل VIP أو رصيد استرجاع"
                  }
                  maxLength={200}
                />
              </label>

              {adjustFeedback && (
                <p
                  className={`notif-feedback ${adjustFeedback.ok ? "is-ok" : "is-err"}`}
                  role="status"
                >
                  {adjustFeedback.text}
                </p>
              )}

              <button type="submit" disabled={adjustBusy} style={{ width: "100%" }}>
                {adjustBusy
                  ? isEn
                    ? "Saving…"
                    : "جارٍ الحفظ…"
                  : adjustDirection === "credit"
                    ? isEn
                      ? "Credit Customer Wallet"
                      : "إضافة الرصيد للمحفظة"
                    : isEn
                      ? "Deduct from Customer Wallet"
                      : "خصم الرصيد من المحفظة"}
              </button>
            </form>

            <div className="wallet-modal-history">
              <h3>
                <History size={15} />{" "}
                {isEn ? "Ledger History" : "سجل حركات المحفظة"}
              </h3>
              {walletTarget.walletTransactions.length === 0 ? (
                <p style={{ fontSize: "0.86rem" }}>
                  {isEn
                    ? "No transactions recorded yet."
                    : "لا توجد حركات مسجلة في محفظة هذا العميل بعد."}
                </p>
              ) : (
                <ul className="wallet-modal-tx-list">
                  {walletTarget.walletTransactions.map((tx) => {
                    const isCredit = tx.amount > 0;
                    return (
                      <li key={tx.id} className="wallet-modal-tx-row">
                        <div>
                          <strong>
                            {isEn
                              ? tx.note_en || tx.note_ar || tx.type
                              : tx.note_ar || tx.note_en || tx.type}
                          </strong>
                          <small>{date(tx.created_at, lang)}</small>
                        </div>
                        <div style={{ textAlign: "end" }}>
                          <strong
                            dir="ltr"
                            style={{ color: isCredit ? "#15803d" : "#b91c1c" }}
                          >
                            {isCredit ? "+" : "-"}
                            {money(Math.abs(tx.amount), currency, lang)}
                          </strong>
                          <small style={{ display: "block" }}>
                            {isEn ? "Bal" : "الرصيد"}:{" "}
                            {money(tx.balance_after, currency, lang)}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
