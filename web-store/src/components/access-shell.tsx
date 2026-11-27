import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Bookmark, CreditCard, KeyRound, MonitorSmartphone, PackageCheck, Store, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { LanguageToggle } from "./language-provider";
import { PlatformBrand } from "./platform-brand";
import "./access-shell.css";

export function AccessShell({ children, lang, tenant }: {
  children: ReactNode; lang: Lang; tenant?: { name: string; logo: string | null; home: string };
}) {
  const en = lang === "en";
  const home = tenant?.home ?? "/";
  const brand = tenant ? <span className="access-store-mark">{tenant.logo
    ? <Image src={tenant.logo} alt="" unoptimized width={36} height={36} /> : <Store size={28} />}
    <bdi dir="auto">{tenant.name}</bdi></span> : <PlatformBrand />;
  const benefits = tenant ? [
    { Icon: KeyRound, text: en ? "Sign in with a six-digit email code" : "دخول برمز من ستة أرقام عبر البريد" },
    { Icon: PackageCheck, text: en ? "Track your orders from checkout to delivery" : "تتبّع طلباتك حتى باب المنزل" },
    { Icon: Bookmark, text: en ? "Save your details for your next checkout" : "احفظ بياناتك لتجربة شراء أسرع" },
  ] : [
    { Icon: MonitorSmartphone, text: en ? "A storefront on the web and Android" : "متجر على الويب وتطبيق أندرويد" },
    { Icon: CreditCard, text: en ? "Orders and payments in one workspace" : "الطلبات والمدفوعات في مساحة واحدة" },
    { Icon: Zap, text: en ? "Instant setup for your store" : "إعداد فوري لمتجرك" },
  ];
  return <main className="access-shell" lang={lang} dir={en ? "ltr" : "rtl"}>
    <aside className="access-editorial">
      <Link href={home} className="access-brand">{brand}</Link>
      <div className="access-story"><h2>{tenant
        ? (en ? <>Your orders.<br />One account.</> : <>كل طلباتك<br />في حساب واحد.</>)
        : (en ? <>Your store,<br />ready for business.</> : <>متجرك جاهز<br />للانطلاق.</>)}</h2>
        <ul>{benefits.map(({ Icon, text }) => <li key={text}><Icon size={21} aria-hidden="true" /><span>{text}</span></li>)}</ul>
      </div>
    </aside>
    <section className="access-workspace">
      <nav className="access-utilities"><Link href={home}><ArrowLeft size={17} aria-hidden="true" />
        {tenant ? (en ? "Back to store" : "العودة للمتجر") : (en ? "Back to home" : "العودة للرئيسية")}</Link>
        <LanguageToggle className="access-language" /></nav>
      <div className="access-content"><div className="access-mobile-brand">{brand}</div>{children}</div>
    </section>
  </main>;
}
