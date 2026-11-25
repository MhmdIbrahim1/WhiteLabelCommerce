"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  HelpCircle,
  X,
  ArrowLeft,
  ArrowRight,
  Sparkles,
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
  return (
    <button
      type="button"
      onClick={() => triggerAdminGuidedTour(storeId)}
      title={
        isEn
          ? "Start Quick Tour & Reopen Checklist"
          : "بدء الجولة السريعة وإظهار دليل الإطلاق"
      }
      style={{
        background: "color-mix(in srgb, var(--primary) 10%, transparent)",
        color: "var(--primary)",
        border: "1px solid color-mix(in srgb, var(--primary) 24%, transparent)",
        padding: "0.34rem 0.68rem",
        fontSize: "0.8rem",
        borderRadius: "999px",
        gap: "0.35rem",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <HelpCircle size={15} />
      <span>{isEn ? "Quick Tour" : "جولة سريعة"}</span>
    </button>
  );
}

export function AdminGuidedTour({ storeId }: { storeId: string }) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const [open, setOpen] = useState(false);
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
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${step.target}"]`,
    );
    if (!el) {
      setTargetRect(null);
      return;
    }
    el.scrollIntoView({
      behavior: "smooth",
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? "Merchant Guided Tour" : "جولة لوحة التحكم"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 140,
        pointerEvents: "auto",
      }}
    >
      {/* Dimmed backdrop when no target rect or narrow mobile fallback */}
      {!targetRect ? (
        <div
          onClick={closeTour}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.58)",
          }}
        />
      ) : (
        <>
          <div
            onClick={closeTour}
            style={{
              position: "fixed",
              inset: 0,
              background: "transparent",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              top: targetRect.top,
              left: targetRect.left,
              width: targetRect.width,
              height: targetRect.height,
              borderRadius: "12px",
              boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.58)",
              outline: "2.5px solid #ffffff",
              outlineOffset: "2px",
              pointerEvents: "none",
              transition:
                "top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease",
            }}
          />
        </>
      )}

      {/* Spotlight Popover Card */}
      <div
        dir={isEn ? "ltr" : "rtl"}
        style={{
          position: "fixed",
          top: popoverTop,
          left: popoverLeft,
          width: cardWidth,
          maxWidth: "calc(100vw - 24px)",
          background: "#ffffff",
          color: "#0f172a",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow:
            "0 20px 45px rgba(15, 23, 42, 0.28), 0 4px 12px rgba(15, 23, 42, 0.12)",
          padding: "1.15rem 1.2rem",
          display: "grid",
          gap: "0.75rem",
          transition: "top 220ms ease, left 220ms ease",
          zIndex: 141,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.74rem",
              fontWeight: 700,
              padding: "0.2rem 0.6rem",
              borderRadius: "999px",
              background: "color-mix(in srgb, var(--primary) 12%, transparent)",
              color: "var(--primary)",
            }}
          >
            <Sparkles size={12} />
            <span>
              {stepIndex + 1} / {TOUR_STEPS.length}
            </span>
          </span>

          <button
            type="button"
            onClick={closeTour}
            aria-label={isEn ? "Close tour" : "إغلاق الجولة"}
            style={{
              background: "transparent",
              color: "#64748b",
              padding: "0.2rem",
              borderRadius: "8px",
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div style={{ display: "grid", gap: "0.35rem" }}>
          <h3
            style={{
              margin: 0,
              fontSize: "1.02rem",
              fontWeight: 750,
              color: "#0f172a",
            }}
          >
            {isEn ? step.titleEn : step.titleAr}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "0.86rem",
              lineHeight: 1.55,
              color: "#475569",
            }}
          >
            {isEn ? step.bodyEn : step.bodyAr}
          </p>
        </div>

        {/* Step dots */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          {TOUR_STEPS.map((s, idx) => (
            <button
              key={s.target}
              type="button"
              aria-label={`Step ${idx + 1}`}
              onClick={() => setStepIndex(idx)}
              style={{
                padding: 0,
                height: 7,
                width: idx === stepIndex ? 22 : 7,
                borderRadius: "999px",
                background:
                  idx === stepIndex ? "var(--primary)" : "#cbd5e1",
                transition: "width 180ms ease, background 180ms ease",
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            paddingTop: "0.45rem",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          <button
            type="button"
            onClick={closeTour}
            style={{
              background: "transparent",
              color: "#64748b",
              padding: "0.4rem 0.55rem",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {isEn ? "Skip" : "تخطي"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                style={{
                  background: "#f1f5f9",
                  color: "#0f172a",
                  padding: "0.42rem 0.72rem",
                  fontSize: "0.82rem",
                  borderRadius: "9px",
                  gap: "0.3rem",
                }}
              >
                <PrevIcon size={14} />
                <span>{isEn ? "Previous" : "السابق"}</span>
              </button>
            )}

            {isLast ? (
              <button
                type="button"
                onClick={closeTour}
                style={{
                  background: "#16a34a",
                  color: "#ffffff",
                  padding: "0.42rem 0.85rem",
                  fontSize: "0.82rem",
                  borderRadius: "9px",
                  gap: "0.35rem",
                }}
              >
                <Check size={14} />
                <span>{isEn ? "Done" : "إنهاء"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setStepIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1))
                }
                style={{
                  background: "var(--primary)",
                  color: "#ffffff",
                  padding: "0.42rem 0.85rem",
                  fontSize: "0.82rem",
                  borderRadius: "9px",
                  gap: "0.35rem",
                }}
              >
                <span>{isEn ? "Next" : "التالي"}</span>
                <NextIcon size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
