"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, LoaderCircle } from "lucide-react";
import { useHydrated } from "@/components/use-hydrated";
import { DICT, isLang, LANG_COOKIE, LANG_STORAGE_KEY, langDir, langHtmlAttr, type DictKey, type Lang } from "@/lib/i18n";

type LanguageContextValue = {
  lang: Lang;
  dir: "rtl" | "ltr";
  isRtl: boolean;
  pending: boolean;
  setLang: (next: Lang) => void;
  toggleLang: () => void;
  t: (key: DictKey) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "ar",
  dir: "rtl",
  isRtl: true,
  pending: false,
  setLang: () => {},
  toggleLang: () => {},
  t: (key) => DICT.ar[key],
});

function readLanguageCookie() {
  try {
    const prefix = LANG_COOKIE + "=";
    const value = document.cookie.split(/;\s*/).find(cookie => cookie.startsWith(prefix))?.slice(prefix.length);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

function persistLanguage(next: Lang) {
  try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch {}
  try { document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`; } catch {}
  return readLanguageCookie() === next;
}

export function LanguageProvider({ initialLang: lang, preview = false, children }: {
  initialLang: Lang; preview?: boolean; children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const restored = useRef(false);

  useLayoutEffect(() => {
    if (preview) return;
    document.documentElement.lang = langHtmlAttr(lang);
    document.documentElement.dir = langDir(lang);
  }, [lang, preview]);

  useLayoutEffect(() => {
    if (!pending) inFlight.current = false;
  }, [pending, lang]);

  const setLang = useCallback((next: Lang) => {
    if (preview || pending || inFlight.current || next === lang) return;
    // Two controls can dispatch in the same event before React commits the pending state.
    inFlight.current = true;
    const saved = persistLanguage(next);
    const url = new URL(window.location.href);
    startTransition(() => {
      if (!saved || isLang(url.searchParams.get(LANG_COOKIE))) {
        // A document navigation also refreshes shared layouts if the browser refuses cookies.
        if (saved) url.searchParams.delete(LANG_COOKIE);
        else url.searchParams.set(LANG_COOKIE, next);
        window.location.replace(url.href);
      } else {
        router.refresh();
      }
    });
  }, [lang, pending, preview, router, startTransition]);

  useEffect(() => {
    if (preview || restored.current) return;
    restored.current = true;
    if (readLanguageCookie() || isLang(new URL(window.location.href).searchParams.get(LANG_COOKIE))) return;
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (isLang(stored)) setLang(stored);
    } catch {}
  }, [preview, setLang]);

  useEffect(() => {
    if (preview) return;
    const currentUrl = new URL(window.location.href);
    if (!isLang(currentUrl.searchParams.get(LANG_COOKIE))) return;

    // A shared App Router layout would retain this URL's language if a link dropped it.
    function followLocaleLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;

      const url = new URL(link.href);
      if (url.protocol !== currentUrl.protocol || url.origin !== currentUrl.origin) return;
      if (url.hash && url.pathname === currentUrl.pathname && url.search === currentUrl.search) return;
      if (url.pathname.includes("/api/") || url.pathname.startsWith("/_next/") || /\.[^/]+$/.test(url.pathname)) return;
      if (!isLang(url.searchParams.get(LANG_COOKIE))) url.searchParams.set(LANG_COOKIE, lang);
      event.preventDefault();
      window.location.assign(url.href);
    }

    document.addEventListener("click", followLocaleLink, true);
    return () => document.removeEventListener("click", followLocaleLink, true);
  }, [lang, preview]);

  const value = useMemo<LanguageContextValue>(() => ({
    lang,
    dir: langDir(lang),
    isRtl: lang === "ar",
    pending,
    setLang,
    toggleLang: () => setLang(lang === "ar" ? "en" : "ar"),
    t: key => DICT[lang][key],
  }), [lang, pending, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageToggle({ className = "lang-toggle-pill" }: { className?: string }) {
  const interactive = useHydrated();
  const { lang, pending, toggleLang } = useLanguage();
  const nextLabel = lang === "ar" ? "EN" : "عربي";
  const aria = lang === "ar" ? "Switch language to English" : "التبديل إلى اللغة العربية";
  const Icon = pending ? LoaderCircle : Globe;
  return <button type="button" className={className} disabled={!interactive || pending} aria-busy={pending || undefined}
    onClick={toggleLang} aria-label={aria} title={aria} data-lang-toggle={lang}>
    <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
    <span>{nextLabel}</span>
  </button>;
}
