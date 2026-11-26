import Link from "next/link";
import { checked, requireAdmin, requireSuperAdmin } from "@/lib/db";
import { getBillingStores, getStoreBilling, getPlanCatalog } from "@/lib/billing-data";
import { cycleName, limitLabel, quotaKeys, quotaResources, resourceName, statusNames, type Subscription } from "@/lib/billing";
import { formatDate, langDir, localizedText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { PlanComparison } from "@/components/plan-comparison";
import { BillingControls } from "./controls";
import "./billing.css";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ tab?: string; store?: string }> }) {
  const [{ storeId, activeStore, isSuperAdmin }, lang, params] = await Promise.all([requireAdmin("manage_billing"), getServerLang(), searchParams]);
  const en = lang === "en";
  const manage = isSuperAdmin && params.tab === "manage";
  const heading = <header className="billing-heading"><h1>{en ? "Billing" : "الفوترة"}</h1>
    {isSuperAdmin && <nav aria-label={en ? "Billing views" : "أقسام الفوترة"}>
      <Link href="/admin/billing" aria-current={!manage ? "page" : undefined}>{en ? "Store overview" : "اشتراك المتجر"}</Link>
      <Link href="/admin/billing?tab=manage" aria-current={manage ? "page" : undefined}>{en ? "Platform controls" : "إدارة المنصة"}</Link>
    </nav>}</header>;

  if (manage) {
    const { db } = await requireSuperAdmin();
    const [plans, stores] = await Promise.all([getPlanCatalog(true), getBillingStores()]);
    const target = stores.find(s => s.store_id === params.store)?.store_id ?? storeId;
    const sub = await db.rpc("billing_admin_subscription", { p_store: target }).single<Subscription>();
    return <div className="billing-page" dir={langDir(lang)}>{heading}
      <BillingControls lang={lang} plans={plans} subscription={checked(sub)} stores={stores.map(s => ({
        id: s.store_id, name: localizedText(lang, s.stores.name_ar, s.stores.name_en), slug: s.stores.slug,
      }))} />
    </div>;
  }
  const [bill, plans] = await Promise.all([getStoreBilling(storeId), getPlanCatalog()]);
  const month = new Intl.DateTimeFormat(en ? "en-GB" : "ar-EG", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(bill.period_ym + "-01T00:00:00Z"));
  return <div className="billing-page" dir={langDir(lang)}>{heading}
    <section className="billing-box billing-summary" aria-labelledby="subscription-title">
      <div><h2 id="subscription-title">{en ? "Your subscription" : "اشتراك متجرك"}</h2>
        <p>{localizedText(lang, activeStore.name_ar, activeStore.name_en)}</p></div>
      <strong className="billing-plan-name">{localizedText(lang, bill.plan.name_ar, bill.plan.name_en)}</strong>
      <dl className="billing-facts">
        <div><dt>{en ? "Status" : "الحالة"}</dt><dd>{statusNames[bill.status][lang]}</dd></div>
        <div><dt>{en ? "Billing cycle" : "دورة الفوترة"}</dt><dd>{cycleName(bill.billing_cycle, lang)}</dd></div>
        <div><dt>{en ? "Period start" : "بداية الفترة"}</dt><dd>{formatDate(bill.current_period_start, lang)}</dd></div>
        <div><dt>{bill.status === "active" ? (en ? "Renewal date" : "تاريخ التجديد") : (en ? "Period end" : "نهاية الفترة")}</dt>
          <dd>{formatDate(bill.current_period_end, lang)}</dd></div>
        {bill.trial_ends_at && <div><dt>{en ? "Trial ends" : "نهاية التجربة"}</dt><dd>{new Intl.DateTimeFormat(en ? "en-GB" : "ar-EG",
          { dateStyle: "medium", timeZone: "UTC" }).format(new Date(bill.trial_ends_at))}</dd></div>}
      </dl>
    </section>
    <section className="billing-box" aria-labelledby="usage-title">
      <div className="billing-section-head"><h2 id="usage-title">{en ? "Store usage" : "استخدام المتجر"}</h2><small>{month} · UTC</small></div>
      <div className="billing-meters">{quotaKeys.map(key => {
        const resource = quotaResources[key], used = bill[resource], cap = bill.entitlements[key];
        return <div className="billing-meter" key={key}>
          <div><strong id={key}>{resourceName(resource, lang)}</strong>
            <span><bdi>{limitLabel(used, lang)} / {limitLabel(cap, lang)}</bdi></span></div>
          {cap === null ? <div className="billing-unlimited-track" aria-hidden="true" /> :
            <progress aria-labelledby={key} value={cap === 0 ? 1 : Math.min(used, cap)} max={Math.max(1, cap)}
              aria-valuetext={limitLabel(used, lang) + " / " + limitLabel(cap, lang)} />}
          {resource === "staff_members" && <small>{en ? "Staff and unexpired invitations. Owners are exempt." : "الموظفون والدعوات السارية. مقاعد المالكين مجانية."}</small>}
          {Object.hasOwn(bill.quota_overrides, key) && <small>{en ? "Store-specific limit" : "حد مخصص لهذا المتجر"}</small>}
        </div>;
      })}</div>
      <div className="billing-domain"><strong>{resourceName("custom_domains", lang)}</strong>
        <span>{bill.entitlements.custom_domains_enabled ? (en ? "Included" : "مشمولة") : (en ? "Unavailable" : "غير متاحة")}
        {Object.hasOwn(bill.quota_overrides, "custom_domains_enabled") && (en ? " · Store override" : " · إعداد مخصص")}</span></div>
    </section>
    <div id="plans"><PlanComparison lang={lang} plans={plans} current={bill.plan.code} initialCycle={bill.billing_cycle} /></div>
  </div>;
}
