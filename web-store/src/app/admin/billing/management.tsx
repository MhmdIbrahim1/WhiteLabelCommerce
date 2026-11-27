import { headers } from "next/headers";
import { cycleName, type BillingCycle, type Plan } from "@/lib/billing";
import { checked, requireSuperAdmin } from "@/lib/db";
import { formatDate, formatMoney, localizedText, type Lang } from "@/lib/i18n";
import { adminDb } from "@/lib/supabase/admin";
import { PLATFORM_ORIGIN_HEADER } from "@/lib/tenant-shared";
import { PaymentSettingsEditor, ReviewControls } from "./payment-controls";
import type { CredentialStatus, PaymentSettings } from "./payment-fields";
import "./management.css";

type Review = {
  id: string; stores: { name_ar: string; name_en: string; slug: string };
  target_plan_code: string; target_billing_cycle: BillingCycle; amount_egp: number;
  payment_channel: "instapay" | "bank_transfer" | "mobile_wallet_manual";
  transfer_reference: string; transfer_sender: string | null; merchant_note: string | null;
  receipt_path: string | null; status: string; review_note: string | null; created_at: string; reviewed_at: string | null;
};
const selection = "id,stores!inner(name_ar,name_en,slug),target_plan_code,target_billing_cycle,amount_egp,payment_channel,transfer_reference,transfer_sender,merchant_note,receipt_path,status,review_note,created_at,reviewed_at";

async function pendingReviews(db: Awaited<ReturnType<typeof requireSuperAdmin>>["db"]) {
  const reviews: Review[] = [];
  for (let from = 0; ; from += 250) {
    const items = checked(await db.from("subscription_invoices").select(selection).eq("status", "awaiting_review")
      .order("created_at").order("id").range(from, from + 249).returns<Review[]>());
    reviews.push(...items);
    if (items.length < 250) return reviews;
  }
}

function ReviewItem({ invoice, plans, lang }: { invoice: Review; plans: Plan[]; lang: Lang }) {
  const en = lang === "en";
  const awaiting = invoice.status === "awaiting_review";
  const plan = plans.find(p => p.code === invoice.target_plan_code);
  const method = { instapay: en ? "InstaPay" : "إنستاباي", mobile_wallet_manual: en ? "Mobile wallet transfer" : "تحويل محفظة هاتف",
    bank_transfer: en ? "Bank transfer" : "تحويل بنكي" }[invoice.payment_channel];
  return <article className="billing-review" data-invoice-id={invoice.id}>
    <header><div><h3>{localizedText(lang, invoice.stores.name_ar, invoice.stores.name_en)}</h3><small><bdi dir="ltr">{invoice.stores.slug}</bdi></small></div>
      <strong><bdi dir="ltr">{formatMoney(invoice.amount_egp, "EGP", lang)}</bdi></strong></header>
    <dl className="billing-review-facts">
      <div><dt>{en ? "Plan" : "الباقة"}</dt><dd>{plan ? localizedText(lang, plan.name_ar, plan.name_en) : invoice.target_plan_code} · {cycleName(invoice.target_billing_cycle, lang)}</dd></div>
      <div><dt>{en ? "Payment method" : "طريقة الدفع"}</dt><dd>{method}</dd></div>
      <div><dt>{en ? "Reference" : "مرجع التحويل"}</dt><dd><bdi dir="ltr">{invoice.transfer_reference}</bdi></dd></div>
      {invoice.transfer_sender && <div><dt>{en ? "Sender" : "المرسل"}</dt><dd><bdi dir="ltr">{invoice.transfer_sender}</bdi></dd></div>}
      <div><dt>{awaiting ? (en ? "Submitted" : "تاريخ الطلب") : (en ? "Reviewed" : "تاريخ المراجعة")}</dt>
        <dd><bdi dir="ltr">{formatDate(invoice.reviewed_at ?? invoice.created_at, lang)}</bdi></dd></div>
    </dl>
    {invoice.merchant_note && <p><strong>{en ? "Merchant note" : "ملاحظة التاجر"}</strong> · <bdi dir="auto">{invoice.merchant_note}</bdi></p>}
    {invoice.receipt_path && <a className="ws-text-link" href={"/api/admin/billing/receipts/" + invoice.id} target="_blank" rel="noreferrer">
      {en ? "View receipt" : "عرض الإيصال"}</a>}
    {awaiting ? <ReviewControls lang={lang} invoiceId={invoice.id} /> :
      <p><strong>{invoice.status === "paid" ? (en ? "Approved" : "تمت الموافقة") : (en ? "Rejected" : "مرفوض")}</strong>
        {invoice.review_note && <> · <bdi dir="auto">{invoice.review_note}</bdi></>}</p>}
  </article>;
}

export async function BillingManagement({ lang, plans }: { lang: Lang; plans: Plan[] }) {
  const { db } = await requireSuperAdmin();
  const [pending, recent, settings, credentials, requestHeaders] = await Promise.all([
    pendingReviews(db),
    db.from("subscription_invoices").select(selection).not("reviewed_at", "is", null).in("status", ["paid", "rejected"])
      .order("reviewed_at", { ascending: false }).order("id").limit(15).returns<Review[]>(),
    adminDb().from("platform_billing_settings").select("*").eq("id", 1).single<PaymentSettings>(),
    db.rpc("billing_admin_secret_status"), headers(),
  ]);
  const origin = requestHeaders.get(PLATFORM_ORIGIN_HEADER);
  if (!origin) throw new Error("Platform billing origin unavailable");
  const en = lang === "en";
  const history = checked(recent);
  return <>
    <section className="billing-box billing-queue" aria-labelledby="billing-review-heading">
      <h2 id="billing-review-heading">{en ? "Upgrade requests" : "طلبات ترقية الباقة"}</h2>
      {pending.length ? pending.map(invoice => <ReviewItem key={invoice.id} invoice={invoice} plans={plans} lang={lang} />) :
        <p>{en ? "No transfers are awaiting review." : "لا توجد تحويلات تنتظر المراجعة."}</p>}
      {history.length > 0 && <details className="billing-reviewed"><summary>{en ? "Recently reviewed" : "طلبات تمت مراجعتها مؤخراً"}</summary>
        {history.map(invoice => <ReviewItem key={invoice.id} invoice={invoice} plans={plans} lang={lang} />)}</details>}
    </section>
    <PaymentSettingsEditor lang={lang} origin={origin} settings={checked(settings)} configured={checked(credentials) as CredentialStatus} />
  </>;
}
