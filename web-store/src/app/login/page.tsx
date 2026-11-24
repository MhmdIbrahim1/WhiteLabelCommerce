import Link from "next/link";
import { ArrowLeft, ArrowRight, Store, LockKeyhole, Sparkles } from "lucide-react";
import { settings } from "@/lib/shop";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { LanguageToggle } from "@/components/language-provider";
import { login } from "./actions";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const [params, store, lang] = await Promise.all([
    searchParams,
    settings(),
    getServerLang(),
  ]);
  const ArrowIcon = lang === "en" ? ArrowRight : ArrowLeft;
  const error = typeof params.error === "string" ? params.error : "";
  const registered =
    typeof params.registered === "string" ? params.registered : "";
  const next = typeof params.next === "string" ? params.next : "";

  return (
    <main className="auth-shell">
      <section className="auth-glass-card">
        <div className="auth-top-row">
          <Link href="/" className="brand" style={{ textDecoration: "none" }}>
            <span className="mark">
              <Store size={20} />
            </span>
            <b dir="auto">{store.name}</b>
          </Link>
          <div className="auth-top-actions">
            <LanguageToggle className="lang-toggle-pill" />
            <Link href="/" className="auth-back-link">
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

        {registered === "confirm" && (
          <p className="auth-alert auth-alert--ok" role="status">
            {lang === "en"
              ? "Account created! Please confirm your email address, then sign in."
              : "تم إنشاء حسابك بنجاح! يرجى تأكيد بريدك الإلكتروني ثم تسجيل الدخول."}
          </p>
        )}

        {error && (
          <p className="auth-alert auth-alert--error" role="alert">
            {error === "unconfirmed"
              ? lang === "en"
                ? "Please confirm your email via the link sent to your inbox before signing in."
                : "يرجى تأكيد بريدك الإلكتروني عبر الرابط المرسل إليك قبل تسجيل الدخول."
              : lang === "en"
                ? "Could not sign in. Please check your email and password."
                : "تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور وأعد المحاولة."}
          </p>
        )}

        <form action={login} className="auth-form">
          <input type="hidden" name="next" value={next} />
          <label>
            {t(lang, "emailLabel")}
            <input
              type="email"
              dir="ltr"
              name="email"
              placeholder="name@example.com"
              autoComplete="username"
              required
            />
          </label>
          <label>
            {t(lang, "passwordLabel")}
            <input
              type="password"
              dir="ltr"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="auth-submit-btn">
            <span>{t(lang, "navLogin")}</span>
            <ArrowIcon size={17} />
          </button>
        </form>

        <div className="auth-switch">
          <span>
            {t(lang, "newCustomerPrompt")} {store.name}
            {lang === "en" ? "?" : "؟"}
          </span>
          <Link
            href={
              "/register" +
              (next ? "?next=" + encodeURIComponent(next) : "")
            }
          >
            {t(lang, "createNewAccount")}
          </Link>
        </div>

        <footer className="auth-footer">
          <LockKeyhole size={14} /> {t(lang, "authFooterNote")}
        </footer>
      </section>
    </main>
  );
}
