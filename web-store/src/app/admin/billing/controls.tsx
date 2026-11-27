"use client";

import { useEffect, useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/components/use-hydrated";
import { cycleName, cycles, limitLabel, quotaKeys, quotaResources, resourceName, statusNames, subscriptionStatuses,
  type Plan, type QuotaKey, type Subscription } from "@/lib/billing";
import { localizedText, type Lang } from "@/lib/i18n";
import { savePlan, saveSubscription, type SaveResult } from "./actions";

type StoreChoice = { id: string; name: string; slug: string };
const messages: Record<SaveResult, Record<Lang, string>> = {
  saved: { en: "Changes saved.", ar: "تم حفظ التغييرات." },
  invalid: { en: "Check the field values and try again.", ar: "راجع القيم وأعد المحاولة." },
  conflict: { en: "Someone updated this record. Reload the latest values before saving.", ar: "تغيّرت هذه البيانات. حمّل أحدث القيم قبل الحفظ." },
  inactive: { en: "This plan is closed to new subscriptions.", ar: "هذه الباقة مغلقة أمام الاشتراكات الجديدة." },
  unavailable: { en: "Could not save changes. Please try again.", ar: "تعذّر حفظ التغييرات. يُرجى المحاولة مرة أخرى." },
};

export function Editor({ lang, save, children, label }: { lang: Lang; save: (f: FormData) => Promise<SaveResult>; children: ReactNode; label: string }) {
  const interactive = useHydrated();
  const [feedback, setFeedback] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();
  const [issue, setIssue] = useState<{ input: HTMLInputElement | HTMLTextAreaElement; message: string } | null>(null);
  const issueId = useId();
  useEffect(() => {
    if (!issue) return;
    const { input } = issue;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", issueId);
    input.focus();
    return () => { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); };
  }, [issue, issueId]);
  const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (feedback === "conflict" || pending) return;
    const input = [...event.currentTarget.elements].find((el): el is HTMLInputElement | HTMLTextAreaElement =>
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.willValidate &&
      (!el.validity.valid || (el.required && !el.value.trim())));
    if (input) {
      const en = lang === "en";
      const message = input.validity.badInput || input.validity.stepMismatch ? (en ? "Enter a whole number." : "أدخل عدداً صحيحاً.") :
        input.validity.rangeUnderflow || input.validity.rangeOverflow ? (en ? "Enter a number within the allowed range." : "أدخل قيمة ضمن النطاق المسموح.") :
        (en ? "Complete this field before saving." : "أكمل هذا الحقل قبل الحفظ.");
      setIssue({ input, message });
      return;
    }
    const data = new FormData(event.currentTarget);
    setFeedback(null);
    start(async () => {
      try { setFeedback(await save(data)); } catch { setFeedback("unavailable"); }
    });
  }
  return <form method="post" noValidate onSubmit={submit} onChange={() => { setIssue(null); if (feedback !== "conflict") setFeedback(null); }}>
    <fieldset disabled={!interactive || pending} className="billing-fields">{children}</fieldset>
    {issue?.input.parentElement && createPortal(<small id={issueId} role="alert" className="ws-field-error">{issue.message}</small>, issue.input.parentElement)}
    <footer><button className="ws-primary" type="submit" disabled={!interactive || pending || feedback === "conflict"}>{pending ? (lang === "en" ? "Saving…" : "جارٍ الحفظ…") : label}</button>
      <span role="status" className={feedback && feedback !== "saved" ? "ws-field-error" : undefined}>{feedback && messages[feedback][lang]}</span>
      {feedback === "conflict" && <button className="ws-button" type="button" onClick={() => { start(() => router.refresh()); setFeedback(null); }}>
        {lang === "en" ? "Reload values" : "تحميل القيم"}</button>}</footer>
  </form>;
}

