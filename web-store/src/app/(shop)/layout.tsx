import type { CSSProperties } from "react";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import Link from "next/link";
import { Store } from "lucide-react";
import { uiConfigDataAttrs, uiConfigToCssVars } from "@/lib/ui-config";
import { settings } from "@/lib/shop";
import { serverDb } from "@/lib/db";
import { adminUser, superAdminUser } from "@/lib/access";
import { storeHref } from "@/lib/tenant";
import { localizedText, t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import brand from "@/lib/brand";
import { Navigation } from "@/components/shop/navigation";
import { SuspendedStoreGate } from "@/components/shop/suspended-store";
import "./shop.css";

export const dynamic = "force-dynamic";

const font = IBM_Plex_Sans_Arabic({
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
});

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await serverDb();
  const s = await settings();
  const [admin, superAdmin, authRes, lang] = await Promise.all([
    adminUser(db, s.storeId),
    superAdminUser(db),
    db.auth.getUser(),
    getServerLang(s.uiConfig.defaultLanguage),
  ]);
  const displayName = localizedText(lang, s.nameAr, s.nameEn) || s.name;

  if (s.status === "suspended") {
    return (
      <div className={font.className}>
        <SuspendedStoreGate
          storeName={displayName}
          lang={lang}
          canManage={Boolean(admin || superAdmin)}
        />
      </div>
    );
  }

  const authUser = authRes.data.user;
  const userSummary = authUser
    ? {
        id: authUser.id,
        email: authUser.email ?? "",
        name:
          (typeof authUser.user_metadata?.full_name === "string" &&
            authUser.user_metadata.full_name.trim()) ||
          (authUser.email?.split("@")[0] ?? t(lang, "navAccount")),
      }
    : null;
  const style: CSSProperties = {
    ...uiConfigToCssVars(s.uiConfig),
    "--shop-font": `${font.style.fontFamily}, "Cairo", system-ui, -apple-system, sans-serif`,
  } as CSSProperties;
  const dataAttrs = uiConfigDataAttrs(s.uiConfig);
  const href = (path: string) => storeHref(s.basePath, path);
  return (
    <div
      className={`shop ${font.className}`}
      {...dataAttrs}
      data-card={brand.presets.productCard}
      style={style}
    >
      <Navigation
        name={displayName}
        storeId={s.storeId}
        basePath={s.basePath}
        admin={Boolean(admin)}
        superAdmin={Boolean(superAdmin)}
        user={userSummary}
      />
      <main className="shop-main">{children}</main>
      <footer className="shop-footer-wrap">
        <div className="shop-footer">
          <div className="footer-brand">
            <span className="footer-mark" aria-hidden="true">
              <Store size={17} />
            </span>
            <div>
              <b>{displayName}</b>
              <p>{t(lang, "footerTagline")}</p>
            </div>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link href={href("/products")}>{t(lang, "footerAllProducts")}</Link>
            <Link href={href("/orders")}>{t(lang, "footerTrackOrders")}</Link>
            <Link href={href("/contact")}>{t(lang, "footerContact")}</Link>
            {admin && <Link href="/admin">{t(lang, "footerAdmin")}</Link>}
            {superAdmin && (
              <Link href="/super-admin">
                {lang === "en" ? "Super Admin" : "إدارة المنصة"}
              </Link>
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
}
