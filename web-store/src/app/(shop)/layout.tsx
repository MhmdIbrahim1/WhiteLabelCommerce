import type { CSSProperties } from "react";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import Link from "next/link";
import { Store } from "lucide-react";
import { uiConfigDataAttrs, uiConfigToCssVars } from "@/lib/ui-config";
import { settings } from "@/lib/shop";
import { serverDb } from "@/lib/db";
import { adminUser } from "@/lib/access";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import brand from "@/lib/brand";
import { Navigation } from "@/components/shop/navigation";
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
  const [s, admin, authRes] = await Promise.all([
    settings(),
    adminUser(db),
    db.auth.getUser(),
  ]);
  const lang = await getServerLang(s.uiConfig.defaultLanguage);
  const authUser = authRes.data.user;
  const userSummary = authUser
    ? {
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
  return (
    <div
      className={`shop ${font.className}`}
      {...dataAttrs}
      data-card={brand.presets.productCard}
      style={style}
    >
      <Navigation name={s.name} admin={!!admin} user={userSummary} />
      <main className="shop-main">{children}</main>
      <footer className="shop-footer-wrap">
        <div className="shop-footer">
          <div className="footer-brand">
            <span className="footer-mark" aria-hidden="true">
              <Store size={17} />
            </span>
            <div>
              <b>{s.name}</b>
              <p>{t(lang, "footerTagline")}</p>
            </div>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link href="/products">{t(lang, "footerAllProducts")}</Link>
            <Link href="/orders">{t(lang, "footerTrackOrders")}</Link>
            <Link href="/contact">{t(lang, "footerContact")}</Link>
            {admin && <Link href="/admin">{t(lang, "footerAdmin")}</Link>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
