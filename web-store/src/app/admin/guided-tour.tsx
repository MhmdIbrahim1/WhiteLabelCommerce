"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  HelpCircle,
  X,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
  getStoreOnboardingState,
  START_TOUR_EVENT,
  triggerAdminGuidedTour,
  updateStoreOnboarding,
} from "./onboarding-store";

type TourStepDef = {
  target: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
};

const TOUR_STEPS: TourStepDef[] = [
  {
    target: "store-switcher",
    titleAr: "مبدّل المتاجر",
    titleEn: "Store Switcher",
    bodyAr:
      "تنقّل بسهولة بين متاجرك النشطة، عاين متجرك الحي بضغطة واحدة، أو أنشئ متجراً جديداً في أي وقت.",
    bodyEn:
      "Switch smoothly between your managed stores, preview the live storefront, or launch a new store anytime.",
  },
  {
    target: "nav-products",
    titleAr: "المنتجات والمخزون",
    titleEn: "Products & Inventory",
    bodyAr:
      "أضف الفئات والمنتجات باللغتين مع الصور والمقاسات والألوان والمواصفات، وتابع الحد المتاح في باقتك.",
    bodyEn:
      "Add bilingual categories and products with photos, variants, and specs while tracking your plan product quota.",
  },
  {
    target: "nav-orders",
    titleAr: "الطلبات والشحن",
    titleEn: "Orders & Fulfillment",
    bodyAr:
      "تابع الطلبات الجديدة، سجّل بيانات شحن بوسطة أو شركات التوصيل، وشارك رابط تأكيد التسليم السريع مع المندوب.",
    bodyEn:
      "Track incoming orders, assign Bosta or courier tracking details, and share one-tap driver delivery links.",
  },
  {
    target: "nav-customers",
    titleAr: "العملاء والمحفظة",
    titleEn: "Customers & Wallet",
    bodyAr:
      "استعرض ملفات عملاء متجرك، سجل طلباتهم وقيمتهم الشرائية، وأضف أو عدّل رصيد المحفظة والكاش باك فوراً.",
    bodyEn:
      "Inspect customer CRM profiles, lifetime spend, and adjust store credit or cashback wallet balances instantly.",
  },
  {
    target: "nav-customizer",
    titleAr: "استوديو التصميم",
    titleEn: "Theme Customizer",
    bodyAr:
      "خصّص القوالب والألوان والأقسام وكاروسيل البانرات الترويجية بمعاينة فورية للموقع وتطبيق الأندرويد معاً.",
    bodyEn:
      "Live-edit templates, colors, home sections, and hero promo carousels synced to both Web and Android.",
  },
  {
    target: "nav-settings",
    titleAr: "الإعدادات والكوبونات",
    titleEn: "Settings & Coupons",
    bodyAr:
      "اضبط شريط الشحن المجاني، نسبة الكاش باك، بوابات الدفع (الدفع عند الاستلام / باي موب)، وأكواد الخصم الترويجية.",
    bodyEn:
      "Configure the free-shipping bar, cashback %, payment gateways (COD / Paymob), and promo discount coupons.",
  },
];

type RectBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const emptySubscribe = () => () => {};

export function AdminTourTrigger({ storeId }: { storeId: string }) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const label = isEn ? "Replay workspace tour" : "إعادة جولة لوحة المتجر";
  return <button type="button" className="ws-icon-button" aria-label={label} title={label}
    onClick={() => triggerAdminGuidedTour(storeId)}><HelpCircle size={18}/></button>;
}

