"use client";

import { showToast } from "@/components/floating-toast";
import Link from "next/link";
import { useState } from "react";
import {
  Rocket,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  X,
  PartyPopper,
  Sparkles,
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
      auto: true,
      icon: Boxes,
      title: isEn ? "Add your first product" : "أضف أول منتج",
      desc: isEn
        ? productsCount > 0
          ? `${productsCount} product(s) added to your catalog.`
          : "Create a category and publish your first product with photos and stock."
        : productsCount > 0
          ? `تمت إضافة ${productsCount} منتج إلى متجرك بنجاح.`
          : "أنشئ قسماً وأضف أول منتج بالصور والأسعار والمخزون.",
      href: "/admin/products",
      cta: isEn ? "Manage Products" : "إدارة المنتجات",
    },
    {
      id: "customizer",
      done: state.customizerDone,
      auto: false,
      toggleKey: "customizerDone" as const,
      icon: Palette,
      title: isEn
        ? "Customize store theme & banners"
        : "خصّص هوية وبانرات متجرك",
      desc: isEn
        ? "Tailor colors, layout presets, and hero promo slides for Web & Android."
        : "عدّل الألوان والقوالب وشرائح البانر الترويجية للموقع وتطبيق الأندرويد.",
      href: "/admin/customizer",
      cta: isEn ? "Open Customizer" : "افتح استوديو التصميم",
    },
    {
      id: "settings",
      done: state.settingsDone,
      auto: false,
      toggleKey: "settingsDone" as const,
      icon: Settings,
      title: isEn
        ? "Configure shipping, cashback & payments"
        : "اضبط الشحن والكاش باك والدفع",
      desc: isEn
        ? "Set shipping fee, free-shipping progress bar, cashback %, and COD/Paymob."
        : "حدد رسوم الشحن، شريط الشحن المجاني، نسبة الكاش باك، وخيارات الدفع.",
      href: "/admin/settings",
      cta: isEn ? "Store Settings" : "إعدادات المتجر",
    },
    {
      id: "coupon",
      done: couponsCount > 0,
      auto: true,
      icon: TicketPercent,
      title: isEn ? "Create your first promo coupon" : "أنشئ أول كود خصم",
      desc: isEn
        ? couponsCount > 0
          ? `${couponsCount} promo coupon(s) configured.`
          : "Boost conversion with a welcome percentage or fixed discount code."
        : couponsCount > 0
          ? `لديك ${couponsCount} كود خصم مفعّل في متجرك.`
          : "ارفع المبيعات بإنشاء كود خصم ترحيبي بنسبة مئوية أو مبلغ ثابت.",
      href: "/admin/coupons",
      cta: isEn ? "Create Coupon" : "إنشاء كوبون",
    },
    {
      id: "share",
      done: state.sharedDone,
      auto: false,
      toggleKey: "sharedDone" as const,
      icon: Share2,
      title: isEn ? "Share your live storefront" : "انسخ وشارك رابط متجرك الحي",
      desc: isEn
        ? `Copy your storefront link (${storefrontUrl}) and share it with customers.`
        : `انسخ رابط متجرك المباشر (${storefrontUrl}) وشاركه مع عملائك الآن.`,
      href: storefrontUrl,
      cta: isEn ? "Open Storefront" : "معاينة المتجر",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const totalSteps = steps.length;
  const percent = Math.round((completedCount / totalSteps) * 100);
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

  return (
    <section
      aria-label={isEn ? "Store Launch Checklist" : "دليل إطلاق متجرك"}
      className="card"
      style={{
        marginBottom: "1.25rem",
        border: allDone
          ? "1px solid #86efac"
          : "1px solid color-mix(in srgb, var(--primary) 22%, var(--line))",
        background: allDone
          ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 75%)"
          : "linear-gradient(135deg, color-mix(in srgb, var(--primary) 5%, #ffffff) 0%, #ffffff 70%)",
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: "12px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: allDone ? "#16a34a" : "var(--primary)",
              color: "#ffffff",
            }}
          >
            {allDone ? <PartyPopper size={20} /> : <Rocket size={20} />}
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.08rem" }}>
                {isEn ? "Store Launch Checklist" : "دليل إطلاق متجرك"}
              </h2>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "0.18rem 0.6rem",
                  borderRadius: "999px",
                  background: allDone
                    ? "#dcfce7"
                    : "color-mix(in srgb, var(--primary) 12%, transparent)",
                  color: allDone ? "#15803d" : "var(--primary)",
                }}
              >
                {isEn
                  ? `${completedCount} / ${totalSteps} completed`
                  : `${completedCount} / ${totalSteps} مكتمل`}
              </span>
            </div>
            <p
              style={{
                margin: "0.15rem 0 0",
                fontSize: "0.84rem",
                color: "var(--muted)",
              }}
            >
              {allDone
                ? isEn
                  ? `${storeTitle} is 100% ready for customers!`
                  : `متجرك "${storeTitle}" جاهز تماماً لاستقبال الطلبات!`
                : isEn
                  ? `Complete these quick steps to launch ${storeTitle}.`
                  : `أكمل هذه الخطوات السريعة لإطلاق "${storeTitle}" بأفضل شكل.`}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <button
            type="button"
            onClick={() => triggerAdminGuidedTour(storeId)}
            style={{
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              padding: "0.38rem 0.72rem",
              fontSize: "0.78rem",
              borderRadius: "9px",
              gap: "0.35rem",
            }}
          >
            <HelpCircle size={14} />
            <span>{isEn ? "Quick Tour" : "جولة سريعة"}</span>
          </button>

          <button
            type="button"
            aria-label={
              state.checklistCollapsed
                ? isEn
                  ? "Expand checklist"
                  : "توسيع الدليل"
                : isEn
                  ? "Collapse checklist"
                  : "طي الدليل"
            }
            onClick={() =>
              updateStoreOnboarding(storeId, {
                checklistCollapsed: !state.checklistCollapsed,
              })
            }
            style={{
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              padding: "0.38rem 0.55rem",
              borderRadius: "9px",
            }}
          >
            {state.checklistCollapsed ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronUp size={16} />
            )}
          </button>

          <button
            type="button"
            aria-label={isEn ? "Dismiss checklist" : "إخفاء الدليل"}
            title={isEn ? "Dismiss checklist" : "إخفاء الدليل"}
            onClick={() =>
              updateStoreOnboarding(storeId, { checklistDismissed: true })
            }
            style={{
              background: "transparent",
              color: "var(--muted)",
              border: "1px solid transparent",
              padding: "0.38rem",
              borderRadius: "9px",
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Live Progress Bar */}
      <div
        style={{
          marginTop: "0.85rem",
          height: 8,
          width: "100%",
          borderRadius: "999px",
          background: "#e2e8f0",
          overflow: "hidden",
        }}
        role="progressbar"
        aria-valuenow={completedCount}
        aria-valuemin={0}
        aria-valuemax={totalSteps}
      >
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            borderRadius: "999px",
            background: allDone
              ? "linear-gradient(90deg, #16a34a, #10b981)"
              : "linear-gradient(90deg, var(--primary), var(--secondary))",
            transition: "width 320ms ease",
          }}
        />
      </div>

      {/* Celebration Banner when 5/5 */}
      {allDone && !state.checklistCollapsed && (
        <div
          style={{
            marginTop: "0.9rem",
            padding: "0.85rem 1rem",
            borderRadius: "12px",
            background: "#dcfce7",
            border: "1px solid #86efac",
            color: "#14532d",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            fontSize: "0.88rem",
            fontWeight: 600,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <Sparkles size={17} />
            {isEn
              ? "All 5 launch steps completed! Your storefront is live and ready to grow."
              : "رائع! أكملت جميع خطوات الإطلاق الخمس بنجاح، ومتجرك جاهز للنمو والمبيعات."}
          </span>
          <button
            type="button"
            onClick={() =>
              updateStoreOnboarding(storeId, { checklistDismissed: true })
            }
            style={{
              background: "#15803d",
              color: "#ffffff",
              padding: "0.38rem 0.78rem",
              fontSize: "0.78rem",
              borderRadius: "8px",
            }}
          >
            {isEn ? "Hide Checklist" : "إخفاء الدليل"}
          </button>
        </div>
      )}

      {/* Checklist Items */}
      {!state.checklistCollapsed && (
        <div
          style={{
            display: "grid",
            gap: "0.6rem",
            marginTop: "0.95rem",
          }}
        >
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  padding: "0.75rem 0.9rem",
                  borderRadius: "12px",
                  border: step.done
                    ? "1px solid #bbf7d0"
                    : "1px solid var(--line)",
                  background: step.done ? "#f0fdf4" : "var(--surface)",
                  transition: "border-color 180ms ease, background 180ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.7rem",
                    flex: "1 1 260px",
                    minWidth: 0,
                  }}
                >
                  {step.auto ? (
                    <span
                      style={{
                        marginTop: "0.15rem",
                        color: step.done ? "#16a34a" : "#94a3b8",
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    >
                      {step.done ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <Circle size={20} />
                      )}
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={
                        step.done
                          ? isEn
                            ? `Mark "${step.title}" incomplete`
                            : `تحديد "${step.title}" كغير مكتمل`
                          : isEn
                            ? `Mark "${step.title}" complete`
                            : `تحديد "${step.title}" كمكتمل`
                      }
                      onClick={() => {
                        if (step.toggleKey) {
                          markOnboardingStepDone(storeId, step.toggleKey, !step.done);
                        }
                      }}
                      style={{
                        background: "transparent",
                        color: step.done ? "#16a34a" : "#94a3b8",
                        padding: 0,
                        marginTop: "0.15rem",
                        borderRadius: "999px",
                        flexShrink: 0,
                      }}
                    >
                      {step.done ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <Circle size={20} />
                      )}
                    </button>
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        fontWeight: 700,
                        fontSize: "0.92rem",
                        color: step.done ? "#166534" : "var(--ink)",
                        textDecoration: step.done ? "line-through" : "none",
                      }}
                    >
                      <Icon size={15} style={{ flexShrink: 0, opacity: 0.75 }} />
                      <span>{step.title}</span>
                    </div>
                    <p
                      style={{
                        margin: "0.15rem 0 0",
                        fontSize: "0.8rem",
                        color: "var(--muted)",
                      }}
                    >
                      {step.desc}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    flexWrap: "wrap",
                  }}
                >
                  {step.id === "share" ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        style={{
                          padding: "0.42rem 0.78rem",
                          fontSize: "0.8rem",
                          borderRadius: "9px",
                          gap: "0.35rem",
                          background: copied ? "#16a34a" : "var(--primary)",
                          color: "#ffffff",
                        }}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        <span>
                          {copied
                            ? isEn
                              ? "Link Copied!"
                              : "تم نسخ الرابط!"
                            : isEn
                              ? "Copy Link"
                              : "نسخ الرابط"}
                        </span>
                      </button>
                      <Link
                        href={storefrontUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() =>
                          markOnboardingStepDone(storeId, "sharedDone", true)
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.42rem 0.75rem",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          borderRadius: "9px",
                          border: "1px solid var(--line)",
                          background: "var(--surface)",
                          color: "var(--ink)",
                          textDecoration: "none",
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>{step.cta}</span>
                      </Link>
                    </>
                  ) : (
                    <Link
                      href={step.href}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        padding: "0.42rem 0.78rem",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        borderRadius: "9px",
                        border: step.done
                          ? "1px solid #bbf7d0"
                          : "1px solid var(--line)",
                        background: step.done ? "#ffffff" : "var(--primary)",
                        color: step.done ? "#166534" : "#ffffff",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span>{step.cta}</span>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
