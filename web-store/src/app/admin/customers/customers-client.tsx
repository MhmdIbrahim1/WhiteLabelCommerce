"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { date, money } from "@/lib/brand";
import { orderStatusLabel } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import { saveCustomerNotes } from "../mutations";

export type CustomerOrderSummary = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  shipping_carrier: string | null;
};

export type CustomerCrmRow = {
  id: string;
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
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const [query, setQuery] = useState("");
  const [badgeFilter, setBadgeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<CustomerCrmRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) => {
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
  }, [rows, query, badgeFilter]);

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
                ["all", isEn ? `All (${rows.length})` : `الكل (${rows.length})`],
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
                  <th>{isEn ? "Avg Order (AOV)" : "متوسط الطلب (AOV)"}</th>
                  <th>{isEn ? "Segment" : "التصنيف"}</th>
                  <th>{isEn ? "Last Order" : "آخر طلب"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const badge = BADGE_META[c.badge];
                  return (
                    <tr
                      key={c.id}
                      className="crm-clickable-row"
                      onClick={() => setSelected(c)}
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
                      <td>{money(c.averageOrderValue, currency, lang)}</td>
                      <td>
                        <span className={badge.className}>
                          {isEn ? badge.label_en : badge.label_ar}
                        </span>
                      </td>
                      <td>
                        {c.lastOrderDate ? date(c.lastOrderDate, lang) : "—"}
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
          onClick={() => setSelected(null)}
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
                onClick={() => setSelected(null)}
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
                <small>{isEn ? "Avg Order (AOV)" : "متوسط الطلب (AOV)"}</small>
                <strong>{money(selected.averageOrderValue, currency, lang)}</strong>
              </div>
              <div>
                <small>{isEn ? "Delivered / Cancelled" : "مسلّم / ملغي"}</small>
                <strong>
                  {selected.deliveredOrders} / {selected.cancelledOrders}
                </strong>
              </div>
            </div>

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
    </>
  );
}
