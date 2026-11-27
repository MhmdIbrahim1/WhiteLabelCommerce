"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/components/use-hydrated";
import { Globe } from "lucide-react";
import {
  DICT,
  isLang,
  LANG_COOKIE,
  LANG_STORAGE_KEY,
  langDir,
  langHtmlAttr,
  type DictKey,
  type Lang,
} from "@/lib/i18n";

type LanguageContextValue = {
  lang: Lang;
  dir: "rtl" | "ltr";
  isRtl: boolean;
  setLang: (next: Lang) => void;
  toggleLang: () => void;
  t: (key: DictKey) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "ar",
  dir: "rtl",
  isRtl: true,
  setLang: () => {},
  toggleLang: () => {},
  t: (key) => DICT.ar[key],
});

function persistLang(next: Lang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {}
  try {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
  document.documentElement.lang = langHtmlAttr(next);
  document.documentElement.dir = langDir(next);
}

export function LanguageProvider({
  initialLang,
  defaultLang = "ar",
  preview = false,
  children,
}: {
  initialLang: Lang;
  defaultLang?: Lang;
  preview?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);

  // Keep DOM attributes synchronized and restore localStorage preference if cookie wasn't set yet
  useEffect(() => {
    if (preview) return;
    document.documentElement.lang = langHtmlAttr(lang);
    document.documentElement.dir = langDir(lang);

    try {
      const hasCookie = document.cookie
        .split(";")
        .some((c) => c.trim().startsWith(`${LANG_COOKIE}=`));
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (!hasCookie) {
        const preferred = isLang(stored) ? stored : defaultLang;
        if (preferred !== lang) {
          persistLang(preferred);
          queueMicrotask(() => {
            setLangState(preferred);
            router.refresh();
          });
        }
      }
    } catch {}
  }, [defaultLang, lang, router, preview]);

  const setLang = useCallback(
    (next: Lang) => {
      if (preview || next === lang) return;
      persistLang(next);
      setLangState(next);
      router.refresh();
    },
    [lang, router, preview],
  );

  const toggleLang = useCallback(() => {
    setLang(lang === "ar" ? "en" : "ar");
  }, [lang, setLang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      dir: langDir(lang),
      isRtl: lang === "ar",
      setLang,
      toggleLang,
      t: (key: DictKey) => DICT[lang][key],
    }),
    [lang, setLang, toggleLang],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageToggle({
  className = "lang-toggle-pill",
}: {
  className?: string;
}) {
  const interactive = useHydrated();
  const { lang, toggleLang } = useLanguage();
  const nextLabel = lang === "ar" ? "EN" : "عربي";
  const aria =
    lang === "ar"
      ? "Switch language to English"
      : "التبديل إلى اللغة العربية";
  return (
    <button
      type="button"
      className={className}
      disabled={!interactive}
      onClick={toggleLang}
      aria-label={aria}
      title={aria}
      data-lang-toggle={lang}
    >
      <Globe size={14} aria-hidden="true" />
      <span>{nextLabel}</span>
    </button>
  );
}
