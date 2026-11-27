import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { settings } from "@/lib/shop";
import { storefrontAppearance } from "@/lib/storefront-appearance";
import { storefrontSurfaceProps } from "@/lib/storefront-theme";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { getServerLang } from "@/lib/i18n-server";
import { localizedText } from "@/lib/i18n";
import { storeHref } from "@/lib/tenant-shared";
import { AccessShell } from "../access-shell";
import "@/app/(shop)/storefront.css";

export async function TenantAuthShell({ children }: { children: ReactNode }) {
  const [store, appearance, jar] = await Promise.all([settings(), storefrontAppearance(), cookies()]);
  const lang = await getServerLang(store.uiConfig.defaultLanguage);
  const mode = jar.get("shop_theme")?.value === "dark" ? "dark" : "light";
  return <div data-shop-theme={mode} style={{ colorScheme: mode }}>
    <div className="shop sf-store access-tenant" {...storefrontSurfaceProps(store.uiConfig, appearance)}>
      <AccessShell lang={lang} tenant={{ name: localizedText(lang, store.nameAr, store.nameEn) || store.name,
        logo: storefrontImageSrc(store.uiConfig.storefrontLogo, 128), home: storeHref(store.basePath, "/") }}>{children}</AccessShell>
    </div></div>;
}
