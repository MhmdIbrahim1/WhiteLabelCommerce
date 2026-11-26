"use client";

import { formatOrderNumber } from "@/lib/order-number";
import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Package } from "lucide-react";
import { date, money } from "@/lib/brand";
import { orderStatusLabel } from "@/lib/i18n";
import { photo } from "@/lib/product-photo";
import { storeHref } from "@/lib/tenant-shared";
import { useLanguage } from "../language-provider";

export type OrderCardRow = { id: string; created_at: string; status: string; total: number | null; currency: string; payment_status: string; item_count: number; thumbnails: string[] };
export const orderFilters = ["all","active","completed","cancelled"] as const;
export type OrderFilter = typeof orderFilters[number];

export function OrderCards({ rows, filter, basePath, next }: { rows: OrderCardRow[]; filter: OrderFilter; basePath: string; next: string | null }) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const labels = en ? ["All","Active","Completed","Cancelled"] : ["الكل","قيد التنفيذ","مكتملة","ملغية"];
  const cards = useMemo(() => Array.from(new Map(rows.map(row => [row.id, row])).values()), [rows]);
  const Arrow = en ? ArrowRight : ArrowLeft;
  return <section className="order-history"><nav className="order-filters" aria-label={en ? "Order status" : "حالة الطلب"}>
    {orderFilters.map((key,i) => <Link key={key} aria-current={key === filter ? "page" : undefined}
      href={storeHref(basePath,"/orders?filter="+key)}>{labels[i]}</Link>)}</nav>
    {cards.length ? cards.map(row => <article className="history-card" key={row.id}>
      <div className="history-heading"><div><strong dir="ltr">{formatOrderNumber(row.id)}</strong><small>{date(row.created_at,lang)}</small></div>
        <span className="order-state" data-status={row.status}>{orderStatusLabel(row.status,lang)}</span></div>
      <div className="history-items">{row.thumbnails.length ? row.thumbnails.map((path,i) => <Image key={i} src={photo(path)!} unoptimized width={40} height={40} alt="" />) : <Package size={24} />}
        <span>{row.item_count.toLocaleString(lang)} {en ? (row.item_count === 1 ? "item" : "items") : "قطع"}</span></div>
      <footer><b dir="auto">{row.total == null ? en ? "Total pending" : "قيد التسعير" : money(row.total,row.currency,lang)}</b><Link href={storeHref(basePath,"/orders/"+row.id)}>{en ? "View order" : "تفاصيل الطلب"} <Arrow size={16}/></Link></footer>
    </article>) : <div className="panel shop-empty-state"><Package size={29}/><p>{en ? "No orders in this view." : "لا توجد طلبات في هذه القائمة."}</p></div>}
    {next && <Link className="section-more-link next-orders" href={storeHref(basePath,next)}>{en ? "Older orders" : "الطلبات السابقة"} <Arrow size={15}/></Link>}
  </section>;
}
