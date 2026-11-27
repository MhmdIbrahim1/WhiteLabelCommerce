"use client";

import { useId, useState, useTransition } from "react";
import { Check, CircleCheck, CircleDot, Eye, RotateCcw, Save, SlidersHorizontal, Store, Undo2 } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { showToast } from "@/components/floating-toast";
import { storefrontPresets, type StorefrontPreset } from "@/lib/storefront-presets";
import { presetDraft, sameStudioDraft, studioColors, type StudioColor, type StudioDraft } from "@/lib/storefront-studio";
import { storefrontButton, storefrontFonts, type StorefrontGates } from "@/lib/storefront-theme";
import { accentContrast, isAccentColor } from "@/lib/theme-contrast";
import { CARD_RATIOS, GRID_COLUMNS, HERO_LAYOUTS, MOTION_INTENSITIES, STOREFRONT_FONTS, type TemplateId } from "@/lib/ui-config";
import { markOnboardingStepDone } from "../onboarding-store";
import { publishStudio } from "./actions";
import { PreviewStage, Segment } from "./preview-frame";
import "./customizer.css";

const sectors = {
  fashion_editorial: { en: ["Fashion editorial", "Portrait frames and fine serif headlines."], ar: ["أناقة الأزياء", "صور طولية وعناوين بطابع تحريري."] },
  tech_precision: { en: ["Tech precision", "Square images and a compact technical grid."], ar: ["دقّة التقنية", "صور مربعة وشبكة متقاربة تعرض المواصفات."] },
  beauty_maison: { en: ["Beauty maison", "Soft curves and a warm rose palette."], ar: ["دار الجمال", "زوايا ناعمة وألوان وردية دافئة."] },
  gourmet_craft: { en: ["Gourmet craft", "Wide frames and earthy market tones."], ar: ["سوق الذوّاقة", "صور عريضة وألوان ترابية من السوق."] },
  commerce_signature: { en: ["Commerce signature", "Balanced proportions and clean type."], ar: ["توقيع المتجر", "نسب متوازنة وخطوط واضحة."] },
} satisfies Record<StorefrontPreset, { en: string[]; ar: string[] }>;

const colorLabels = {
  primaryButtonBg: ["Primary action", "زر الإجراء الرئيسي"], accentBadge: ["Accent and badges", "اللون المميز والشارات"],
  pageBg: ["Page background", "خلفية الصفحة"], cardSurface: ["Card surface", "سطح البطاقة"], heroBg: ["Hero background", "خلفية الواجهة الرئيسية"],
};
const fontLabels = { preset: ["Preset pairing", "خطوط القالب"], ibm_plex: ["DM Sans + IBM Plex Sans Arabic", "دي إم سانس وآي بي إم بلكس العربي"],
  alexandria: ["Alexandria", "الإسكندرية"], readex: ["Readex Pro", "ريدكس برو"] };
const layoutLabels = { split: ["Split", "مقسّم"], "full-bleed": ["Full image", "صورة ممتدة"], bento: ["Tiled", "مربعات"] };
const motionLabels = { none: ["Off", "متوقفة"], subtle: ["Subtle", "خفيفة"], smooth: ["Smooth", "انسيابية"], bouncy: ["Spring", "مرنة"] };

function ColorField({ label, value, invalid, change, en }: {
  label: string; value: string; invalid?: string; change: (text: string) => void; en: boolean;
}) {
  const id = useId();
  return <div className="studio-color-field">
    <label htmlFor={id}>{label}</label>
    <div className="studio-color-input">
      <input type="color" value={value} aria-label={label + (en ? " color picker" : "، منتقي اللون")} onChange={e => change(e.target.value)}/>
      <bdi dir="ltr" className="tabular-nums"><input id={id} type="text" dir="ltr" spellCheck={false} autoComplete="off"
        value={invalid ?? value} aria-invalid={invalid !== undefined} aria-describedby={invalid !== undefined ? id + "-error" : undefined}
        onChange={e => change(e.target.value)}/></bdi>
    </div>
    {invalid !== undefined && <small id={id + "-error"} className="studio-error">
      {en ? "Enter a six-digit hex color, such as " : "أدخل لوناً سداسياً من ست خانات، مثل "}<bdi dir="ltr" className="tabular-nums">#284A42</bdi>
    </small>}
  </div>;
}

