"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Globe2, Monitor, Moon, RotateCcw, Smartphone, Sun } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { storefrontUrlLabel } from "@/lib/host-routing";
import type { Lang } from "@/lib/i18n";
import { isPreviewPeer, previewLanguage, previewMessage, previewMode, previewNavigate, previewReady, readFrameMessage, studioFrameSrc, type PreviewMode } from "@/lib/storefront-preview";
import type { StudioDraft } from "@/lib/storefront-studio";

export function Segment({ label, children }: { label: string; children: ReactNode }) {
  return <div className="studio-segment" role="group" aria-label={label}>{children}</div>;
}

function Frame({ src, slug, draft, mode, width, navigate, changeLocale, changeMode }: {
  src: string; slug: string; draft: StudioDraft; mode: PreviewMode; width: number; navigate: (path: string) => void;
  changeLocale: (lang: Lang) => void; changeMode: (mode: PreviewMode) => void;
}) {
  const en = useLanguage().lang === "en";
  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const node = area.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const mounted = size.width > 0;
  useEffect(() => {
    if (!mounted || status !== "loading") return;
    const timer = window.setTimeout(() => setStatus("unavailable"), 18000);
    return () => window.clearTimeout(timer);
  }, [mounted, status, attempt]);
  useEffect(() => {
    const origin = window.location.origin;
    const send = () => frame.current?.contentWindow?.postMessage(previewMessage(slug, mode, draft), origin);
    const receive = (event: MessageEvent) => {
      if (!isPreviewPeer(event, origin, frame.current?.contentWindow ?? null)) return;
      const message = readFrameMessage(event.data, slug);
      if (message?.type === previewReady) { setStatus("ready"); send(); }
      else if (message?.type === previewNavigate) navigate(message.path);
      else if (message?.type === previewLanguage) changeLocale(message.lang);
      else if (message?.type === previewMode) changeMode(message.mode);
    };
    window.addEventListener("message", receive);
    send();
    return () => window.removeEventListener("message", receive);
  }, [slug, mode, draft, navigate, changeLocale, changeMode]);
  const scale = Math.min(1, size.width / width);
  return <div className="studio-frame-area" ref={area} aria-busy={status === "loading"}>
    {mounted && <div className="studio-frame-clip" dir="ltr" style={{ width: width * scale }}>
      <iframe key={attempt} ref={frame} title={en ? "Live storefront preview" : "المعاينة المباشرة لواجهة المتجر"}
        sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="same-origin" src={src}
        style={{ width, height: size.height / scale, transform: "scale(" + scale + ")" }}/>
    </div>}
    {status !== "ready" && <div className="studio-frame-status" role="status">
      {status === "loading" ? (en ? "Loading storefront…" : "جارٍ تحميل المتجر…")
        : <>{en ? "The storefront preview could not connect." : "تعذر الاتصال بمعاينة المتجر."}
          <button type="button" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>
            <RotateCcw size={15}/>{en ? "Retry" : "إعادة المحاولة"}</button></>}
    </div>}
  </div>;
}

export function PreviewStage({ slug, liveUrl, productId, draft }: {
  slug: string; liveUrl: string; productId: string | null; draft: StudioDraft;
}) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const [locale, setLocale] = useState<Lang>(lang);
  const [mode, setMode] = useState<PreviewMode>("light");
  const [mobile, setMobile] = useState(false);
  const [path, setPath] = useState("/");
  const src = studioFrameSrc(slug, path, locale);
  const page = path.split("?")[0];
  const details = page.startsWith("/products/") ? page : productId ? "/products/" + productId : null;
  return <section className="studio-stage" id="studio-preview" aria-label={en ? "Live preview" : "المعاينة المباشرة"}>
    <header className="studio-stage-head">
      <div><h2>{en ? "Live preview" : "المعاينة المباشرة"}</h2>
        <bdi dir="ltr" className="tabular-nums">{storefrontUrlLabel(liveUrl)}</bdi></div>
      <a href={liveUrl} target="_blank" rel="noopener noreferrer">{en ? "Open live store" : "فتح المتجر المباشر"}<ExternalLink className="studio-directional" size={15}/></a>
    </header>
    <div className="studio-stage-tools">
      <select aria-label={en ? "Storefront page" : "صفحة المتجر"} value={page} onChange={e => setPath(e.target.value)}>
        <option value="/">{en ? "Home" : "الرئيسية"}</option>
        <option value="/products">{en ? "Catalog" : "الكتالوج"}</option>
        {details && <option value={details}>{en ? "Product details" : "تفاصيل المنتج"}</option>}
      </select>
      <Segment label={en ? "Preview viewport" : "حجم المعاينة"}>
        <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor/>{en ? "Desktop" : "حاسوب"}</button>
        <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone/>{en ? "Mobile" : "هاتف"}</button>
      </Segment>
      <Segment label={en ? "Storefront appearance" : "مظهر واجهة المتجر"}>
        <button type="button" aria-pressed={mode === "light"} onClick={() => setMode("light")}><Sun/>{en ? "Light" : "فاتح"}</button>
        <button type="button" aria-pressed={mode === "dark"} onClick={() => setMode("dark")}><Moon/>{en ? "Dark" : "داكن"}</button>
      </Segment>
      <Segment label={en ? "Preview language" : "لغة المعاينة"}>
        <button type="button" aria-pressed={locale === "ar"} onClick={() => setLocale("ar")}>{en ? "Arabic" : "العربية"}</button>
        <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>{en ? "English" : "الإنجليزية"}</button>
      </Segment>
    </div>
    <Frame key={src} src={src} slug={slug} mode={mode} draft={draft} width={mobile ? 390 : 1440} navigate={setPath}
      changeLocale={setLocale} changeMode={setMode}/>
    <footer className="studio-stage-foot"><Globe2 size={14}/>
      <span>{en ? "Preview width" : "عرض المعاينة"} <bdi dir="ltr" className="tabular-nums">{mobile ? 390 : 1440}</bdi> {en ? "px" : "بكسل"}</span>
      <span>{locale === "ar" ? (en ? "Right to left" : "من اليمين إلى اليسار") : (en ? "Left to right" : "من اليسار إلى اليمين")}</span>
    </footer>
  </section>;
}
