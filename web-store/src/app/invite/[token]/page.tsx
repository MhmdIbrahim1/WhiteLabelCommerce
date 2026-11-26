import type { Metadata } from "next";
import Link from "next/link";
import { LanguageToggle } from "@/components/language-provider";
import { getServerLang } from "@/lib/i18n-server";
import { localizedText } from "@/lib/i18n";
import { serverDb } from "@/lib/db";
import { inviteDate, roleNames, validInviteToken, type TeamRole } from "@/lib/team";
import { AcceptForm } from "./accept-form";
import "../../admin/team/team.css";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
type Preview = { name_ar: string; name_en: string; slug: string; role: TeamRole; expires_at: string;
  account: "anonymous" | "mismatch" | "verify" | "ready" };

export default async function InvitePage({ params }: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, lang, db] = await Promise.all([params, getServerLang(), serverDb()]);
  const en = lang === "en";
  const { data, error } = validInviteToken(token) ? await db.rpc("team_invite_preview", { p_token: token }) : { data: null, error: null };
  const invite = data as Preview | null;
  const next = "?next=" + encodeURIComponent("/invite/" + token);
  const authPath = invite && "/store/" + invite.slug;
  return <main className="invite-shell" dir={en ? "ltr" : "rtl"}><section className="invite-card">
    <div className="team-between"><strong>{en ? "Team invitation" : "دعوة للانضمام إلى الفريق"}</strong>
      <LanguageToggle className="lang-toggle-pill" /></div>
    {!invite ? <>
      <h1>{error ? (en ? "Try again shortly" : "حاول بعد قليل") : (en ? "Invitation unavailable" : "الدعوة غير متاحة")}</h1>
      <p>{error ? (en ? "We couldn’t load this invitation." : "تعذّر تحميل هذه الدعوة.") :
        (en ? "Ask the person who invited you for a current link." : "اطلب رابطاً سارياً ممن أرسل إليك الدعوة.")}</p>
      <Link href="/admin">{en ? "Open workspace" : "فتح مساحة العمل"}</Link>
    </> : <>
      <h1 dir="auto">{localizedText(lang, invite.name_ar, invite.name_en)}</h1>
      <dl><div><dt>{en ? "Assigned role" : "الدور المحدد"}</dt><dd>{roleNames[invite.role][lang]}</dd></div>
        <div><dt>{en ? "Expires" : "تنتهي الدعوة"}</dt><dd>{inviteDate(invite.expires_at, lang)} UTC</dd></div></dl>
      {invite.account === "ready" ?
        <AcceptForm token={token} lang={lang} /> :
        <><p>{invite.account === "mismatch" ? (en ? "Sign in with the email address that received this invitation." : "سجّل الدخول بالبريد الإلكتروني الذي تلقّى الدعوة.") :
          invite.account === "verify" ? (en ? "Verify your invited email using a one-time sign-in code." : "تحقّق من بريدك المدعو باستخدام رمز الدخول لمرة واحدة.") :
          (en ? "Use the invited email address to join this store." : "استخدم البريد الإلكتروني المدعو للانضمام إلى هذا المتجر.")}</p>
          <div className="team-actions"><Link href={authPath + "/login" + next + (invite.account === "verify" ? "&method=otp" : "")} prefetch={false}>
            {invite.account === "verify" ? (en ? "Verify email" : "التحقّق من البريد") : (en ? "Sign in" : "تسجيل الدخول")}</Link>
            {invite.account === "anonymous" && <Link href={authPath + "/register" + next} prefetch={false}>{en ? "Create account" : "إنشاء حساب"}</Link>}</div></>}
    </>}
  </section></main>;
}
