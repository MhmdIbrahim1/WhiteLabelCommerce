"use client";

import { showToast } from "@/components/floating-toast";
import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  X,
  HelpCircle,
  Boxes,
  Palette,
  Settings,
  TicketPercent,
  Share2,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { localizedText } from "@/lib/i18n";
import {
  markOnboardingStepDone,
  triggerAdminGuidedTour,
  updateStoreOnboarding,
  useStoreOnboarding,
} from "./onboarding-store";

export function StoreLaunchChecklist({
  storeId,
  storeSlug,
  storefrontUrl,
  storeNameAr,
  storeNameEn,
  productsCount,
  couponsCount,
}: {
  storeId: string;
  storeSlug: string;
  storefrontUrl: string;
  storeNameAr: string;
  storeNameEn: string;
  productsCount: number;
  couponsCount: number;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const state = useStoreOnboarding(storeId);
  const [copied, setCopied] = useState(false);

  if (state.checklistDismissed) return null;

  const storeTitle = localizedText(lang, storeNameAr, storeNameEn) || storeSlug;

  const steps = [
    {
      id: "product",
      done: productsCount > 0,
      icon: Boxes,
      title: isEn ? "Add your first product" : "أضف أول منتج",
      desc: productsCount ? <>{isEn ? "Products in your catalog" : "منتجات في الكتالوج"} · <bdi dir="ltr">{productsCount.toLocaleString(lang)}</bdi></>
        : isEn ? "Add a product with its price, stock and photos." : "أضف منتجاً مع سعره وصوره والكمية المتاحة.",
      href: "/admin/products",
      cta: isEn ? "Manage products" : "إدارة المنتجات",
    },
    {
      id: "customizer",
      done: state.customizerDone,
      toggleKey: "customizerDone" as const,
      icon: Palette,
      title: isEn
        ? "Set the look of your storefront"
        : "خصّص مظهر متجرك",
      desc: isEn
        ? "Choose the colors, layout and banners customers see on the web and in your app."
        : "اختر الألوان والتصميم والصور التي يراها عملاؤك على الموقع وفي التطبيق.",
      href: "/admin/customizer",
      cta: isEn ? "Open designer" : "افتح استوديو التصميم",
    },
    {
      id: "settings",
      done: state.settingsDone,
      toggleKey: "settingsDone" as const,
      icon: Settings,
      title: isEn
        ? "Set up shipping and payments"
        : "اضبط خيارات الشحن والدفع",
      desc: isEn
        ? "Set delivery fees, payment methods and cashback rewards."
        : "حدّد رسوم التوصيل وطرق الدفع وقيمة الاسترداد النقدي.",
      href: "/admin/settings",
      cta: isEn ? "Store settings" : "إعدادات المتجر",
    },
    {
      id: "coupon",
      done: couponsCount > 0,
      icon: TicketPercent,
      title: isEn ? "Create a discount code" : "أنشئ أول كود خصم",
      desc: couponsCount ? <>{isEn ? "Coupons created" : "أكواد الخصم الحالية"} · <bdi dir="ltr">{couponsCount.toLocaleString(lang)}</bdi></>
        : isEn ? "Offer a fixed amount or a percentage off." : "قدّم خصماً بمبلغ ثابت أو بنسبة من السعر.",
      href: "/admin/coupons",
      cta: isEn ? "Manage coupons" : "إدارة الأكواد",
    },
    {
      id: "share",
      done: state.sharedDone,
      toggleKey: "sharedDone" as const,
      icon: Share2,
      title: isEn ? "Share your storefront" : "شارك رابط متجرك",
      desc: <bdi dir="ltr">{storefrontUrl}</bdi>,
      href: storefrontUrl,
      cta: isEn ? "View storefront" : "معاينة المتجر",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const totalSteps = steps.length;
  const allDone = completedCount === totalSteps;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(storefrontUrl);
      showToast({ kind: "success", message: document.documentElement.lang.startsWith("en") ? "Copied to clipboard" : "تم النسخ" });
    } catch {
      /* fallback below */
      try {
        const ta = document.createElement("textarea");
        ta.value = storefrontUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        /* ignore */
      }
    }
    markOnboardingStepDone(storeId, "sharedDone", true);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const collapseLabel = state.checklistCollapsed ? (isEn ? "Expand checklist" : "عرض الخطوات") : (isEn ? "Collapse checklist" : "طيّ الخطوات");
  return <section className="ws-panel ws-checklist" aria-labelledby="launch-title">
    <header className="ws-panel-head"><div><h2 id="launch-title">{isEn ? "Launch checklist" : "خطوات إطلاق المتجر"}</h2>
      <small><bdi dir="auto">{storeTitle}</bdi> · <bdi dir="ltr">{completedCount.toLocaleString(lang)} / {totalSteps.toLocaleString(lang)}</bdi> {isEn ? "complete" : "مكتملة"}</small></div>
      <div className="ws-actions"><button type="button" className="ws-icon-button" aria-label={isEn ? "Replay tour" : "إعادة الجولة"} title={isEn ? "Replay tour" : "إعادة الجولة"} onClick={() => triggerAdminGuidedTour(storeId)}><HelpCircle size={17} /></button>
        <button type="button" className="ws-icon-button" aria-expanded={!state.checklistCollapsed} aria-label={collapseLabel} title={collapseLabel}
          onClick={() => updateStoreOnboarding(storeId, { checklistCollapsed: !state.checklistCollapsed })}>{state.checklistCollapsed ? <ChevronDown size={17}/> : <ChevronUp size={17}/>}</button>
        <button type="button" className="ws-icon-button" aria-label={isEn ? "Dismiss checklist" : "إخفاء الخطوات"} title={isEn ? "Dismiss checklist" : "إخفاء الخطوات"}
          onClick={() => updateStoreOnboarding(storeId, { checklistDismissed: true })}><X size={17}/></button></div></header>
    <progress aria-labelledby="launch-title" value={completedCount} max={totalSteps}/>
    {!state.checklistCollapsed && <>{allDone && <p role="status" className="ws-feedback">{isEn ? "You’ve completed every launch step." : "أتممت جميع خطوات إطلاق متجرك."}</p>}
      <ul>{steps.map(step => {
        const Icon = step.icon;
        const mark = step.done ? <CheckCircle2 size={18}/> : <Circle size={18}/>;
        return <li key={step.id} data-complete={step.done}>
          {step.toggleKey ? <button type="button" className="ws-step-state" aria-label={step.title} aria-pressed={step.done}
            onClick={() => step.toggleKey && markOnboardingStepDone(storeId, step.toggleKey, !step.done)}>{mark}</button> :
            <span className="ws-step-state" role="img" aria-label={step.done ? (isEn ? "Complete" : "مكتمل") : (isEn ? "Pending" : "قيد الإعداد")}>{mark}</span>}
          <div className="ws-step-copy"><strong><Icon size={15}/>{step.title}</strong><small>{step.desc}</small></div>
          <div className="ws-actions">{step.id === "share" ? <>
            <button type="button" className="ws-text-link" onClick={handleCopyLink}>{copied ? <Check size={14}/> : <Copy size={14}/>}
              {copied ? (isEn ? "Copied" : "تم النسخ") : (isEn ? "Copy link" : "نسخ الرابط")}</button>
            <Link className="ws-text-link" href={storefrontUrl} target="_blank" rel="noreferrer"
              onClick={() => markOnboardingStepDone(storeId, "sharedDone", true)}>{step.cta}<ExternalLink size={13}/></Link></> :
            <Link className="ws-text-link" href={step.href}>{step.cta}</Link>}</div>
        </li>;
      })}</ul></>}
  </section>;
}
