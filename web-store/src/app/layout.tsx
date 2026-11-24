import type { Metadata } from "next";
import type { CSSProperties } from "react";
import brand from "@/lib/brand";
import { langDir, langHtmlAttr, type Lang } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { settings } from "@/lib/shop";
import { LanguageProvider } from "@/components/language-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.storeName, template: "%s · " + brand.storeName },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let defaultLang: Lang = "ar";
  try {
    const s = await settings();
    defaultLang = s.uiConfig.defaultLanguage;
  } catch {}
  const lang = await getServerLang(defaultLang);

  const tokens = {
    "--primary": brand.colors.primary,
    "--secondary": brand.colors.secondary,
    "--surface": brand.colors.surface,
    "--radius": brand.borderRadius + "px",
  } as CSSProperties;

  return (
    <html lang={langHtmlAttr(lang)} dir={langDir(lang)} style={tokens}>
      <body>
        <LanguageProvider initialLang={lang} defaultLang={defaultLang}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
