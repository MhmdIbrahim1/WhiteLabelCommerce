import Link from "next/link";
import { Store, UserPlus, PhoneCall } from "lucide-react";
import { settings } from "@/lib/shop";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { LanguageToggle } from "@/components/language-provider";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";
import { storeHref } from "@/lib/tenant-shared";

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, store, lang] = await Promise.all([
    searchParams,
    settings(),
    getServerLang(),
  ]);
  const errorKey = typeof params.error === "string" ? params.error : "";
  const next = typeof params.next === "string" ? params.next : "";

  return (
    <main className="auth-shell">
      <section className="auth-glass-card">
        <div className="auth-top-row">
          <Link href={storeHref(store.basePath, "/")} className="brand" style={{ textDecoration: "none" }}>
            <span className="mark">
              <Store size={20} />
            </span>
            <b dir="auto">{store.name}</b>
          </Link>
          <div className="auth-top-actions">
            <LanguageToggle className="lang-toggle-pill" />
            <Link href={storeHref(store.basePath, "/")} className="auth-back-link">
              {t(lang, "backToStore")}
            </Link>
          </div>
        </div>

        <div className="auth-heading">
          <span className="auth-pill">
            <UserPlus size={13} /> {t(lang, "registerPill")}
          </span>
          <h1>{t(lang, "registerHeading")}</h1>
          <p>{t(lang, "registerSubtitle")}</p>
        </div>

        <HybridAuthPanel initialSignup nextPath={next} basePath={store.basePath} storeName={store.name} initialError={errorKey} />

        <footer className="auth-footer">
          <PhoneCall size={14} /> {t(lang, "registerFooterNote")}
        </footer>
      </section>
    </main>
  );
}
