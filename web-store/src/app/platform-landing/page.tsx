import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, ArrowUp, ArrowUpRight, Box, Check, Fingerprint, Layers, Route, ShoppingBag, Smartphone, Users } from "lucide-react";
import { LanguageToggle } from "@/components/language-provider";
import { PlanComparison } from "@/components/plan-comparison";
import { PlatformBrand } from "@/components/platform-brand";
import { requestUser, serverDb } from "@/lib/db";
import { adminUser } from "@/lib/access";
import { LogoutForm } from "@/components/auth-session";
import { getPlanCatalog } from "@/lib/billing-data";
import { langDir, type Lang } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { resolveTheme } from "@/lib/platform-theme";
import { getPublishedTheme } from "@/lib/platform-theme-data";
import { DEFAULT_STORE_SLUG, PLATFORM_ORIGIN_HEADER, storefrontPath } from "@/lib/tenant-shared";
import { photos } from "./catalog";
import { AndroidDemo, DomainDemo, SalesDemo, StorefrontDemo } from "./feature-demos";
import { HeroMosaic, StartDock } from "./hero";
import "@/components/platform-theme.css";
import "./landing.css";

const copy = {
  en: {
    features: "Features", verticals: "Verticals", pricing: "Pricing", login: "Log in", start: "Start free",
    skip: "Skip to content", nav: "Main navigation", top: "Back to top", demo: "Visit the demo store",
    tools: "Built for the way you sell.",
    store: ["Storefronts", "Find your fit.", "Switch the collection to see how a storefront can take on your brand’s character."],
    app: ["Android", "An app with your name on it.", "Try a brand identity and see it carry through to an installable Android release."],
    domain: ["Domains", "Make the address yours.", "Connect your domain and give shoppers a secure address they’ll remember."],
    sales: ["Operations", "Every order, accounted for.", "Add an order to see sales and the monthly allowance move together."],
    infrastructure: "Your name on the app. Your data in its own space.",
    architecture: "Give customers a direct way back to your shop with a branded Android app. Each store has its own catalog, orders and team access.",
    architectureLabel: "Platform architecture", openPlans: "Compare plans",
    security: [
      ["Tenant isolation", "PostgreSQL row-level security scopes each store’s data."],
      ["Domain routing", "Indexed domain lookups target sub-millisecond database routing."],
      ["Atomic quotas", "The order and its usage count are recorded in one transaction."],
      ["Team permissions", "Give each teammate access to the work they do."],
    ],
    pricingTitle: "A plan for your storefront.", collection: "The canvas collection", material: "Cotton canvas",
    footer: "Footer navigation", privacy: "Privacy Policy", terms: "Terms of Service",
  },
  ar: {
    features: "المزايا", verticals: "الأنشطة", pricing: "الباقات", login: "دخول", start: "ابدأ مجاناً",
    skip: "انتقل إلى المحتوى", nav: "التنقل الرئيسي", top: "العودة للأعلى", demo: "تصفّح المتجر التجريبي",
    tools: "أدوات تناسب طريقتك في البيع.",
    store: ["واجهات المتاجر", "واجهة تشبه منتجاتك.", "تنقّل بين الأنشطة وشاهد كيف تتغيّر طريقة عرض المنتج مع هوية كل متجر."],
    app: ["أندرويد", "تطبيق يحمل اسم متجرك.", "اختر هوية من المعاينة وشاهد ألوانها وشعارها على تطبيق أندرويد جاهز للتثبيت."],
    domain: ["النطاقات", "عنوان يتذكّره عملاؤك.", "اربط نطاقك الخاص ليستقبل متجرك زوّاره على عنوان آمن يحمل اسم علامتك."],
    sales: ["إدارة المبيعات", "كل طلب في حسابه.", "أضف طلباً في المثال وتابع أثره على المبيعات ورصيد الطلبات الشهري."],
    infrastructure: "تطبيق باسمك، ومساحة خاصة لبياناتك.",
    architecture: "اجعل العودة إلى متجرك سهلة بتطبيق أندرويد يحمل هويتك. لكل متجر كتالوجه وطلباته وصلاحيات فريقه.",
    architectureLabel: "بنية المنصة", openPlans: "قارن الباقات",
    security: [
      ["عزل بيانات المتاجر", "تحصر سياسات PostgreSQL على مستوى الصف بيانات كل متجر في نطاقه."],
      ["توجيه النطاقات", "تستهدف فهارس النطاقات زمن توجيه أقل من ملّي ثانية داخل قاعدة البيانات."],
      ["احتساب الاستخدام", "يُسجَّل الطلب ويُحدَّث رصيده في معاملة واحدة."],
      ["صلاحيات الفريق", "امنح كل زميل الصلاحيات التي يحتاج إليها لأداء عمله."],
    ],
    pricingTitle: "باقة تناسب متجرك.", collection: "تشكيلة الكانفاس", material: "كانفاس قطني",
    footer: "روابط التذييل", privacy: "سياسة الخصوصية", terms: "شروط الخدمة",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const [lang, hdrs, theme] = await Promise.all([getServerLang(), headers(), getPublishedTheme()]);
  const title = theme[`hero_title_${lang}`].replace(/\s+/g, " ") + " · WhiteLabelCommerce";
  const description = theme[`hero_subtitle_${lang}`];
  const canonical = (hdrs.get(PLATFORM_ORIGIN_HEADER) ?? "") + "/";
  return { title: { absolute: title }, description, alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: "WhiteLabelCommerce", type: "website", locale: lang === "en" ? "en_US" : "ar_EG" } };
}

