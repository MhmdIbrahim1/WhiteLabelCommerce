import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import brand from "@/lib/brand";
import { langDir, langHtmlAttr, type Lang } from "@/lib/i18n";
import { getServerLang, getStudioPreviewLang } from "@/lib/i18n-server";
import { STORE_ID_HEADER } from "@/lib/tenant-shared";
import { settings } from "@/lib/shop";
import { LanguageProvider } from "@/components/language-provider";
import { FloatingToastHost } from "@/components/floating-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.storeName, template: "%s · " + brand.storeName },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let defaultLang: Lang = "ar";
  if ((await headers()).has(STORE_ID_HEADER)) {
    try { defaultLang = (await settings()).uiConfig.defaultLanguage; } catch {}
  }
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
        <LanguageProvider initialLang={lang} defaultLang={defaultLang} preview={Boolean(await getStudioPreviewLang())}>
          {children}
          <FloatingToastHost />
        </LanguageProvider>
      </body>
    </html>
  );
}
