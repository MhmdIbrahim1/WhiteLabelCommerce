import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowUpRight, Globe, LayoutTemplate, Package, ShoppingBag, Smartphone, Store } from "lucide-react";
import { getPlanCatalog } from "@/lib/billing-data";
import { PlanComparison } from "@/components/plan-comparison";
import { LanguageToggle } from "@/components/language-provider";
import { getServerLang } from "@/lib/i18n-server";
import { DEFAULT_STORE_SLUG, PLATFORM_ORIGIN_HEADER, storefrontPath } from "@/lib/tenant-shared";
import "./landing.css";

const copy = {
  en: {
    title: "Your store on the web and Android", intro: "Launch a bilingual storefront on your own domain. Manage your catalog, orders and branded Android app from one dashboard.",
    hero: "Your store on the web", emphasis: "and Android.", dashboard: "Merchant dashboard", demo: "Explore the demo store",
    launch: "How to launch", plans: "Plans", demoName: "Nova Store", collection: "Clothing collection", catalog: "Catalog", app: "Native Android app",
    stepsTitle: "From catalog to launch", steps: [
      ["Make it yours", "Choose a store name, a theme and your web address."],
      ["Add your products", "Set prices, upload photos and organize your catalog in Arabic and English."],
      ["Open your doors", "Share your storefront link. On eligible plans, build a native Android APK with your name and icon."],
    ],
    footer: "Back to top", skip: "Skip to content",
  },
  ar: {
    title: "متجرك على الويب وأندرويد", intro: "أطلق متجراً بالعربية والإنجليزية على نطاقك الخاص. أدِر منتجاتك وطلباتك وتطبيق أندرويد الذي يحمل علامتك من لوحة تحكم واحدة.",
    hero: "متجرك على الويب", emphasis: "وعلى أندرويد.", dashboard: "لوحة تحكم التاجر", demo: "تصفّح المتجر التجريبي",
    launch: "خطوات الإطلاق", plans: "الباقات", demoName: "متجر نوفا", collection: "تشكيلة الملابس", catalog: "الكتالوج", app: "تطبيق أندرويد أصلي",
    stepsTitle: "من الكتالوج إلى الإطلاق", steps: [
      ["اختر هوية متجرك", "اختر اسماً للمتجر وقالباً يناسبه وعنواناً يسهل تذكّره."],
      ["أضف منتجاتك", "حدّد الأسعار وارفع الصور ورتّب الكتالوج بالعربية والإنجليزية."],
      ["افتح أبواب متجرك", "شارك رابط المتجر. وفي الباقات المؤهلة يمكنك إنشاء ملف APK لتطبيق أندرويد يحمل اسمك وأيقونتك."],
    ],
    footer: "العودة إلى الأعلى", skip: "انتقل إلى المحتوى",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const [lang, hdrs] = await Promise.all([getServerLang(), headers()]);
  const canonical = hdrs.get(PLATFORM_ORIGIN_HEADER) + "/";
  const title = copy[lang].title + " · WhiteLabelCommerce";
  return {
    title: { absolute: title }, description: copy[lang].intro, alternates: { canonical },
    openGraph: { title, description: copy[lang].intro, url: canonical, siteName: "WhiteLabelCommerce",
      type: "website", locale: lang === "en" ? "en_US" : "ar_EG" },
  };
}

export default async function PlatformLanding() {
  const [lang, plans] = await Promise.all([getServerLang(), getPlanCatalog().catch(() => null)]);
  const c = copy[lang];
  const demo = storefrontPath(DEFAULT_STORE_SLUG);
  const stepIcons = [LayoutTemplate, Package, Store];
  return <div className="platform-page" id="top">
    <a className="platform-skip" href="#platform-content">{c.skip}</a>
    <header className="platform-bar"><div className="platform-wrap">
      <a href="#top" className="platform-brand"><ShoppingBag aria-hidden="true" /><bdi>WhiteLabelCommerce</bdi></a>
      <nav aria-label={lang === "en" ? "Platform" : "المنصة"}>
        <a href="#launch">{c.launch}</a><a href="#plans">{c.plans}</a><LanguageToggle className="platform-lang" />
      </nav>
    </div></header>
    <main id="platform-content">
      <section className="platform-hero platform-wrap" aria-labelledby="platform-title">
        <div className="platform-pitch">
          <h1 id="platform-title">{c.hero} <em>{c.emphasis}</em></h1>
          <p>{c.intro}</p>
          <div className="platform-ctas">
            <Link className="platform-cta" href="/admin">{c.dashboard}<ArrowUpRight size={18} /></Link>
            <Link className="platform-demo" href={demo}>{c.demo}<span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <figure className="platform-preview" aria-label={lang === "en" ? "Example storefront on web and Android" : "مثال للمتجر على الويب وأندرويد"}>
          <div className="platform-browser" aria-hidden="true">
            <div className="platform-browser-top"><i /><i /><i /><Globe size={13} /></div>
            <div className="platform-browser-name"><b>{c.demoName}</b><ShoppingBag size={16} /></div>
            <div className="platform-photo"><Image src="/store-collection.jpg" alt="" fill preload sizes="(max-width: 800px) 78vw, 410px" />
              <strong>{c.collection}</strong></div>
          </div>
          <div className="platform-phone" aria-hidden="true"><div className="platform-speaker" />
            <ShoppingBag size={17} /><b>{c.demoName}</b><div className="platform-phone-photo" />
            <small>{c.catalog}</small><div className="platform-swatches"><i /><i /><i /></div>
          </div>
          <figcaption><Smartphone size={15} />{c.app}<span aria-hidden="true">·</span><bdi>APK</bdi></figcaption>
        </figure>
      </section>
      <section className="platform-launch" id="launch"><div className="platform-wrap">
        <h2>{c.stepsTitle}</h2>
        <ol>{c.steps.map(([name, text], i) => {
          const Icon = stepIcons[i];
          return <li key={i}><Icon size={21} aria-hidden="true"/><h3>{name}</h3><p>{text}</p></li>;
        })}</ol>
      </div></section>
      <div className="platform-plans platform-wrap" id="plans"><PlanComparison plans={plans} lang={lang} /></div>
    </main>
    <footer className="platform-end platform-wrap"><bdi>WhiteLabelCommerce</bdi><a href="#top">{c.footer} ↑</a></footer>
  </div>;
}
