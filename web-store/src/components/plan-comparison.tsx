"use client";

import { useState } from "react";
import { annualSavings, cycleName, cycles, limitLabel, quotaKeys, quotaResources, resourceName,
  type BillingCycle, type Plan, type PlanCode } from "@/lib/billing";
import { localizedText, type Lang } from "@/lib/i18n";
import "./plan-comparison.css";

export function PlanComparison({ plans, lang, current, initialCycle = "monthly", heading, id }: {
  plans: Plan[] | null; lang: Lang; current?: PlanCode; initialCycle?: BillingCycle; heading?: string; id?: string;
}) {
  const [cycle, setCycle] = useState(initialCycle);
  const en = lang === "en";
  const currency = new Intl.NumberFormat(en ? "en-EG" : "ar-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 2, minimumFractionDigits: 0,
  });
  return <section className="plan-comparison" id={id} aria-labelledby="pricing-heading">
    <header><h2 id="pricing-heading">{heading ?? (en ? "Compare plans" : "مقارنة الباقات")}</h2>
      {Boolean(plans?.length) && <div className="plan-cycles" role="group" aria-label={en ? "Price per billing cycle" : "السعر حسب دورة الفوترة"}>
        {cycles.map(value => <button type="button" key={value} aria-pressed={cycle === value}
          onClick={() => setCycle(value)}>{cycleName(value, lang)}</button>)}
      </div>}
    </header>
    {!plans?.length ? <p role="status">{plans === null
      ? (en ? "Pricing is temporarily unavailable. Please check back shortly." : "تعذّر تحميل الأسعار مؤقتاً. يُرجى المحاولة بعد قليل.")
      : (en ? "There are no plans open for enrollment right now." : "لا توجد باقات متاحة للاشتراك حالياً.")}</p> :
      <div className="plan-cards">{plans.map(plan => {
        const savings = annualSavings(plan);
        return <article key={plan.code} className="plan-card" data-current={plan.code === current}>
          <div className="plan-card-title"><h3>{localizedText(lang, plan.name_ar, plan.name_en)}</h3>
            {plan.code === current && <small className="plan-tag">{en ? "Current plan" : "باقتك الحالية"}</small>}</div>
          <p className="plan-description">{localizedText(lang, plan.description_ar, plan.description_en)}</p>
          <p className="plan-price"><strong><bdi dir="ltr">{currency.format(cycle === "annual" ? plan.annual_price_egp : plan.monthly_price_egp)}</bdi></strong>
            <span>{cycle === "annual" ? (en ? "/ year" : "/ سنة") : (en ? "/ month" : "/ شهر")}</span></p>
          {cycle === "annual" && savings > 0 && <small className="plan-tag plan-savings">
            {en ? "Save " : "وفّر "}<bdi dir="ltr">{currency.format(savings)}</bdi>{en ? " per year" : " سنوياً"}</small>}
          <dl>{quotaKeys.map(key => <div key={key}><dt>{resourceName(quotaResources[key], lang)}</dt><dd>{plan[key] === null
            ? limitLabel(null, lang) : <bdi dir="ltr">{limitLabel(plan[key], lang)}</bdi>}</dd></div>)}
            <div><dt>{resourceName("custom_domains", lang)}</dt><dd data-included={plan.custom_domains_enabled}>{plan.custom_domains_enabled
              ? (en ? "Included" : "مشمولة") : (en ? "Unavailable" : "غير متاحة")}</dd></div>
            <div><dt>{en ? "Free trial" : "التجربة المجانية"}</dt><dd>{plan.trial_days
              ? <><bdi dir="ltr">{limitLabel(plan.trial_days, lang)}</bdi>{en ? " days" : " يوم"}</> : (en ? "None" : "لا توجد")}</dd></div>
          </dl>
        </article>;
      })}</div>}
  </section>;
}