function QuotaField({ field, value, planLimit, override, lang }: {
  field: QuotaKey; value: number | null | undefined; planLimit: number | null; override?: boolean; lang: Lang;
}) {
  const en = lang === "en";
  const [mode, setMode] = useState(value === undefined ? "inherit" : value === null ? "unlimited" : "custom");
  const [draft, setDraft] = useState<string | null>(null);
  const label = resourceName(quotaResources[field], lang);
  return <fieldset className="billing-quota-field"><legend>{label}</legend>
    {override ? <select aria-label={label} name={field + "_mode"} value={mode} onChange={e => setMode(e.target.value)}>
      <option value="inherit">{(en ? "Inherit from plan" : "استخدم حد الباقة") + " (" + limitLabel(planLimit, lang) + ")"}</option>
      <option value="custom">{en ? "Custom number" : "حد رقمي"}</option>
      <option value="unlimited">{limitLabel(null, lang)}</option>
    </select> : <label className="billing-unlimited"><input type="hidden" name={field + "_mode"} value={mode} />
      <input type="checkbox" checked={mode === "unlimited"} onChange={e => setMode(e.target.checked ? "unlimited" : "custom")} />
      {limitLabel(null, lang)}</label>}
    {mode === "custom" && <label>{en ? "Limit" : "الحد"}<input name={field} aria-label={label + " · " + (en ? "Limit" : "الحد")}
      type="number" min="0" max="2147483647" step="1" required value={draft ?? value ?? planLimit ?? ""} onChange={e => setDraft(e.target.value)} /></label>}
  </fieldset>;
}

function PlanFields({ plan, lang }: { plan: Plan; lang: Lang }) {
  const en = lang === "en";
  return <><input type="hidden" name="code" value={plan.code} />
    <div className="billing-form-grid">{(["ar", "en"] as const).map(language => <div key={language} className="billing-field-group">
      <label>{language === "en" ? (en ? "English name" : "الاسم بالإنجليزية") : (en ? "Arabic name" : "الاسم بالعربية")}
        <input lang={language} dir={language === "en" ? "ltr" : "rtl"} name={"name_" + language} required maxLength={100} defaultValue={plan[language === "en" ? "name_en" : "name_ar"]} /></label>
      <label>{language === "en" ? (en ? "English description" : "الوصف بالإنجليزية") : (en ? "Arabic description" : "الوصف بالعربية")}
        <textarea lang={language} dir={language === "en" ? "ltr" : "rtl"} name={"description_" + language} required maxLength={1000}
          defaultValue={plan[language === "en" ? "description_en" : "description_ar"]} rows={2} /></label>
    </div>)}</div>
    <div className="billing-form-grid">
      {([["monthly_price_egp", en ? "Monthly price (EGP)" : "السعر الشهري (ج.م.)"],
        ["annual_price_egp", en ? "Annual price (EGP)" : "السعر السنوي (ج.م.)"],
        ["trial_days", en ? "Free trial (days)" : "مدة التجربة (أيام)"], ["sort_order", en ? "Display order" : "ترتيب العرض"]] as const)
        .map(([key, title]) => <label key={key}>{title}<input type="number" name={key} step="1" required
          min={key === "sort_order" ? -2147483648 : 0} max={2147483647} defaultValue={plan[key]} /></label>)}
    </div>
    <div className="billing-quota-grid">{quotaKeys.map(key => <QuotaField key={key} field={key} value={plan[key]} planLimit={plan[key]} lang={lang} />)}</div>
    <div className="billing-checks"><label><input type="checkbox" name="custom_domains_enabled" defaultChecked={plan.custom_domains_enabled} />
      {en ? "Include custom domains" : "تفعيل النطاقات المخصصة"}</label>
      <label><input type="checkbox" name="is_active" defaultChecked={plan.is_active} />{en ? "Open for enrollment" : "متاحة للاشتراك"}</label></div>
  </>;
}

