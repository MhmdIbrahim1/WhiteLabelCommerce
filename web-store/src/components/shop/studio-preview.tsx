"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { showToast } from "@/components/floating-toast";
import type { Lang } from "@/lib/i18n";
import { resolveUiConfig } from "@/lib/ui-config";
import { mergeStudioDraft, type studioPreviewBase } from "@/lib/storefront-studio";
import { resolveStorefrontTheme, storefrontSurfaceProps, type StorefrontGates } from "@/lib/storefront-theme";
import { isPreviewPeer, previewLanguage, previewMode, previewNavigate, previewPagePath, previewReady, readPreviewUpdate } from "@/lib/storefront-preview";

import { StudioPreviewContext } from "./studio-preview-context";

export function StudioPreview({ base, gates, slug, lang, card, children }: {
  base: ReturnType<typeof studioPreviewBase>; gates: StorefrontGates; slug: string; lang: Lang; card: string; children: ReactNode;
}) {
  const [update, setUpdate] = useState<ReturnType<typeof readPreviewUpdate>>(null);
  const config = useMemo(() => resolveUiConfig(update ? mergeStudioDraft(base, update.draft) : base), [base, update]);
  const theme = useMemo(() => resolveStorefrontTheme(config, gates), [config, gates]);
  useEffect(() => {
    const parent = window.parent;
    if (parent === window) return;
    const origin = window.location.origin;
    function receive(event: MessageEvent) {
      if (!isPreviewPeer(event, origin, parent)) return;
      const next = readPreviewUpdate(event.data, slug);
      if (next) setUpdate(next);
    }
    window.addEventListener("message", receive);
    parent.postMessage({ type: previewReady, slug }, origin);
    return () => window.removeEventListener("message", receive);
  }, [slug]);

  function liveAction() {
    showToast({ kind: "info", message: lang === "en" ? "Open the live store to use this action." : "افتح المتجر المباشر لاستخدام هذا الإجراء." });
  }
  function navigate(url: URL) {
    const prefix = "/s/" + slug;
    if (url.origin === location.origin && (url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) {
      if (url.hash && url.pathname === location.pathname) {
        document.getElementById(url.hash.slice(1))?.scrollIntoView();
        return;
      }
      const path = previewPagePath((url.pathname.slice(prefix.length) || "/") + url.search);
      if (path && window.parent !== window) {
        window.parent.postMessage({ type: previewNavigate, slug, path }, location.origin);
        return;
      }
    }
    liveAction();
  }
  function browse(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    const control = event.target.closest("button,input,textarea,select");
    if (!link && (!control || control.closest(".sf-slide-controls,.product-gallery,.variant-options,.purchase-quantity,.sf-search,.sf-drawer-head,.filters")
      || control.matches(".sf-nav-tools .sf-icon"))) return;
    event.preventDefault();
    event.stopPropagation();
    if (link) navigate(new URL(link.href));
    else if (control?.matches("[data-lang-toggle]")) {
      window.parent.postMessage({ type: previewLanguage, slug, lang: lang === "ar" ? "en" : "ar" }, location.origin);
    } else if (control?.matches(".theme-btn")) {
      window.parent.postMessage({ type: previewMode, slug, mode: update?.mode === "dark" ? "light" : "dark" }, location.origin);
    } else liveAction();
  }
  function submit(event: FormEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get") return liveAction();
    const url = new URL(form.action);
    url.search = "";
    for (const [key, value] of new FormData(form)) if (typeof value === "string" && value) url.searchParams.append(key, value);
    navigate(url);
  }

  return <StudioPreviewContext.Provider value={{ home: config.pages.home, theme }}>
    <div data-storefront-mode="" data-studio-preview="" data-shop-theme={update?.mode ?? "light"}
      onClickCapture={browse} onAuxClickCapture={browse} onSubmitCapture={submit}>
      <div className="shop sf-store" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-card={card}
        {...storefrontSurfaceProps(config, theme)}>{children}</div>
    </div>
  </StudioPreviewContext.Provider>;
}
