import { storeHref } from "@/lib/tenant-shared";
import Link from "next/link";
import { Store, LockKeyhole, Sparkles } from "lucide-react";
import { settings } from "@/lib/shop";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { LanguageToggle } from "@/components/language-provider";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const [params, store, lang] = await Promise.all([
    searchParams,
    settings(),
    getServerLang(),
  ]);
  const error = typeof params.error === "string" ? params.error : "";
  const registered =
    typeof params.registered === "string" ? params.registered : "";
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
            <Sparkles size={13} /> {t(lang, "authSecurePill")}
          </span>
          <h1>{t(lang, "authWelcomeBack")}</h1>
          <p>{t(lang, "authLoginSubtitle")}</p>
        </div>

        <HybridAuthPanel
          basePath={store.basePath}
          nextPath={next}
          initialOtp={params.method === "otp"}
          storeName={store.name}
          initialError={error}
          initialRegistered={registered}
        />

        <footer className="auth-footer">
          <LockKeyhole size={14} /> {t(lang, "authFooterNote")}
        </footer>
      </section>
    </main>
  );
}
