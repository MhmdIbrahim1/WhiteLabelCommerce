import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { langDir, type Lang } from "@/lib/i18n";
import { LanguageToggle } from "./language-provider";
import { ModeControl, WorkspaceSurface } from "./workspace-surface";
import "./legal-page.css";

export type LegalCopy = {
  title: string; introduction: string; sections: [string, string][]; contact: string;
};

export function LegalPage({ lang, copy, related }: { lang: Lang; copy: LegalCopy; related: "/privacy" | "/terms" }) {
  const en = lang === "en";
  return <WorkspaceSurface>
    <div className="legal-page" lang={lang} dir={langDir(lang)}>
      <header className="ws-auth-bar">
        <Link className="legal-home" href="/"><ArrowLeft size={18} className="pt-directional" aria-hidden="true" />
          {en ? "Back to home" : "العودة إلى الرئيسية"}</Link>
        <div><LanguageToggle className="pt-lang" /><ModeControl /></div>
      </header>
      <main className="legal-document">
        <header>
          <h1>{copy.title}</h1>
          <p className="legal-intro">{copy.introduction}</p>
          <p className="legal-date">{en ? "Last updated" : "آخر تحديث"}{" "}
            <time dateTime="2026-11-27"><bdi dir="ltr">{en ? "27 November 2026" : "٢٧ نوفمبر ٢٠٢٦"}</bdi></time>
          </p>
        </header>
        {copy.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}
        <section><h2>{en ? "Contact" : "التواصل"}</h2><p>{copy.contact}</p>
          <a className="ws-text-link" href="mailto:noreply@shopstage.live"><bdi dir="ltr">noreply@shopstage.live</bdi></a>
        </section>
        <footer><Link className="ws-text-link" href={related}>{related === "/terms"
          ? (en ? "Terms of Service" : "شروط الخدمة") : (en ? "Privacy Policy" : "سياسة الخصوصية")}</Link></footer>
      </main>
    </div>
  </WorkspaceSurface>;
}