function Feature({ words, id, children }: { words: string[]; id?: string; children: ReactNode }) {
  return <article className="feature-card" id={id}>
    <div className="feature-copy"><span className="feature-tag">{words[0]}</span>
      <h3>{words[1]}</h3><p>{words[2]}</p></div>
    {children}
  </article>;
}

function Architecture({ lang }: { lang: Lang }) {
  const c = copy[lang];
  const icons = [Fingerprint, Route, Layers, Users];
  return <section className="architecture" aria-labelledby="architecture-title"><div className="landing-wrap">
    <div className="architecture-lead"><div className="architecture-copy">
      <span className="band-label"><Box size={16} />{c.architectureLabel}</span>
      <h2 id="architecture-title">{c.infrastructure}</h2><p>{c.architecture}</p>
      <a href="#pricing">{c.openPlans}<ArrowRight size={16} className="pt-directional" /></a>
    </div>
    <div className="architecture-art" aria-hidden="true">
      <div className="app-blueprint"><Smartphone size={16} /><bdi dir="ltr">fold.apk</bdi><Check size={14} /></div>
      <div className="band-phone"><div className="device-camera" />
        <div className="band-phone-top"><b lang="en">Fold</b><ShoppingBag size={16} /></div>
        <Image src={photos.fashion} alt="" unoptimized />
        <div className="band-phone-title">{c.collection}</div>
        <div className="band-phone-detail"><Image src={photos.knit} alt="" unoptimized />{c.material}</div>
      </div>
    </div></div>
    <div className="architecture-specs">{c.security.map(([title, body], i) => {
      const Icon = icons[i];
      return <div key={title}><Icon size={24} /><h3>{title}</h3><p>{body}</p></div>;
    })}</div>
  </div></section>;
}

export default async function PlatformLanding() {
  const [lang, plans, theme, user] = await Promise.all([getServerLang(), getPlanCatalog().catch(() => null), getPublishedTheme(), requestUser()]);
  const merchant = user && await adminUser(await serverDb(), undefined, user);
  const c = copy[lang];
  const demo = storefrontPath(DEFAULT_STORE_SLUG);
  return <div className="pt-shell landing" id="top" lang={lang} dir={langDir(lang)}
    data-preset={theme.preset} data-motion={theme.motion_enabled ? "on" : "off"} data-sticky={theme.sticky_cta_enabled}
    style={resolveTheme(theme) as CSSProperties}>
    <a className="landing-skip" href="#platform-content">{c.skip}</a>
    <header className="landing-bar"><div className="landing-wrap">
      <a href="#top" className="landing-brand" aria-label="WhiteLabelCommerce"><PlatformBrand /></a>
      <nav className="landing-links" aria-label={c.nav}>
        <a href="#features">{c.features}</a><a href="#verticals">{c.verticals}</a><a href="#pricing">{c.pricing}</a>
      </nav>
      <div className="landing-account"><LanguageToggle className="pt-lang" />{user ? <>
        <LogoutForm>{lang === "en" ? "Sign out" : "تسجيل الخروج"}</LogoutForm>
        <Link className="pt-action" href={merchant ? "/admin" : "/account"}>{merchant ? (lang === "en" ? "Dashboard" : "لوحة التحكم") : (lang === "en" ? "My account" : "حسابي")}</Link>
      </> : <><Link href="/login?next=/admin">{c.login}</Link>
        <Link href="/create-store" className="pt-action">{c.start}<ArrowRight className="pt-directional" size={15} /></Link></>}</div>
    </div></header>
    <main id="platform-content">
      <section className="landing-hero" aria-labelledby="platform-title">
        <HeroMosaic lang={lang} motion={theme.motion_enabled} />
        <div className="hero-center">
          <div className="hero-headline"><h1 id="platform-title">{theme[`hero_title_${lang}`]}</h1>
            <p>{theme[`hero_subtitle_${lang}`]}</p></div>
          <StartDock lang={lang} sticky={theme.sticky_cta_enabled} />
        </div>
      </section>
      <section className="landing-wrap features" id="features" aria-labelledby="features-title">
        <header className="section-head" id="launch"><h2 id="features-title">{c.tools}</h2>
          <Link className="demo-link" href={demo}>{c.demo}<ArrowUpRight size={17} className="pt-directional" /></Link></header>
        <div className="feature-grid">
          <Feature words={c.store} id="verticals"><StorefrontDemo lang={lang} /></Feature>
          <Feature words={c.app}><AndroidDemo lang={lang} /></Feature>
          <Feature words={c.domain}><DomainDemo lang={lang} /></Feature>
          <Feature words={c.sales}><SalesDemo lang={lang} /></Feature>
        </div>
      </section>
      <Architecture lang={lang} />
      <div className="landing-wrap landing-plans" id="pricing"><PlanComparison id="plans" plans={plans} lang={lang} heading={c.pricingTitle} /></div>
    </main>
    <footer className="landing-footer"><div className="landing-wrap">
      <a href="#top" className="landing-brand" aria-label="WhiteLabelCommerce"><PlatformBrand /></a>
      <nav aria-label={c.footer}><a href="#pricing">{c.pricing}</a><Link href={demo}>{c.demo}</Link>
        <Link href="/privacy">{c.privacy}</Link><Link href="/terms">{c.terms}</Link>
        <a href="#top">{c.top}<ArrowUp size={14} /></a></nav>
    </div></footer>
  </div>;
}
