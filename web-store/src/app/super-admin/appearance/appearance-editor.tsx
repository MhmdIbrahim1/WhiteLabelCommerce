"use client";

import Link from "next/link";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Eye, RotateCcw } from "lucide-react";
import { LanguageToggle } from "@/components/language-provider";
import { PlatformBrand } from "@/components/platform-brand";
import { langDir, type Lang } from "@/lib/i18n";
import { applyPreset, copyLimits, defaultTheme, fontPairs, parsePlatformTheme, presetOptions, presets,
  radii, resolveTheme, type PlatformTheme } from "@/lib/platform-theme";
import { accentContrast, isAccentColor } from "@/lib/theme-contrast";

const fields = Object.keys(copyLimits) as (keyof typeof copyLimits)[];
const fontNames = { ibm_plex: "IBM Plex Sans Arabic + DM Sans", alexandria: "Alexandria", readex: "Readex Pro" };
type Status = "idle" | "saving" | "saved" | "conflict" | "denied" | "error";

export function AppearanceEditor({ initial, lang }: { initial: PlatformTheme; lang: Lang }) {
  const en = lang === "en";
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const busy = status === "saving";
  const dirty = (Object.keys(saved) as (keyof PlatformTheme)[]).some(key => saved[key] !== draft[key]);
  const contrast = accentContrast(draft.accent_color);
  const validColor = isAccentColor(draft.accent_color);
  const messages: Record<Status, string> = {
    idle: "", saving: en ? "Publishing…" : "جارٍ النشر…", saved: en ? "Appearance published." : "نُشرت التغييرات.",
    conflict: en ? "Another admin published changes. Load the current version before publishing." : "نشر مسؤول آخر تغييرات. حمّل النسخة المنشورة قبل المتابعة.",
    denied: en ? "Publishing requires a signed-in platform administrator." : "يتطلب النشر تسجيل الدخول بحساب مسؤول المنصة.",
    error: en ? "Publishing failed. Your edits are still here." : "تعذّر النشر. تعديلاتك محفوظة في هذه الصفحة.",
  };

  function edit(patch: Partial<PlatformTheme>) {
    setDraft(current => ({ ...current, ...patch }));
    if (status !== "conflict") setStatus("idle");
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || status === "conflict" || !parsePlatformTheme(draft)) return;
    setStatus("saving");
    try {
      const response = await fetch("/api/admin/platform-appearance", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      });
      if (!response.ok) {
        setStatus(response.status === 409 ? "conflict" : [401, 403].includes(response.status) ? "denied" : "error");
        return;
      }
      const published = parsePlatformTheme(await response.json());
      if (!published) throw new Error("Invalid published theme");
      setSaved(published);
      setDraft(published);
      setStatus("saved");
    } catch { setStatus("error"); }
  }

  return <main className="pt-shell appearance" lang={lang} dir={langDir(lang)} style={resolveTheme(defaultTheme) as CSSProperties}>
    <div className="appearance-wrap">
      <nav className="appearance-nav">
        <Link href="/super-admin"><ArrowLeft className="pt-directional" size={17} />{en ? "Platform controls" : "إدارة المنصة"}</Link>
        <LanguageToggle className="pt-lang" />
      </nav>
      <h1>{en ? "Platform Appearance" : "مظهر المنصة"}</h1>
      <p>{en ? "Set the identity and launch experience on your platform homepage." : "اختر هوية الصفحة الرئيسية للمنصة وكيف يبدأ التاجر منها."}</p>
      <div className="appearance-grid">
        <form onSubmit={publish}>
          <fieldset disabled={busy}>
            <legend>{en ? "Theme preset" : "قالب المظهر"}</legend>
            <div className="appearance-presets">
              {presets.map(id => {
                const p = presetOptions[id];
                return <button type="button" key={id} aria-pressed={draft.preset === id}
                  onClick={() => edit(applyPreset(draft, id))}>
                  <span aria-hidden="true" className="appearance-palette" style={{ background: p.surface }}>
                    {[p.ink, p.card, p.accent_color].map((color, i) => <i key={i} style={{ background: color }} />)}
                  </span>
                  <span lang="en">{p.label}</span>{draft.preset === id && <Check size={14} />}
                </button>;
              })}
            </div>
            <div className="appearance-fields">
              <div className="appearance-accent">
                <label htmlFor="hex">{en ? "Accent color" : "لون التمييز"}</label>
                <div><input type="color" aria-label={en ? "Choose accent color" : "اختيار لون التمييز"} value={contrast.accent}
                  onChange={e => edit({ accent_color: e.target.value.toUpperCase() })} />
                  <input id="hex" dir="ltr" value={draft.accent_color} pattern="#[0-9a-fA-F]{6}" required maxLength={7}
                    aria-invalid={!validColor} aria-describedby={validColor ? undefined : "accent-error"}
                    onChange={e => edit({ accent_color: e.target.value.toUpperCase() })} /></div>
                {!validColor && <small id="accent-error">{en ? "Enter a six-digit hex color, such as " : "اكتب لوناً سداسياً مثل "}<bdi dir="ltr">#93472E</bdi></small>}
              </div>
              <label>{en ? "Corner radius" : "استدارة الزوايا"}
                <select value={draft.radius_scale} onChange={e => edit({ radius_scale: e.target.value as PlatformTheme["radius_scale"] })}>
                  {radii.map((r, i) => <option key={r} value={r}>{(en ? ["Sharp", "Balanced", "Soft"] : ["حادّة", "متوازنة", "ناعمة"])[i]}</option>)}
                </select>
              </label>
              <label className="appearance-wide">{en ? "Font pair" : "الخطوط"}
                <select value={draft.font_pair} onChange={e => edit({ font_pair: e.target.value as PlatformTheme["font_pair"] })}>
                  {fontPairs.map(f => <option key={f} value={f}>{fontNames[f]}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>{en ? "Hero copy" : "نص الواجهة الرئيسية"}</legend>
            <div className="appearance-fields">
              {fields.map(key => {
                const ar = key.endsWith("_ar");
                const title = key.startsWith("hero_title");
                const label = en ? (title ? "Headline" : "Description") : (title ? "العنوان" : "الوصف");
                return <label key={key}>{label} · {ar ? "العربية" : "English"}
                  <textarea lang={ar ? "ar" : "en"} dir={ar ? "rtl" : "ltr"} rows={title ? 2 : 4}
                    required maxLength={copyLimits[key]} value={draft[key]} onChange={e => edit({ [key]: e.target.value })} />
                </label>;
              })}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>{en ? "Homepage behavior" : "تفاعل الصفحة"}</legend>
            <label className="appearance-toggle"><span>{en ? "Float the start dock while scrolling" : "إظهار شريط البدء العائم عند التمرير"}</span>
              <input type="checkbox" role="switch" checked={draft.sticky_cta_enabled} onChange={e => edit({ sticky_cta_enabled: e.target.checked })} /></label>
            <label className="appearance-toggle"><span>{en ? "Animate the mosaic and previews" : "تحريك صور الواجهة ومعاينات المتاجر"}</span>
              <input type="checkbox" role="switch" checked={draft.motion_enabled} onChange={e => edit({ motion_enabled: e.target.checked })} /></label>
          </fieldset>
          <div className="appearance-actions">
            <button className="pt-action" type="submit" disabled={busy || !dirty || !parsePlatformTheme(draft) || status === "conflict"}>
              {busy ? messages.saving : en ? "Publish appearance" : "نشر المظهر"}
            </button>
            <button className="appearance-plain" type="button" disabled={busy}
              onClick={() => edit({ ...defaultTheme, revision: saved.revision })}><RotateCcw size={15} />
              {en ? "Reset to defaults" : "استعادة الإعدادات الافتراضية"}</button>
          </div>
          <div role="status" className="appearance-status">{messages[status]}
            {status === "conflict" && <button type="button" className="appearance-plain" onClick={() => router.refresh()}>
              {en ? "Load published version" : "تحميل النسخة المنشورة"}</button>}
          </div>
        </form>
        <aside className="appearance-preview" aria-label={en ? "Theme preview" : "معاينة المظهر"}>
          <header><Eye size={17} />{en ? "Live preview" : "معاينة مباشرة"}</header>
          <div className="appearance-sample" style={resolveTheme(draft) as CSSProperties}>
            <PlatformBrand />
            <h2>{draft[en ? "hero_title_en" : "hero_title_ar"]}</h2>
            <p>{draft[en ? "hero_subtitle_en" : "hero_subtitle_ar"]}</p>
            <span className="pt-action">{en ? "Start free" : "ابدأ مجاناً"}<ArrowRight className="pt-directional" size={15} /></span>
          </div>
          {validColor && <div className="appearance-contrast" aria-live="polite">
            <span style={{ color: contrast.foreground, background: contrast.background }}><Check size={14} />
              <bdi dir="ltr">WCAG AA · {contrast.ratio.toFixed(2)}:1</bdi></span>
            {contrast.background !== contrast.accent && <small>{en ? "Accessible button fill" : "لون الزر المحسّن للقراءة"} <bdi dir="ltr">{contrast.background}</bdi></small>}
          </div>}
        </aside>
      </div>
    </div>
  </main>;
}
