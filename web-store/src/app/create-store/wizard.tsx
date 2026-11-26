"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  Store,
  CheckCircle2,
  Loader2,
  ExternalLink,
  LayoutDashboard,
  Globe,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { templates, type TemplateId } from "@/lib/theme-templates";
import { useLanguage } from "@/components/language-provider";
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

export function CreateStoreWizard({ initialName }: { initialName: string }) {
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
      const res = await checkSlugAvailability(cleanSlug).catch((): SlugCheckResult => ({ available: false, reason: "error" }));
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
      }).catch(() => ({ ok: false as const, errorCode: "unavailable" }));
      if (!res.ok) {
        setErrorMsg(mapErrorCode(res.errorCode));
        return;
      }
      setCreated({ storeId: res.storeId, slug: res.slug });
    });
  };

  const previewSlug = slug.trim().toLowerCase() || "your-store";

  if (created) return <div className="ws-onboard-success">
    <CheckCircle2 size={32} /><h1>{isEn ? "Your store is ready" : "متجرك جاهز"}</h1>
    <p>{isEn ? "You can now manage " : "يمكنك الآن إدارة "}<b dir="auto">{isEn ? nameEn || nameAr : nameAr}</b>
      {isEn ? " from your workspace." : " من لوحة المتجر."}</p>
    <p className="ws-address"><Globe size={16} /><bdi dir="ltr">/s/{created.slug}</bdi></p>
    <div className="ws-actions"><Link className="pt-action" href="/admin?onboarding=1"><LayoutDashboard size={16} />{isEn ? "Open workspace" : "افتح لوحة المتجر"}</Link>
      <Link className="ws-text-link" href={"/s/" + created.slug}>{isEn ? "View storefront" : "تصفّح المتجر"} <ExternalLink size={15} /></Link></div>
  </div>;

  const slugMessage = checkingSlug ? (isEn ? "Checking availability…" : "جارٍ التحقق من التوفّر…")
    : slugStatus?.available ? (isEn ? "Available" : "الرابط متاح")
    : slugStatus?.reason === "taken" ? (isEn ? "This address is taken." : "هذا الرابط مستخدم.")
    : slugStatus?.reason === "reserved" ? (isEn ? "This address is reserved." : "هذا الرابط محجوز.")
    : slugStatus?.reason === "error" ? (isEn ? "Couldn’t check this address. Try editing it again." : "تعذّر التحقق من الرابط. جرّب تعديله.")
    : (isEn ? "Use 3–40 lowercase letters, numbers or hyphens." : "استخدم من ٣ إلى ٤٠ حرفاً إنجليزياً صغيراً أو رقماً أو شرطة.");

  return <>
    <h1>{isEn ? "Create your store" : "أنشئ متجرك"}</h1>
    <p>{isEn ? "Choose a name, an address and a starting look for your storefront." : "اختر اسم متجرك ورابطه والتصميم الذي تبدأ به."}</p>
    <form className="ws-wizard" onSubmit={handleSubmit}>
      <div className="ws-field-grid">
        <label>{isEn ? "Store name in Arabic" : "اسم المتجر بالعربية"}<input name="name_ar" lang="ar" dir="auto" required minLength={2} maxLength={120}
          value={nameAr} onChange={e => setNameAr(e.target.value)} /></label>
        <label>{isEn ? "Store name in English" : "اسم المتجر بالإنجليزية"}<input name="name_en" lang="en" dir="ltr" required minLength={2} maxLength={120}
          value={nameEn} onChange={e => { setNameEn(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} /></label>
      </div>
      <label>{isEn ? "Store address" : "رابط المتجر"}
        <input name="slug" dir="ltr" required minLength={3} maxLength={40} value={slug} aria-describedby="slug-help"
          aria-invalid={Boolean(slugStatus && !slugStatus.available)} placeholder="my-store"
          onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} /></label>
      <div className="ws-slug-help" id="slug-help"><span className="ws-inline"><Globe size={14}/><bdi dir="ltr">/s/{previewSlug}</bdi></span>
        <span role="status">{slugMessage}</span></div>
      <div className="ws-field-grid">
        <label>{isEn ? "Contact phone / WhatsApp" : "رقم التواصل أو واتساب"}<input name="contact_phone" type="tel" dir="ltr"
          value={contactPhone} autoComplete="tel" onChange={e => setContactPhone(e.target.value)} placeholder="2010XXXXXXXX" /></label>
        <label>{isEn ? "Store currency" : "عملة المتجر"}<select name="currency" value={currency} onChange={e => setCurrency(e.target.value)}>
          {["EGP","SAR","AED","USD"].map((code, i) => <option key={code} value={code}>
            {(isEn ? ["Egyptian pound","Saudi riyal","UAE dirham","US dollar"] : ["جنيه مصري","ريال سعودي","درهم إماراتي","دولار أمريكي"])[i]} ({code})</option>)}
        </select></label>
      </div>
      <fieldset className="ws-presets"><legend>{isEn ? "Storefront design" : "تصميم المتجر"}</legend><div>
        {PRESET_KEYS.map(key => { const preset = templates[key];
          return <label key={key}><input type="radio" name="preset" value={key} checked={key === presetKey} onChange={() => setPresetKey(key)}/>
            <span className="ws-template"><span className="ws-template-colors" aria-hidden="true">
              {[preset.primary, preset.accent, preset.surface].map(c => <i key={c} style={{ background: c }} />)}</span>
              <strong>{isEn ? preset.title_en : preset.title}</strong><small>{isEn ? preset.description_en : preset.description}</small></span>
          </label>;
        })}
      </div></fieldset>
      {errorMsg && <p role="alert" className="ws-feedback ws-error">{errorMsg}</p>}
      <div className="ws-actions"><button type="submit" className="pt-action" disabled={submitting || checkingSlug || (slugStatus !== null && !slugStatus.available)}>
        {submitting ? <Loader2 size={16} /> : <Store size={16} />}{submitting ? (isEn ? "Creating store…" : "جارٍ إنشاء المتجر…") : (isEn ? "Create store" : "إنشاء المتجر")}<ArrowIcon size={16}/>
      </button><Link className="ws-text-link" href="/admin">{isEn ? "Back to workspace" : "العودة إلى لوحة المتجر"}</Link></div>
    </form>
  </>;
}
