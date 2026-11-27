import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import brand from "@/lib/brand";
import { langDir, langHtmlAttr, type Lang } from "@/lib/i18n";
import { getServerLang, getStudioPreviewLang } from "@/lib/i18n-server";
import { STORE_ID_HEADER } from "@/lib/tenant-shared";
import { settings } from "@/lib/shop";
import { LanguageProvider } from "@/components/language-provider";
import { AuthSessionProvider } from "@/components/auth-session";
import { requestUser } from "@/lib/db";
import { FloatingToastHost } from "@/components/floating-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.storeName, template: "%s · " + brand.storeName },
};

async function defaultLanguage(): Promise<Lang> {
  if (!(await headers()).has(STORE_ID_HEADER)) return "ar";
  return (await settings()).uiConfig.defaultLanguage;
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, studioLang] = await Promise.all([getServerLang(defaultLanguage), getStudioPreviewLang()]);
  const preview = Boolean(studioLang);
  const user = preview ? null : await requestUser();

  const tokens = {
    "--primary": brand.colors.primary,
    "--secondary": brand.colors.secondary,
    "--surface": brand.colors.surface,
    "--radius": brand.borderRadius + "px",
  } as CSSProperties;

  return (
    <html lang={langHtmlAttr(lang)} dir={langDir(lang)} style={tokens}>
      <body>
        <LanguageProvider initialLang={lang} preview={preview}>
          {preview ? children : <AuthSessionProvider initialUser={user?.id ?? null}>{children}</AuthSessionProvider>}
          <FloatingToastHost />
        </LanguageProvider>
      </body>
    </html>
  );
}
