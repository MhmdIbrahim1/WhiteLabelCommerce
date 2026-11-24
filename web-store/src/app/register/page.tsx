import Link from "next/link";
import { ArrowLeft, ArrowRight, Store, UserPlus, PhoneCall } from "lucide-react";
import { settings } from "@/lib/shop";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { LanguageToggle } from "@/components/language-provider";
import { register } from "../login/actions";

const ERROR_MESSAGES = {
  ar: {
    name: "يرجى إدخال اسمك الكامل (حرفين على الأقل).",
    phone: "يرجى إدخال رقم هاتف صحيح من 8 إلى 15 رقماً.",
    password: "كلمة المرور يجب أن تكون 6 أحرف على الأقل.",
    signup:
      "تعذر إنشاء الحساب. قد يكون البريد الإلكتروني مسجلاً بالفعل أو البيانات غير صالحة.",
  },
  en: {
    name: "Please enter your full name (at least 2 characters).",
    phone: "Please enter a valid 8–15 digit phone number.",
    password: "Password must be at least 6 characters.",
    signup:
      "Could not create account. This email may already be registered or invalid.",
  },
} as const;

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
  const ArrowIcon = lang === "en" ? ArrowRight : ArrowLeft;
  const errorKey = typeof params.error === "string" ? params.error : "";
  const next = typeof params.next === "string" ? params.next : "";
  const dict = ERROR_MESSAGES[lang];

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
            <UserPlus size={13} /> {t(lang, "registerPill")}
          </span>
          <h1>{t(lang, "registerHeading")}</h1>
          <p>{t(lang, "registerSubtitle")}</p>
        </div>

        {errorKey && (
          <p className="auth-alert auth-alert--error" role="alert">
            {dict[errorKey as keyof typeof dict] ?? dict.signup}
          </p>
        )}

        <form action={register} className="auth-form">
          <input type="hidden" name="next" value={next} />
          <label>
            {t(lang, "fullNameLabel")}
            <input
              name="full_name"
              placeholder={lang === "en" ? "e.g. Ahmed Mahmoud" : "مثال: أحمد محمود"}
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            {t(lang, "emailLabel")}
            <input
              type="email"
              dir="ltr"
              name="email"
              placeholder="name@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            {t(lang, "phoneLinkLabel")}
            <input
              type="tel"
              dir="ltr"
              name="phone"
              placeholder="01012345678"
              autoComplete="tel"
              required
              maxLength={24}
            />
          </label>
          <label>
            {t(lang, "passwordLabel")}
            <input
              type="password"
              dir="ltr"
              name="password"
              placeholder={lang === "en" ? "At least 6 characters" : "6 أحرف على الأقل"}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>
          <button className="auth-submit-btn">
            <span>{t(lang, "registerSubmit")}</span>
            <ArrowIcon size={17} />
          </button>
        </form>

        <div className="auth-switch">
          <span>{t(lang, "alreadyHaveAccount")}</span>
          <Link
            href={
              "/login" + (next ? "?next=" + encodeURIComponent(next) : "")
            }
          >
            {t(lang, "navLogin")}
          </Link>
        </div>

        <footer className="auth-footer">
          <PhoneCall size={14} /> {t(lang, "registerFooterNote")}
        </footer>
      </section>
    </main>
  );
}
