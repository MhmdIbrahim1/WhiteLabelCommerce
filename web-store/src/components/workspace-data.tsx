import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Inbox, Search } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { directoryHref, paymentFilters, statusTone, type orderFilters } from "@/lib/workspace-directory";
import { paymentStatusLabel } from "@/lib/order-payment";
import { pageSize } from "@/lib/workflow";

export function StatusDot({ status, children }: { status: string; children: ReactNode }) {
  return <span className="ws-dot" data-tone={statusTone(status)}><i aria-hidden="true" />{children}</span>;
}

export function WorkspaceHeading({ title, description, children }: {
  title: ReactNode; description?: ReactNode; children?: ReactNode;
}) {
  return <header className="ws-page-head"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {children && <div className="ws-actions">{children}</div>}</header>;
}

export function WorkspaceEmpty({ title, children, action }: { title: string; children?: ReactNode; action: ReactNode }) {
  return <div className="ws-empty-state"><Inbox size={23} aria-hidden="true" /><h3>{title}</h3>
    {children && <p>{children}</p>}{action}</div>;
}

export function WorkspaceTable({ columns, caption, children }: { columns: string[]; caption: string; children: ReactNode }) {
  return <table className="ws-table" role="table"><caption className="ws-sr">{caption}</caption>
    <thead role="rowgroup"><tr role="row">{columns.map(col => <th key={col} scope="col" role="columnheader">{col}</th>)}</tr></thead>
    <tbody role="rowgroup">{children}</tbody></table>;
}

export function DataCell({ label, children }: { label?: string; children: ReactNode }) {
  return <td role="cell">{label && <span className="ws-cell-label" aria-hidden="true">{label}</span>}
    <div className="ws-cell-value">{children}</div></td>;
}

export function DirectoryFilters({ path, lang, query, status, choices, placeholder, order }: {
  path: string; lang: Lang; query: string; status: string; choices: [string, string][]; placeholder: string; order?: ReturnType<typeof orderFilters>;
}) {
  const en = lang === "en";
  return <form className="ws-filters" action={path} method="get" role="search" key={JSON.stringify([query, status, order])}>
    <label className="ws-search"><Search size={16} aria-hidden="true" /><span className="ws-sr">{placeholder}</span>
      <input id="directory-search" type="search" name="q" dir="auto" maxLength={100} defaultValue={query} placeholder={placeholder} /></label>
    <label><span className="ws-sr">{en ? "Filter by status" : "تصفية حسب الحالة"}</span>
      <select name="status" defaultValue={status}><option value="">{order ? (en ? "All fulfillment states" : "كل حالات التنفيذ") : (en ? "All statuses" : "كل الحالات")}</option>
        {choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {order && <>
      <label><span className="ws-sr">{en ? "Payment status" : "حالة الدفع"}</span>
        <select name="payment" defaultValue={order.payment}><option value="">{en ? "All payment states" : "كل حالات الدفع"}</option>
          {paymentFilters.map(value => <option key={value} value={value}>{paymentStatusLabel(value, en)}</option>)}
        </select></label>
      <label className="ws-order-date"><span>{en ? "From (UTC)" : "من (UTC)"}</span>
        <input type="date" dir="ltr" name="from" defaultValue={order.from} /></label>
      <label className="ws-order-date"><span>{en ? "To (UTC)" : "إلى (UTC)"}</span>
        <input type="date" dir="ltr" name="to" defaultValue={order.to} /></label>
    </>}
    <button className="ws-button" type="submit">{en ? "Apply" : "تطبيق"}</button>
    {(query || status || order?.payment || order?.from || order?.to) && <Link className="ws-text-link" href={path}>{en ? "Clear" : "مسح"}</Link>}
  </form>;
}

export function DirectoryPager({ path, page, count, q, status, lang, order }: {
  path: "/admin/products" | "/admin/orders"; page: number; count: number; q: string; status: string; lang: Lang; order?: ReturnType<typeof orderFilters>;
}) {
  const en = lang === "en";
  const last = Math.max(1, Math.ceil(count / pageSize));
  if (!count && page === 1) return null;
  const numbers = new Intl.NumberFormat(en ? "en" : "ar-EG");
  return <nav className="ws-pager" aria-label={en ? "Directory pages" : "صفحات القائمة"}>
    <span>{en ? "Page " : "صفحة "}<bdi dir="ltr">{numbers.format(page)}</bdi>{en ? " of " : " من "}<bdi dir="ltr">{numbers.format(last)}</bdi></span>
    <div>{page > 1 && <Link className="ws-button" href={directoryHref(path, { ...order, q, status, page: Math.min(last, page - 1) })}>
      <ArrowLeft className="pt-directional" size={14} />{en ? "Previous" : "السابقة"}</Link>}
      {page < last && <Link className="ws-button" href={directoryHref(path, { ...order, q, status, page: page + 1 })}>
        {en ? "Next" : "التالية"}<ArrowRight className="pt-directional" size={14} /></Link>}</div>
  </nav>;
}

export function UsageBar({ used, cap, label, lang }: { used: number; cap: number | null; label: string; lang: Lang }) {
  if (cap === null) return <div className="ws-unlimited" aria-hidden="true" />;
  return <progress className="ws-meter" max={Math.max(1, cap)} value={cap === 0 ? 1 : Math.min(used, cap)}
    aria-label={label} aria-valuetext={lang === "en" ? `${used} of ${cap}` : `${used} من ${cap}`} />;
}
