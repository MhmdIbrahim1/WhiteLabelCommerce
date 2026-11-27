import Link from "next/link";
import { checked, requireAdmin, requireSuperAdmin } from "@/lib/db";
import { getBillingStores, getStoreBilling, getPlanCatalog } from "@/lib/billing-data";
import { cycleName, limitLabel, quotaKeys, quotaResources, resourceName, statusNames, type Subscription } from "@/lib/billing";
import { formatDate, langDir, localizedText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { uuidPattern, type BillingInvoice, type BillingOptions } from "@/lib/billing-checkout";
import { StatusDot, UsageBar, WorkspaceHeading } from "@/components/workspace-data";
import { PlatformModeBar } from "@/components/workspace-surface";
import { BillingControls } from "./controls";
import { BillingManagement } from "./management";
import { BillingBanners, InvoiceHistory } from "./invoices";
import { MerchantPlans } from "./merchant-plans";
import "./billing.css";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ tab?: string; store?: string; page?: string; payment?: string; invoice?: string }> }) {
  const [{ db, storeId, activeStore, isSuperAdmin }, lang, params] = await Promise.all([requireAdmin("manage_billing"), getServerLang(), searchParams]);
  const en = lang === "en";
  const manage = isSuperAdmin && params.tab === "manage";
  const heading = <WorkspaceHeading title={en ? "Billing" : "الفوترة"}
    description={manage ? (en ? "Manage plan prices and set limits for individual stores." : "حدّد أسعار الباقات وخصّص حدود الاستخدام لكل متجر.") :
      (en ? "Review your subscription, usage and plan options." : "تابع اشتراك متجرك واستخدامه وقارن بين الباقات.")}>
    {isSuperAdmin && <nav className="ws-range" aria-label={en ? "Billing views" : "أقسام الفوترة"}>
      <Link href="/admin/billing" aria-current={!manage ? "page" : undefined}>{en ? "Store overview" : "اشتراك المتجر"}</Link>
      <Link href="/admin/billing?tab=manage" aria-current={manage ? "page" : undefined}>{en ? "Platform controls" : "إدارة المنصة"}</Link>
    </nav>}</WorkspaceHeading>;

  if (manage) {
    const { db } = await requireSuperAdmin();
    const [plans, stores] = await Promise.all([getPlanCatalog(true), getBillingStores()]);
    const target = stores.find(s => s.store_id === params.store)?.store_id ?? storeId;
    const sub = await db.rpc("billing_admin_subscription", { p_store: target }).single<Subscription>();
    return <div className="ws-page billing-page" dir={langDir(lang)}><PlatformModeBar />{heading}
      <BillingManagement lang={lang} plans={plans} />
      <BillingControls lang={lang} plans={plans} subscription={checked(sub)} stores={stores.map(s => ({
        id: s.store_id, name: localizedText(lang, s.stores.name_ar, s.stores.name_en), slug: s.stores.slug,
      }))} />
    </div>;
  }
  const page = /^\d{1,6}$/.test(params.page ?? "") ? Math.max(1, Number(params.page)) : 1;
  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const invoiceQuery = () => db.from("subscription_invoices")
    .select("id,target_plan_code,target_billing_cycle,amount_egp,payment_channel,status,transfer_reference,paymob_order_id,review_note,receipt_path,created_at,saas_plans(name_ar,name_en)")
    .eq("store_id", storeId);
  const [bill, plans, options, history, pending, callback] = await Promise.all([
    getStoreBilling(storeId), getPlanCatalog(), db.rpc("get_platform_billing_options", { p_store: storeId }),
    invoiceQuery().order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + pageSize).returns<BillingInvoice[]>(),
    invoiceQuery().eq("status", "awaiting_review").maybeSingle<BillingInvoice>(),
    params.invoice && uuidPattern.test(params.invoice) && params.payment && params.payment !== "unverified"
      ? db.from("subscription_invoices").select("status").eq("store_id", storeId).eq("id", params.invoice).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (pending.error || callback.error) throw new Error("Billing invoices could not be loaded");
  const invoices = checked(history);
  const status = callback.data?.status;
  const receiptStatus: Record<string, string> = { paid: "success", pending: "pending", refunded: "refunded",
    expired: "failed", cancelled: "failed", failed: "failed" };
  const payment = params.payment === "unverified" ? "unverified" : params.payment && ["success", "pending", "failed"].includes(params.payment)
    ? receiptStatus[status ?? ""] ?? "unverified" : undefined;
  const month = new Intl.DateTimeFormat(en ? "en-GB" : "ar-EG", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(bill.period_ym + "-01T00:00:00Z"));
  return <div className="ws-page billing-page" dir={langDir(lang)}>{heading}
    <BillingBanners bill={bill} plans={plans} store={storeId} lang={lang} pending={pending.data} payment={payment} />
    <section className="billing-box billing-summary" aria-labelledby="subscription-title">
      <div><h2 id="subscription-title">{en ? "Your subscription" : "اشتراك متجرك"}</h2>
        <p>{localizedText(lang, activeStore.name_ar, activeStore.name_en)}</p></div>
      <strong className="billing-plan-name">{localizedText(lang, bill.plan.name_ar, bill.plan.name_en)}</strong>
      <dl className="billing-facts">
        <div><dt>{en ? "Status" : "الحالة"}</dt><dd><StatusDot status={bill.status}>{statusNames[bill.status][lang]}</StatusDot></dd></div>
        <div><dt>{en ? "Billing cycle" : "دورة الفوترة"}</dt><dd>{cycleName(bill.billing_cycle, lang)}</dd></div>
        <div><dt>{en ? "Period start" : "بداية الفترة"}</dt><dd><bdi dir="ltr">{formatDate(bill.current_period_start, lang)}</bdi></dd></div>
        <div><dt>{bill.status === "active" ? (en ? "Renewal date" : "تاريخ التجديد") : (en ? "Period end" : "نهاية الفترة")}</dt>
          <dd><bdi dir="ltr">{formatDate(bill.current_period_end, lang)}</bdi></dd></div>
        {bill.trial_ends_at && <div><dt>{en ? "Trial ends" : "نهاية التجربة"}</dt><dd><bdi dir="ltr">{new Intl.DateTimeFormat(en ? "en-GB" : "ar-EG",
          { dateStyle: "medium", timeZone: "UTC" }).format(new Date(bill.trial_ends_at))}</bdi></dd></div>}
      </dl>
    </section>
    <section className="billing-box" aria-labelledby="usage-title">
      <div className="billing-section-head"><h2 id="usage-title">{en ? "Store usage" : "استخدام المتجر"}</h2><small><bdi dir="ltr">{month} · UTC</bdi></small></div>
      <div className="billing-meters">{quotaKeys.map(key => {
        const resource = quotaResources[key], used = bill[resource], cap = bill.entitlements[key];
        return <div className="billing-meter" key={key}>
          <div><strong id={key}>{resourceName(resource, lang)}</strong>
            <span><bdi dir="ltr">{limitLabel(used, lang)} / {limitLabel(cap, lang)}</bdi></span></div>
          <UsageBar cap={cap} used={used} lang={lang} label={resourceName(resource, lang)} />
          {resource === "staff_members" && <small>{en ? "Staff and unexpired invitations. Owners are exempt." : "الموظفون والدعوات السارية. مقاعد المالكين مجانية."}</small>}
          {Object.hasOwn(bill.quota_overrides, key) && <small>{en ? "Store-specific limit" : "حد مخصص لهذا المتجر"}</small>}
        </div>;
      })}</div>
      <div className="billing-domain"><strong>{resourceName("custom_domains", lang)}</strong>
        <span>{bill.entitlements.custom_domains_enabled ? (en ? "Included" : "مشمولة") : (en ? "Unavailable" : "غير متاحة")}
        {Object.hasOwn(bill.quota_overrides, "custom_domains_enabled") && (en ? " · Store override" : " · إعداد مخصص")}</span></div>
    </section>
    <MerchantPlans key={storeId} lang={lang} plans={plans} store={storeId} bill={bill} options={checked(options) as BillingOptions} manualPending={Boolean(pending.data)} />
    <InvoiceHistory invoices={invoices.slice(0, pageSize)} page={page} more={invoices.length > pageSize} lang={lang} />
  </div>;
}