function SubscriptionFields({ sub, plans, lang }: { sub: Subscription; plans: Plan[]; lang: Lang }) {
  const en = lang === "en";
  const [code, setCode] = useState(sub.plan_code);
  const [status, setStatus] = useState(sub.status);
  const plan = plans.find(p => p.code === code)!;
  const domain = sub.quota_overrides.custom_domains_enabled;
  return <><div className="billing-form-grid">
    <label>{en ? "Assigned plan" : "الباقة المحددة"}<select name="plan_code" value={code} onChange={e => setCode(e.target.value as Plan["code"])}>
      {plans.filter(p => p.is_active || p.code === sub.plan_code).map(p => <option key={p.code} value={p.code}>{localizedText(lang, p.name_ar, p.name_en)}</option>)}
    </select></label>
    <label>{en ? "Billing cycle" : "دورة الفوترة"}<select name="billing_cycle" defaultValue={sub.billing_cycle}>{cycles.map(c =>
      <option key={c} value={c}>{cycleName(c, lang)}</option>)}</select></label>
    <label>{en ? "Subscription status" : "حالة الاشتراك"}<select name="status" value={status} onChange={e => setStatus(e.target.value as Subscription["status"])}>
      {subscriptionStatuses.map(s => <option value={s} key={s}>{statusNames[s][lang]}</option>)}</select></label>
    <label>{en ? "Trial end date (UTC)" : "آخر يوم للتجربة (UTC)"}<input type="date" name="trial_end" required={status === "trialing"}
      defaultValue={sub.trial_ends_at?.slice(0, 10) ?? ""} /></label>
  </div>
    <div className="ws-rule"><h3>{en ? "Store overrides" : "حدود خاصة بالمتجر"}</h3>
      <small>{en ? "Keep the plan allowance or choose a limit for this store." : "استخدم حد الباقة أو اختر حدّاً خاصاً بهذا المتجر."}</small></div>
    <div className="billing-quota-grid">{quotaKeys.map(key =>
      <QuotaField key={key} field={key} value={sub.quota_overrides[key]} planLimit={plan[key]} lang={lang} override />)}</div>
    <label>{resourceName("custom_domains", lang)}<select name="custom_domains_enabled" defaultValue={domain === undefined ? "inherit" : domain ? "enabled" : "disabled"}>
      <option value="inherit">{en ? "Inherit from plan" : "استخدم إعداد الباقة"} ({plan.custom_domains_enabled ? (en ? "Included" : "مشمولة") : (en ? "Unavailable" : "غير متاحة")})</option>
      <option value="enabled">{en ? "Enable for this store" : "تفعيل لهذا المتجر"}</option><option value="disabled">{en ? "Disable for this store" : "تعطيل لهذا المتجر"}</option>
    </select></label>
    <label>{en ? "Internal note" : "ملاحظة داخلية"}<textarea rows={2} name="admin_notes" maxLength={4000} defaultValue={sub.admin_notes ?? ""} /></label>
  </>;
}

export function BillingControls({ lang, plans, subscription, stores }: {
  lang: Lang; plans: Plan[]; subscription: Subscription; stores: StoreChoice[];
}) {
  const en = lang === "en";
  const [planCode, setPlanCode] = useState(plans[0].code);
  const plan = plans.find(p => p.code === planCode)!;
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  return <>
    <section className="billing-box billing-editor"><div className="billing-section-head"><h2>{en ? "Plans editor" : "تعديل الباقات"}</h2>
      <label>{en ? "Plan to edit" : "اختر باقة"}<select value={planCode} onChange={e => setPlanCode(e.target.value as Plan["code"])}>
        {plans.map(p => <option key={p.code} value={p.code}>{localizedText(lang, p.name_ar, p.name_en)}</option>)}</select></label></div>
      <Editor key={plan.code} save={savePlan.bind(null, plan.revision)} lang={lang} label={en ? "Save plan" : "حفظ الباقة"}>
        <PlanFields key={plan.revision} plan={plan} lang={lang} /></Editor>
    </section>
    <section id="subscriptions" className="billing-box billing-editor"><div className="billing-section-head">
      <h2>{en ? "Store subscriptions" : "اشتراكات المتاجر"}</h2>
      <label>{en ? "Store to manage" : "اختر متجراً"}<select value={subscription.store_id} disabled={switching} onChange={e => {
        const target = e.target.value;
        startSwitch(() => router.replace("/admin/billing?tab=manage&store=" + encodeURIComponent(target) + "#subscriptions", { scroll: false }));
      }}>{stores.map(s => <option value={s.id} key={s.id}>{s.name} ({s.slug})</option>)}</select></label></div>
      <fieldset className="billing-fields" disabled={switching}><Editor key={subscription.store_id} lang={lang}
        save={saveSubscription.bind(null, subscription.store_id, subscription.revision)} label={en ? "Save subscription" : "حفظ الاشتراك"}>
        <SubscriptionFields key={subscription.revision} sub={subscription} plans={plans} lang={lang} /></Editor></fieldset>
    </section>
  </>;
}
