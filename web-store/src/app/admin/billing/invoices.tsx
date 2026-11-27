import Link from "next/link";
import { DataCell, StatusDot, WorkspaceTable } from "@/components/workspace-data";
import { billingDate, billingMoney, channelNames, invoiceStatuses, type BillingInvoice } from "@/lib/billing-checkout";
import { cycleName, type Plan, type StoreBilling } from "@/lib/billing";
import { localizedText, type Lang } from "@/lib/i18n";
import { CancelChange } from "./merchant-plans";

function invoicePlan(invoice: BillingInvoice, lang: Lang) {
  return invoice.saas_plans ? localizedText(lang, invoice.saas_plans.name_ar, invoice.saas_plans.name_en) : invoice.target_plan_code;
}
export function BillingBanners({ payment, bill, plans, pending, store, lang }: {
  payment?: string; bill: StoreBilling; plans: Plan[]; pending: BillingInvoice | null; store: string; lang: Lang;
}) {
  const en = lang === "en";
  const messages: Record<string, string> = {
    success: en ? "Payment received. Your paid invoice is in billing history." : "تم استلام الدفع. ستجد الفاتورة المدفوعة في سجل الفوترة.",
    pending: en ? "Your payment is processing. Its status will appear in billing history." : "يُعالَج دفعك الآن. ستظهر حالته في سجل الفوترة.",
    failed: en ? "The payment did not complete. You can start a new checkout." : "لم يكتمل الدفع. يمكنك بدء عملية دفع جديدة.",
    refunded: en ? "This payment was refunded. Its invoice is in billing history." : "تم رد مبلغ هذه الدفعة. ستجد فاتورتها في سجل الفوترة.",
    unverified: en ? "We couldn’t verify this payment. Check billing history for its status." : "تعذّر التحقق من الدفع. راجع حالته في سجل الفوترة.",
  };
  const scheduled = plans.find(plan => plan.code === bill.scheduled_plan_code);
  return <>
    {payment && Object.hasOwn(messages, payment) && <p className="billing-banner" role="status">{messages[payment]}</p>}
    {bill.scheduled_plan_code && bill.scheduled_billing_cycle && bill.scheduled_effective_at &&
      <section className="billing-banner" aria-label={en ? "Scheduled downgrade" : "خفض الباقة المجدول"}>
        <div><h2>{en ? "Scheduled downgrade" : "خفض الباقة المجدول"}</h2>
          <p>{scheduled ? localizedText(lang, scheduled.name_ar, scheduled.name_en) : bill.scheduled_plan_code}
            {" · "}{cycleName(bill.scheduled_billing_cycle, lang)}{" · "}<bdi dir="ltr">{billingDate(bill.scheduled_effective_at, lang)} UTC</bdi></p></div>
        <CancelChange store={store} lang={lang} /></section>}
    {pending && <section className="billing-banner" aria-label={en ? "Pending manual transfer" : "تحويل قيد المراجعة"}>
      <div><h2>{en ? "Pending manual transfer" : "تحويل قيد المراجعة"}</h2>
        <StatusDot status="review">{invoiceStatuses.awaiting_review[lang]}</StatusDot>
        <p>{invoicePlan(pending, lang)}{" · "}{cycleName(pending.target_billing_cycle, lang)}{" · "}
          <bdi dir="ltr">{billingMoney(pending.amount_egp, lang)}</bdi>{" · "}<bdi dir="ltr">{pending.transfer_reference}</bdi></p></div>
      <CancelChange store={store} invoice={pending.id} lang={lang} /></section>}
  </>;
}

export function InvoiceHistory({ invoices, lang, page, more }: { invoices: BillingInvoice[]; lang: Lang; page: number; more: boolean }) {
  const en = lang === "en";
  const title = en ? "Billing history" : "سجل الفوترة";
  const columns = en ? ["Date (UTC)", "Plan", "Amount", "Method", "Reference", "Status"] : ["التاريخ (UTC)", "الباقة", "المبلغ", "الوسيلة", "المرجع", "الحالة"];
  return <section id="invoices" className="ws-sheet billing-history" aria-labelledby="invoice-heading">
    <header className="ws-section-head"><h2 id="invoice-heading">{title}</h2></header>
    {invoices.length ? <WorkspaceTable caption={title} columns={columns}>{invoices.map(invoice => <tr key={invoice.id} role="row">
      <DataCell label={columns[0]}><bdi dir="ltr">{billingDate(invoice.created_at, lang)}</bdi></DataCell>
      <DataCell label={columns[1]}><div className="ws-cell-stack"><strong>{invoicePlan(invoice, lang)}</strong><small>{cycleName(invoice.target_billing_cycle, lang)}</small></div></DataCell>
      <DataCell label={columns[2]}><bdi dir="ltr">{billingMoney(invoice.amount_egp, lang)}</bdi></DataCell>
      <DataCell label={columns[3]}>{channelNames[invoice.payment_channel][lang]}</DataCell>
      <DataCell label={columns[4]}><div className="ws-cell-stack"><bdi dir="ltr">{invoice.transfer_reference ?? invoice.paymob_order_id ?? "—"}</bdi>
        {invoice.receipt_path && <a target="_blank" rel="noreferrer" href={"/api/admin/billing/receipts/" + invoice.id}>{en ? "View receipt" : "عرض الإيصال"}</a>}</div></DataCell>
      <DataCell label={columns[5]}><div className="ws-cell-stack"><StatusDot status={invoice.status === "awaiting_review" ? "review" : invoice.status}>
        {invoiceStatuses[invoice.status][lang]}</StatusDot>{invoice.status === "rejected" && <small dir="auto">{invoice.review_note}</small>}</div></DataCell>
    </tr>)}</WorkspaceTable> : <p className="billing-history-empty">{page === 1
      ? (en ? "Your invoices will appear here when you request a plan change." : "ستظهر فواتيرك هنا عند تقديم طلب لتغيير الباقة.")
      : (en ? "No invoices on this page." : "لا توجد فواتير في هذه الصفحة.")}</p>}
    {(page > 1 || more) && <nav className="ws-pager" aria-label={en ? "Invoice pages" : "صفحات الفواتير"}>
      <span>{en ? "Page " : "صفحة "}<bdi dir="ltr">{page}</bdi></span><div>
        {page > 1 && <Link className="ws-button" href={"/admin/billing?page=" + (page - 1) + "#invoices"}>{en ? "Previous" : "السابق"}</Link>}
        {more && <Link className="ws-button" href={"/admin/billing?page=" + (page + 1) + "#invoices"}>{en ? "Next" : "التالي"}</Link>}</div></nav>}
  </section>;
}