export function AdminGuidedTour({ storeId }: { storeId: string }) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<RectBox | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });

  const closeTour = useCallback(() => {
    setOpen(false);
    updateStoreOnboarding(storeId, { tourSeen: true });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("onboarding")) {
        url.searchParams.delete("onboarding");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    }
  }, [storeId]);

  const measureCurrentStep = useCallback((idx: number) => {
    if (typeof window === "undefined") return;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    setViewport({ width: vw, height: vh });
    const step = TOUR_STEPS[idx];
    if (!step) {
      setTargetRect(null);
      return;
    }
    const targets = document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`);
    const visible = Array.from(targets).find(target => target.getClientRects().length);
    const el = visible ?? document.querySelector<HTMLElement>('[data-tour="workspace-menu"]');
    if (!el) {
      setTargetRect(null);
      return;
    }
    el.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches || el.closest('[data-motion="off"]') ? "instant" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setTargetRect(null);
      return;
    }
    const pad = 6;
    setTargetRect({
      top: Math.max(4, rect.top - pad),
      left: Math.max(4, rect.left - pad),
      width: Math.min(vw - 8, rect.width + pad * 2),
      height: rect.height + pad * 2,
    });
  }, []);

  // Listen for manual replay trigger & auto-launch on `?onboarding=1` (once per storeId)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStartTour = (e: Event) => {
      const detail = (e as CustomEvent<{ storeId?: string }>).detail;
      if (detail?.storeId && detail.storeId !== storeId) return;
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(START_TOUR_EVENT, onStartTour);

    const params = new URLSearchParams(window.location.search);
    const shouldAutoLaunch =
      params.get("onboarding") === "1" &&
      !getStoreOnboardingState(storeId).tourSeen;

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (shouldAutoLaunch) {
      timer = setTimeout(() => {
        setStepIndex(0);
        setOpen(true);
      }, 280);
    }

    return () => {
      window.removeEventListener(START_TOUR_EVENT, onStartTour);
      if (timer) clearTimeout(timer);
    };
  }, [storeId]);

  // Measure target rect when open/step changes + on resize/scroll
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => measureCurrentStep(stepIndex));
    const afterScroll = setTimeout(() => measureCurrentStep(stepIndex), 260);

    const handleRelayout = () => measureCurrentStep(stepIndex);
    window.addEventListener("resize", handleRelayout);
    window.addEventListener("scroll", handleRelayout, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(afterScroll);
      window.removeEventListener("resize", handleRelayout);
      window.removeEventListener("scroll", handleRelayout, true);
    };
  }, [open, stepIndex, measureCurrentStep]);

  // Keyboard shortcuts: Esc to close, arrows to step
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeTour();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setStepIndex((i) =>
          isEn
            ? Math.min(TOUR_STEPS.length - 1, i + 1)
            : Math.max(0, i - 1),
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIndex((i) =>
          isEn
            ? Math.max(0, i - 1)
            : Math.min(TOUR_STEPS.length - 1, i + 1),
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isEn, closeTour]);

  if (!isClient || !open) return null;

  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const NextIcon = isEn ? ArrowRight : ArrowLeft;
  const PrevIcon = isEn ? ArrowLeft : ArrowRight;

  const cardWidth = Math.min(350, Math.max(260, viewport.width - 32));
  const cardEstimatedHeight = 236;
  const isNarrow = viewport.width < 860 || !targetRect;

  let popoverTop = Math.max(16, viewport.height - cardEstimatedHeight - 20);
  let popoverLeft = Math.round((viewport.width - cardWidth) / 2);

  if (!isNarrow && targetRect) {
    const gap = 16;
    const spaceRight =
      viewport.width - (targetRect.left + targetRect.width) - gap;
    const spaceLeft = targetRect.left - gap;

    if (!isEn && spaceLeft >= cardWidth + 12) {
      // RTL: sidebar sits on right -> place popover cleanly to the left of spotlight
      popoverLeft = targetRect.left - cardWidth - gap;
      popoverTop = Math.min(
        Math.max(16, targetRect.top),
        Math.max(16, viewport.height - cardEstimatedHeight - 16),
      );
    } else if (spaceRight >= cardWidth + 12) {
      // LTR: sidebar sits on left -> place popover cleanly to the right of spotlight
      popoverLeft = targetRect.left + targetRect.width + gap;
      popoverTop = Math.min(
        Math.max(16, targetRect.top),
        Math.max(16, viewport.height - cardEstimatedHeight - 16),
      );
    } else if (spaceLeft >= cardWidth + 12) {
      popoverLeft = targetRect.left - cardWidth - gap;
      popoverTop = Math.min(
        Math.max(16, targetRect.top),
        Math.max(16, viewport.height - cardEstimatedHeight - 16),
      );
    } else {
      // Below/above fallback clamped safely inside viewport
      const belowTop = targetRect.top + targetRect.height + gap;
      popoverTop =
        belowTop + cardEstimatedHeight <= viewport.height - 12
          ? belowTop
          : Math.max(16, targetRect.top - cardEstimatedHeight - gap);
      popoverLeft = Math.min(
        Math.max(12, targetRect.left),
        viewport.width - cardWidth - 12,
      );
    }
  }

  // Final hard viewport clamp to guarantee zero horizontal overflow
  popoverLeft = Math.min(
    Math.max(12, popoverLeft),
    Math.max(12, viewport.width - cardWidth - 12),
  );

  return createPortal(
    <dialog className="ws-tour-dialog" aria-labelledby="ws-tour-title" ref={dialog}
      onCancel={event => { event.preventDefault(); closeTour(); }} onClick={event => { if (event.target === dialog.current) closeTour(); }}>
      <svg className="ws-tour-spot" aria-hidden="true">
        <defs><mask id="ws-tour-mask"><rect width="100%" height="100%" fill="white"/>
          {targetRect && <rect x={targetRect.left} y={targetRect.top} width={targetRect.width} height={targetRect.height} rx="7" fill="black"/>}</mask></defs>
        <rect width="100%" height="100%" fill="rgb(7 11 16 / .55)" mask="url(#ws-tour-mask)"/>
        {targetRect && <rect x={targetRect.left} y={targetRect.top} width={targetRect.width} height={targetRect.height} rx="7" fill="none" stroke="#fff" strokeWidth="2"/>}
      </svg>
      <section className="ws-tour-card" style={{ left: popoverLeft, top: popoverTop, width: cardWidth }}>
        <header className="ws-panel-head"><small>{isEn ? "Workspace tour" : "جولة لوحة المتجر"} · <bdi dir="ltr">{(stepIndex + 1).toLocaleString(lang)} / {TOUR_STEPS.length.toLocaleString(lang)}</bdi></small>
          <button type="button" className="ws-icon-button" aria-label={isEn ? "Close tour" : "إغلاق الجولة"} onClick={closeTour}><X size={17}/></button></header>
        <div aria-live="polite"><h2 id="ws-tour-title">{isEn ? step.titleEn : step.titleAr}</h2><p>{isEn ? step.bodyEn : step.bodyAr}</p></div>
        <nav className="ws-tour-steps" aria-label={isEn ? "Tour steps" : "خطوات الجولة"}>{TOUR_STEPS.map((item, i) =>
          <button type="button" key={item.target} aria-label={isEn ? item.titleEn : item.titleAr} aria-current={i === stepIndex ? "step" : undefined}
            onClick={() => setStepIndex(i)}/>)}</nav>
        <footer><button type="button" className="ws-text-link" onClick={closeTour}>{isEn ? "Skip" : "تخطّي"}</button>
          {!isFirst && <button type="button" className="ws-icon-button" aria-label={isEn ? "Previous" : "السابق"} onClick={() => setStepIndex(i => i - 1)}><PrevIcon size={16}/></button>}
          <button type="button" className="pt-action" onClick={isLast ? closeTour : () => setStepIndex(i => i + 1)}>
            {isLast ? (isEn ? "Finish" : "إنهاء") : (isEn ? "Next" : "التالي")}{isLast ? <Check size={15}/> : <NextIcon size={15}/>}</button></footer>
      </section>
    </dialog>, document.querySelector("[data-workspace-overlay]") ?? document.body);
}