export function CustomizerStudio({ storeId, slug, storeName, liveUrl, initial, template, gates, hasHero, productId }: {
  storeId: string; slug: string; storeName: string; liveUrl: string; initial: StudioDraft; template: TemplateId;
  gates: StorefrontGates; hasHero: boolean; productId: string | null;
}) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const copy = (english: string, arabic: string) => en ? english : arabic;
  const index = en ? 0 : 1;
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [invalid, setInvalid] = useState<Partial<Record<StudioColor, string>>>({});
  const [panel, setPanel] = useState<"inspector" | "preview">("inspector");
  const [conflict, setConflict] = useState(false);
  const [pending, startTransition] = useTransition();
  const hasErrors = Object.keys(invalid).length > 0;
  const dirty = hasErrors || !sameStudioDraft(saved, draft);
  const defaults = presetDraft(draft.storefrontPreset, template);
  const fill = storefrontButton(draft);

  function set<K extends keyof StudioDraft>(key: K, value: StudioDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
  }
  function load(next: StudioDraft) {
    setDraft(next);
    setInvalid({});
  }
  function setColor(key: StudioColor, text: string) {
    if (!isAccentColor(text)) { setInvalid(current => ({ ...current, [key]: text })); return; }
    setInvalid(current => { const next = { ...current }; delete next[key]; return next; });
    set(key, text.toUpperCase());
  }
  function publish() {
    if (pending || !dirty || hasErrors || conflict) return;
    startTransition(async () => {
      try {
        const result = await publishStudio(slug, saved, draft);
        if (result.ok) {
          setSaved(result.draft);
          load(result.draft);
          markOnboardingStepDone(storeId, "customizerDone", true);
          showToast({ kind: "success", message: copy("Design published to your storefront.", "تم نشر التصميم على واجهة متجرك.") });
          return;
        }
        const stale = result.error === "conflict" || result.error === "store_changed";
        setConflict(stale);
        showToast({ kind: "error", message: stale
          ? copy("The store or its published design changed. Reload to continue.", "تغيّر المتجر أو تصميمه المنشور. أعد التحميل للمتابعة.")
          : copy("The design could not be published. Your draft is still here.", "تعذر نشر التصميم. ما زالت مسودتك محفوظة هنا.") });
      } catch {
        showToast({ kind: "error", message: copy("Publishing failed. Check your connection and try again.", "تعذر النشر. تحقق من الاتصال وأعد المحاولة.") });
      }
    });
  }
  return <div className="studio" data-panel={panel}>
    <header className="studio-toolbar">
      <div className="studio-identity"><h1>{copy("Live preview studio", "استوديو المعاينة المباشرة")}</h1>
        <div><span className="studio-store"><Store size={14}/><span dir="auto">{storeName}</span></span>
          <span role="status" className="studio-status" data-dirty={dirty}>{dirty ? <CircleDot size={14}/> : <CircleCheck size={14}/>}
            {dirty ? copy("Unsaved changes", "تغييرات غير محفوظة") : copy("Published", "منشور")}</span></div>
      </div>
      <div className="studio-actions">
        <button type="button" disabled={pending || (!hasErrors && sameStudioDraft(draft, defaults))} onClick={() => load(defaults)}>
          <RotateCcw/>{copy("Reset to preset defaults", "استعادة إعدادات القالب")}</button>
        <button type="button" disabled={pending || !dirty} onClick={() => load(saved)}><Undo2 className="studio-directional"/>{copy("Discard", "تجاهل")}</button>
        <button type="submit" form="studio-inspector" className="studio-publish" disabled={pending || !dirty || hasErrors || conflict}><Save/>
          {pending ? copy("Publishing…", "جارٍ النشر…") : copy("Save & publish", "حفظ ونشر")}</button>
      </div>
    </header>
    {conflict && <div className="studio-conflict" role="alert">
      {copy("Reload the current store and its published design before editing again.", "أعد تحميل المتجر الحالي وتصميمه المنشور قبل متابعة التعديل.")}
      <button type="button" onClick={() => window.location.reload()}>{copy("Reload published design", "تحميل التصميم المنشور")}</button>
    </div>}
    <div className="studio-tabs"><Segment label={copy("Studio view", "عرض الاستوديو")}>
      <button type="button" aria-pressed={panel === "inspector"} aria-controls="studio-inspector" onClick={() => setPanel("inspector")}><SlidersHorizontal/>{copy("Customize", "تخصيص")}</button>
      <button type="button" aria-pressed={panel === "preview"} aria-controls="studio-preview" onClick={() => setPanel("preview")}><Eye/>{copy("Live preview", "معاينة مباشرة")}</button>
    </Segment></div>
    <div className="studio-panes">
      <form className="studio-inspector" id="studio-inspector" aria-label={copy("Customize the storefront", "تخصيص واجهة المتجر")}
        onSubmit={event => { event.preventDefault(); publish(); }}>
        <fieldset disabled={pending} className="studio-controls">
          <fieldset className="studio-presets"><legend>{copy("Sector presets", "قوالب القطاعات")}</legend>
            {(Object.keys(sectors) as StorefrontPreset[]).map(key => {
              const p = storefrontPresets[key];
              const selected = key === draft.storefrontPreset;
              const [name, description] = sectors[key][lang];
              const colors = selected ? [draft.pageBg, draft.cardSurface, draft.accentBadge, draft.primaryButtonBg] : [p.page, p.panel, p.accent, p.action];
              const swatch = accentContrast(colors[0]);
              return <label className="studio-preset" key={key}>
                <input type="radio" name="sector" value={key} checked={selected} onChange={() => load(presetDraft(key, template))}/>
                <span className="studio-sample" aria-hidden="true" style={{ backgroundColor: swatch.background, color: swatch.foreground }}>
                  <span style={{ fontFamily: selected && draft.fontPair !== "preset" ? storefrontFonts[draft.fontPair] : p.display, fontWeight: p.weight }}>{copy("Aa", "أب")}</span>
                  <span className="studio-chips">{colors.map((color, i) => <i key={i} style={{ backgroundColor: color }}/>)}</span>
                </span>
                <span className="studio-preset-copy"><strong>{name}</strong><small>{description}</small></span>
                <span className="studio-check" aria-hidden="true">{selected && <Check size={14}/>}</span>
              </label>;
            })}
          </fieldset>
          <details open><summary>{copy("Brand palette", "ألوان الهوية")}</summary><div className="studio-fields">
            {studioColors.map(key => <ColorField key={key} label={colorLabels[key][index]} value={draft[key]} invalid={invalid[key]} en={en}
              change={text => setColor(key, text)}/>)}
            <div className="studio-contrast"><span style={{ background: fill.background, color: fill.foreground }}>{copy("Action label", "نص الزر")}</span>
              <small>{copy("Button contrast", "تباين الزر")} <bdi dir="ltr" className="tabular-nums">{fill.ratio.toFixed(2)}∶1</bdi></small></div>
          </div></details>
          <details open><summary>{copy("Type and product cards", "الخطوط وبطاقات المنتجات")}</summary><div className="studio-fields">
            <label>{copy("Font pairing", "اقتران الخطوط")}<select value={draft.fontPair} onChange={e => set("fontPair", e.target.value as StudioDraft["fontPair"])}>
              {STOREFRONT_FONTS.map(font => <option key={font} value={font}>{fontLabels[font][index]}</option>)}</select></label>
            <fieldset className="studio-choices"><legend>{copy("Image ratio", "نسبة أبعاد الصورة")}</legend>
              <div>{CARD_RATIOS.map(ratio => <label key={ratio}><input type="radio" name="card-ratio" checked={draft.cardAspectRatio === ratio}
                onChange={() => set("cardAspectRatio", ratio)}/><span>{ratio === "preset" ? copy("Preset", "القالب") :
                  <bdi dir="ltr" className="tabular-nums">{ratio.replace(" / ", "∶")}</bdi>}</span></label>)}</div>
            </fieldset>
            <fieldset className="studio-choices"><legend>{copy("Desktop grid columns", "أعمدة شبكة الحاسوب")}</legend>
              <div>{GRID_COLUMNS.map(n => <label key={n}><input type="radio" name="grid-columns" checked={draft.gridColumns === n} onChange={() => set("gridColumns", n)}/>
                <span><bdi dir="ltr" className="tabular-nums">{n}</bdi></span></label>)}</div>
            </fieldset>
            <label className="studio-range"><span>{copy("Corner radius", "استدارة الزوايا")}
              <output><bdi dir="ltr" className="tabular-nums">{draft.borderRadius}</bdi> {copy("px", "بكسل")}</output></span>
              <input type="range" min={0} max={24} value={draft.borderRadius} onChange={e => set("borderRadius", e.target.valueAsNumber)}/></label>
          </div></details>
          <details open><summary>{copy("Hero and interactions", "الواجهة والتفاعل")}</summary><div className="studio-fields">
            <label className="studio-switch"><input type="checkbox" disabled={!hasHero} checked={hasHero && draft.hero_visible}
              onChange={e => set("hero_visible", e.target.checked)}/>{copy("Show homepage hero", "عرض الواجهة الرئيسية")}</label>
            {!hasHero && <small>{copy("The homepage has no active hero section.", "لا يوجد قسم واجهة مفعّل في الصفحة الرئيسية.")}</small>}
            <label>{copy("Hero layout", "تخطيط الواجهة")}<select disabled={!hasHero || !draft.hero_visible} value={draft.heroLayout} onChange={e => set("heroLayout", e.target.value as StudioDraft["heroLayout"])}>
              {HERO_LAYOUTS.map(layout => <option key={layout} value={layout}>{layoutLabels[layout][index]}</option>)}</select></label>
            <label className="studio-switch"><input type="checkbox" disabled={!hasHero || !draft.hero_visible} checked={draft.hero_cta_visible}
              onChange={e => set("hero_cta_visible", e.target.checked)}/>{copy("Show hero action", "عرض زر الواجهة")}</label>
            <label className="studio-switch"><input type="checkbox" disabled={!gates.sticky_cta_enabled} checked={gates.sticky_cta_enabled && draft.sticky_cta_enabled}
              onChange={e => set("sticky_cta_enabled", e.target.checked)}/>{copy("Sticky mobile purchase button", "تثبيت زر الشراء على الهاتف")}</label>
            <label className="studio-switch"><input type="checkbox" disabled={!gates.motion_enabled}
              checked={gates.motion_enabled && draft.motion_enabled && draft.motionIntensity !== "none"} onChange={e => {
                const enabled = e.target.checked;
                setDraft(current => ({ ...current, motion_enabled: enabled,
                  motionIntensity: enabled && current.motionIntensity === "none" ? "smooth" : current.motionIntensity }));
              }}/>{copy("Storefront motion", "الحركة في المتجر")}</label>
            <label>{copy("Motion intensity", "شدة الحركة")}<select disabled={!gates.motion_enabled || !draft.motion_enabled} value={draft.motionIntensity}
              onChange={e => set("motionIntensity", e.target.value as StudioDraft["motionIntensity"])}>
              {MOTION_INTENSITIES.map(motion => <option key={motion} value={motion}>{motionLabels[motion][index]}</option>)}</select></label>
            {(!gates.motion_enabled || !gates.sticky_cta_enabled) && <small>{copy("Platform settings govern the disabled features.", "تتحكم إعدادات المنصة في المزايا المعطّلة.")}</small>}
          </div></details>
        </fieldset>
      </form>
      <PreviewStage slug={slug} liveUrl={liveUrl} productId={productId} draft={draft}/>
    </div>
  </div>;
}
