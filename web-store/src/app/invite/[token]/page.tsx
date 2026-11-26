import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { AuthShell } from "@/components/workspace-surface";
import { getServerLang } from "@/lib/i18n-server";
import { localizedText } from "@/lib/i18n";
import { serverDb } from "@/lib/db";
import { inviteDate, roleNames, validInviteToken, type TeamRole } from "@/lib/team";
import { AcceptForm } from "./accept-form";

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
  return <AuthShell>
    {!invite ? <>
      <h1>{error ? (en ? "Try again shortly" : "حاول بعد قليل") : (en ? "Invitation unavailable" : "الدعوة غير متاحة")}</h1>
      <p>{error ? (en ? "We couldn’t load this invitation. Open the link again in a moment." : "تعذّر تحميل الدعوة. افتح الرابط مجدداً بعد قليل.") :
        (en ? "Ask the person who invited you for a fresh link." : "اطلب رابطاً جديداً ممن أرسل إليك الدعوة.")}</p>
      <Link className="ws-text-link" href="/admin">{en ? "Open workspace" : "فتح مساحة العمل"}</Link>
    </> : <>
      <span className="ws-store-badge"><Store size={15} /><bdi dir="auto">{localizedText(lang, invite.name_ar, invite.name_en)}</bdi></span>
      <h1>{en ? "Join the store team" : "انضم إلى فريق المتجر"}</h1>
      <dl className="ws-invite-facts"><div><dt>{en ? "Your role" : "دورك في الفريق"}</dt><dd>{roleNames[invite.role][lang]}</dd></div>
        <div><dt>{en ? "Invitation expires" : "تنتهي الدعوة في"}</dt><dd><bdi dir="ltr">{inviteDate(invite.expires_at, lang)} UTC</bdi></dd></div></dl>
      {invite.account === "ready" ? <AcceptForm token={token} lang={lang} /> : <>
        <p className="ws-feedback">{invite.account === "mismatch" ? (en ? "This invitation belongs to another email address. Sign in with the address that received it." : "أُرسلت الدعوة إلى بريد آخر. سجّل الدخول بالبريد الذي تلقّاها.") :
          invite.account === "verify" ? (en ? "Confirm the invited email address with a one-time code to join the team." : "أكّد البريد الذي تلقّى الدعوة برمز يُرسل إليه لتنضم إلى الفريق.") :
          (en ? "Sign in or create an account with the email address that received this invitation." : "سجّل الدخول أو أنشئ حساباً بالبريد الذي تلقّى الدعوة.")}</p>
        <div className="ws-actions"><Link className="pt-action" href={authPath + "/login" + next + (invite.account === "verify" ? "&method=otp" : "")} prefetch={false}>
          {invite.account === "verify" ? (en ? "Verify email" : "تحقّق من البريد") : (en ? "Sign in" : "تسجيل الدخول")}</Link>
          {invite.account === "anonymous" && <Link className="ws-text-link" href={authPath + "/register" + next} prefetch={false}>{en ? "Create account" : "إنشاء حساب"}</Link>}</div>
      </>}
    </>}
  </AuthShell>;
}
