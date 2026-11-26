"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  Store,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  LayoutDashboard,
  Palette,
  Phone,
  Globe,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { templates, type TemplateId } from "@/lib/theme-templates";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import {
  checkSlugAvailability,
  createStoreAction,
  type SlugCheckResult,
} from "./actions";

const PRESET_KEYS: TemplateId[] = [
  "modern-minimal",
  "luxury-boutique",
  "vibrant-pop",
  "tech-grid",
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function CreateStoreWizard({ userEmail, initialName }: { userEmail: string; initialName: string }) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;

  const [nameAr, setNameAr] = useState(initialName);
  const [nameEn, setNameEn] = useState(initialName);
  const [slug, setSlug] = useState(() => slugify(initialName));
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactPhone, setContactPhone] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [presetKey, setPresetKey] = useState<TemplateId>("modern-minimal");

  const [checkedEntry, setCheckedEntry] = useState<{
    slug: string;
    result: SlugCheckResult;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [created, setCreated] = useState<{ storeId: string; slug: string } | null>(
    null,
  );
  const [submitting, startSubmit] = useTransition();

  const cleanSlug = slug.trim().toLowerCase();
  const slugFormatValid =
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug) &&
    cleanSlug.length >= 3 &&
    cleanSlug.length <= 40;

  // Real-time debounced slug availability check (no synchronous setState in effect body)
  useEffect(() => {
    if (!cleanSlug || !slugFormatValid) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await checkSlugAvailability(cleanSlug);
      if (!cancelled) {
        setCheckedEntry({ slug: cleanSlug, result: res });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cleanSlug, slugFormatValid]);

  const slugStatus: SlugCheckResult | null = !cleanSlug
    ? null
    : !slugFormatValid
      ? { available: false, reason: "invalid" }
      : checkedEntry?.slug === cleanSlug
        ? checkedEntry.result
        : null;
  const checkingSlug =
    Boolean(cleanSlug) && slugFormatValid && checkedEntry?.slug !== cleanSlug;

  const mapErrorCode = (code: string): string => {
    if (code.includes("slug_taken")) {
      return isEn
        ? "This store URL slug is already taken. Try another one."
        : "رابط المتجر هذا مستخدم بالفعل. اختر رابطاً آخر.";
    }
    if (code.includes("reserved_slug")) {
      return isEn
        ? "This URL slug is reserved by the platform. Please pick a different one."
        : "هذا الرابط محجوز للنظام. يرجى اختيار رابط آخر.";
    }
    if (code.includes("invalid_slug")) {
      return isEn
        ? "Slug must be 3–40 lowercase English letters, numbers, or hyphens."
        : "يجب أن يتكون الرابط من 3 إلى 40 حرفاً إنجليزياً صغيراً أو أرقاماً أو شرطات.";
    }
    if (code.includes("invalid_store_name")) {
      return isEn
        ? "Please enter a store name (at least 2 characters)."
        : "يرجى إدخال اسم المتجر (حرفين على الأقل).";
    }
    if (code.includes("auth_required")) {
      return isEn
        ? "Please sign in to create a store."
        : "يرجى تسجيل الدخول أولاً لإنشاء متجر.";
    }
    return isEn
      ? "Could not create your store right now. Please try again."
      : "تعذر إنشاء المتجر حالياً. يرجى المحاولة مرة أخرى.";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    startSubmit(async () => {
      const res = await createStoreAction({
        nameAr,
        nameEn,
        slug,
        presetKey,
        contactPhone,
        currency,
      });
      if (!res.ok) {
        setErrorMsg(mapErrorCode(res.errorCode));
        return;
      }
      setCreated({ storeId: res.storeId, slug: res.slug });
    });
  };

  const previewSlug = slug.trim().toLowerCase() || "your-store";

  if (created) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-4 sm:p-8 bg-slate-50">
        <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6 text-center">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
              <Store size={16} /> {nameEn || nameAr}
            </span>
            <LanguageToggle className="lang-toggle-pill" />
          </div>

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200">
            <CheckCircle2 size={34} />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <Sparkles size={13} />
              {isEn ? "Store Provisioned Live" : "تم إطلاق متجرك بنجاح"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 m-0">
              {isEn
                ? `${nameEn || nameAr} is ready!`
                : `متجر "${nameAr}" جاهز للعمل الآن!`}
            </h1>
            <p className="text-sm text-slate-600">
              {isEn
                ? "Your storefront theme, wallet incentives, and admin dashboard are live and switched as your active store."
                : "تم تجهيز قالب متجرك وإعدادات الشحن والمحفظة وتعيينه تلقائياً كمتجرك النشط في لوحة التحكم."}
            </p>
          </div>

          <div
            dir="ltr"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-700 flex items-center justify-center gap-2"
          >
            <Globe size={15} className="text-slate-400" />
            <span>/s/{created.slug}</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <Link
              href="/admin?onboarding=1"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold hover:bg-slate-800 no-underline"
              style={{ color: "#ffffff" }}
            >
              <LayoutDashboard size={17} />
              <span>
                {isEn ? "Open Store Admin" : "افتح لوحة تحكم متجرك"}
              </span>
            </Link>
            <Link
              href={`/s/${created.slug}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 no-underline"
            >
              <ExternalLink size={17} />
              <span>
                {isEn ? "View Live Storefront" : "معاينة المتجر الحي"}
              </span>
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh py-8 px-4 sm:px-6 bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950 no-underline"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Store size={18} />
            </span>
            <span>{isEn ? "WhiteLabel Commerce" : "منصة المتاجر السحابية"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline" dir="ltr">
              {userEmail}
            </span>
            <LanguageToggle className="lang-toggle-pill" />
            <Link
              href="/admin"
              className="text-sm font-semibold text-slate-700 hover:text-slate-950"
            >
              {isEn ? "Back" : "رجوع"}
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="space-y-2 mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
              <Sparkles size={13} />
              {isEn ? "Instant SaaS Storefront" : "إطلاق فوري خلال ثوانٍ"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 m-0">
              {isEn ? "Create Your Online Store" : "أنشئ متجرك الإلكتروني الآن"}
            </h1>
            <p className="text-sm text-slate-600">
              {isEn
                ? "Launch a dedicated bilingual storefront with your own URL, visual theme preset, checkout, and merchant admin dashboard."
                : "أطلق متجراً مستقلاً بالكامل برابط خاص، قالب تصميم احترافي، سلة ودفع، ولوحة تحكم شاملة لإدارة منتجاتك وطلباتك."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" style={{ marginTop: 0 }}>
            <div className="grid sm:grid-cols-2 gap-4">
              <label>
                <span>{isEn ? "Store Name (Arabic) *" : "اسم المتجر (بالعربية) *"}</span>
                <input
                  name="name_ar"
                  required
                  minLength={2}
                  maxLength={120}
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder={isEn ? "e.g. متجر الأناقة" : "مثال: متجر الأناقة"}
                />
              </label>

              <label>
                <span>{isEn ? "Store Name (English) *" : "اسم المتجر (بالإنجليزية) *"}</span>
                <input
                  name="name_en"
                  dir="ltr"
                  required
                  minLength={2}
                  maxLength={120}
                  value={nameEn}
                  onChange={(e) => {
                    const next = e.target.value;
                    setNameEn(next);
                    if (!slugTouched) {
                      setSlug(slugify(next));
                    }
                  }}
                  placeholder="e.g. Elegance Store"
                />
              </label>
            </div>

            <div className="space-y-2">
              <label>
                <span>{isEn ? "Store URL Slug *" : "رابط المتجر الفريد (Slug) *"}</span>
                <div className="relative">
                  <input
                    name="slug"
                    dir="ltr"
                    required
                    minLength={3}
                    maxLength={40}
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, ""),
                      );
                    }}
                    placeholder="my-awesome-shop"
                  />
                </div>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-slate-600" dir="ltr">
                  <Globe size={14} className="text-slate-400" />
                  <span className="font-mono">
                    .../s/<strong className="text-slate-900">{previewSlug}</strong>
                  </span>
                </div>
                <div className="font-semibold">
                  {checkingSlug ? (
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Loader2 size={13} className="animate-spin" />
                      {isEn ? "Checking..." : "جاري التحقق..."}
                    </span>
                  ) : slugStatus?.available ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 size={14} />
                      {isEn ? "Available" : "الرابط متاح"}
                    </span>
                  ) : slugStatus ? (
                    <span className="inline-flex items-center gap-1 text-rose-700">
                      <XCircle size={14} />
                      {slugStatus.reason === "taken"
                        ? isEn
                          ? "Already taken"
                          : "مستخدم بالفعل"
                        : slugStatus.reason === "reserved"
                          ? isEn
                            ? "Reserved system path"
                            : "رابط محجوز للنظام"
                          : isEn
                            ? "3–40 lowercase letters, numbers, or hyphens"
                            : "3–40 حرفاً إنجليزياً صغيراً أو أرقاماً أو شرطات"}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      {isEn ? "Lowercase letters, numbers, hyphens" : "أحرف إنجليزية صغيرة وأرقام وشرطات"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label>
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={14} />
                  {isEn ? "Contact / WhatsApp Phone" : "رقم التواصل / واتساب المتجر"}
                </span>
                <input
                  name="contact_phone"
                  dir="ltr"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="2010XXXXXXXX"
                />
              </label>

              <label>
                <span>{isEn ? "Store Currency" : "عملة المتجر"}</span>
                <select
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="EGP">
                    {isEn ? "Egyptian Pound (EGP)" : "جنيه مصري (EGP)"}
                  </option>
                  <option value="SAR">
                    {isEn ? "Saudi Riyal (SAR)" : "ريال سعودي (SAR)"}
                  </option>
                  <option value="AED">
                    {isEn ? "UAE Dirham (AED)" : "درهم إماراتي (AED)"}
                  </option>
                  <option value="USD">
                    {isEn ? "US Dollar (USD)" : "دولار أمريكي (USD)"}
                  </option>
                </select>
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Palette size={16} />
                <span>
                  {isEn ? "Choose Starter Theme Preset" : "اختر قالب التصميم المبدئي"}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {PRESET_KEYS.map((key) => {
                  const preset = templates[key];
                  const selected = presetKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPresetKey(key)}
                      style={{
                        width: "100%",
                        display: "block",
                        textAlign: isEn ? "left" : "right",
                        background: selected ? preset.background : "#ffffff",
                        color: "#0f172a",
                        border: selected
                          ? `2px solid ${preset.primary}`
                          : "1px solid #e2e8f0",
                        borderRadius: "14px",
                        padding: "0.95rem",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <strong className="text-sm font-bold">
                          {isEn ? preset.title_en : preset.title}
                        </strong>
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "999px",
                              background: preset.primary,
                              border: "1px solid rgba(0,0,0,0.12)",
                            }}
                          />
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "999px",
                              background: preset.accent,
                              border: "1px solid rgba(0,0,0,0.12)",
                            }}
                          />
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: `${Math.min(preset.radius, 8)}px`,
                              background: preset.surface,
                              border: `1px solid ${preset.line}`,
                            }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed m-0">
                        {isEn ? preset.description_en : preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <small className="text-xs text-slate-500">
                {isEn
                  ? "Starts on Starter Plan (50 products) · Upgradeable anytime."
                  : "يبدأ على الباقة المبدئية (50 منتجاً) · قابل للترقية في أي وقت."}
              </small>
              <button
                type="submit"
                disabled={
                  submitting ||
                  checkingSlug ||
                  (slugStatus !== null && !slugStatus.available)
                }
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>{isEn ? "Creating Store..." : "جاري إنشاء المتجر..."}</span>
                  </>
                ) : (
                  <>
                    <span>{isEn ? "Launch My Store" : "إطلاق متجري الآن"}</span>
                    <ArrowIcon size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
