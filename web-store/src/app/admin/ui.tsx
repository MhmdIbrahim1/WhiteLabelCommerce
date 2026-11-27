import { ToastFeedback } from "@/components/floating-toast";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { date, money } from "@/lib/brand";
import { orderStatusLabel, ticketStatusLabel, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { pageSize } from "@/lib/workflow";
import { StatusDot } from "@/components/workspace-data";

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="empty">
      <Inbox size={22} />
      {children}
    </p>
  );
}

export async function Status({ value }: { value: string }) {
  const lang = await getServerLang();
  const label =
    orderStatusLabel(value, lang) !== value
      ? orderStatusLabel(value, lang)
      : ticketStatusLabel(value, lang);
  return <StatusDot status={value}>{label}</StatusDot>;
}

export async function Notice({ result }: { result?: string | string[] }) {
  if (!result) return null;
  const lang = await getServerLang();
  const isEn = lang === "en";
  const text =
    result === "ok"
      ? isEn
        ? "Changes saved successfully."
        : "تم حفظ التغييرات."
      : result === "limit_reached"
        ? isEn
          ? "Product limit reached for your current plan. Upgrade your store plan to add more products."
          : "لقد وصل متجرك إلى الحد الأقصى لعدد المنتجات في باقتك الحالية. يرجى ترقية الباقة لإضافة المزيد من المنتجات."
        : isEn
          ? "Could not save changes. Please verify values and try again."
          : "تعذر حفظ التغييرات. تحقق من القيم والارتباطات ثم أعد المحاولة.";
  return (
    <ToastFeedback message={text} kind={result === "ok" ? "success" : "error"} />
  );
}

export async function Pager({
  page,
  count,
  base,
}: {
  page: number;
  count: number;
  base: string;
}) {
  const lang = await getServerLang();
  const url = (n: number) =>
    base + (base.includes("?") ? "&" : "?") + "page=" + n;
  return (
    <nav className="pager">
      {page > 1 && <Link href={url(page - 1)}>{t(lang, "prevPage")}</Link>}
      {page * pageSize < count && (
        <Link href={url(page + 1)}>{t(lang, "nextPage")}</Link>
      )}
    </nav>
  );
}

export type Order = {
  id: string;
  status: string;
  created_at: string;
  total: number | null;
  currency: string;
};

export async function OrderTable({ rows }: { rows: Order[] }) {
  const lang = await getServerLang();
  if (!rows.length) return <p className="ws-empty"><Inbox size={22} />
    {lang === "en" ? "Your first order will appear here." : "سيظهر أول طلب لمتجرك هنا."}</p>;
  return <ul className="ws-order-list">{rows.map(o => <li key={o.id}>
    <Link href={"/admin/orders/" + o.id}><span className="ws-order-id"><bdi dir="ltr">#{o.id.slice(0, 8)}</bdi>
      <small><bdi dir="ltr">{date(o.created_at, lang)}</bdi></small></span>
      <StatusDot status={o.status}>{orderStatusLabel(o.status, lang)}</StatusDot>
      <strong><bdi dir="ltr">{money(o.total, o.currency, lang)}</bdi></strong>
    </Link></li>)}</ul>;
}
