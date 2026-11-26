"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { limitLabel, quotaMessage } from "@/lib/billing";
import type { Lang } from "@/lib/i18n";
import { canDelegate, canEditMember, inviteDate, permissionKeys, permissionNames, preset, roleNames,
  type Assignment, type TeamActor, type TeamMember, type TeamRole, type TeamSnapshot } from "@/lib/team";
import { changeTeam, type TeamResult } from "./actions";

type Command = Parameters<typeof changeTeam>[1];
type Run = (command: Command, success: string, onSuccess?: () => void) => void;

function AssignmentFields({ lang, actor, value, onChange, allowOwner }: {
  lang: Lang; actor: TeamActor; value: Assignment; onChange: (a: Assignment) => void; allowOwner: boolean;
}) {
  const en = lang === "en";
  const roles = (Object.keys(roleNames) as TeamRole[]).filter(role =>
    (role !== "owner" || allowOwner) && canDelegate(actor, { role, permissions: preset(role) }));
  return <>
    <label>{en ? "Role" : "الدور"}<select value={value.role} onChange={e => {
      const role = e.target.value as TeamRole;
      onChange({ role, permissions: role === "custom" ? value.permissions : preset(role) });
    }}>{roles.map(role => <option key={role} value={role}>{roleNames[role][lang]}</option>)}</select></label>
    <fieldset className="team-permissions"><legend>{en ? "Permissions" : "الصلاحيات"}</legend>
      {permissionKeys.map(key => <label key={key}>
        <input type="checkbox" checked={Boolean(value.permissions[key])} disabled={!actor.permissions[key] || value.role === "owner"}
          onChange={e => {
            const permissions = { ...value.permissions };
            if (e.target.checked) permissions[key] = true;
            else delete permissions[key];
            onChange({ role: "custom", permissions });
          }} />{permissionNames[key][lang]}
      </label>)}
    </fieldset>
  </>;
}

function MemberEditor({ lang, actor, member, run, busy }: {
  lang: Lang; actor: TeamActor; member: TeamMember; run: Run; busy: boolean;
}) {
  const [value, setValue] = useState<Assignment>({ role: member.role, permissions: member.permissions });
  const en = lang === "en";
  return <details className="team-editor"><summary>{en ? "Edit access" : "تعديل الصلاحيات"}</summary>
    <form onSubmit={e => { e.preventDefault(); void run({ action: "edit", id: member.id, assignment: value }, en ? "Access saved." : "تم حفظ الصلاحيات."); }}>
      <fieldset disabled={busy} className="team-fields">
        <AssignmentFields lang={lang} actor={actor} value={value} onChange={setValue} allowOwner={actor.owner} />
        <div className="team-actions"><button>{en ? "Save access" : "حفظ الصلاحيات"}</button>
          <button type="button" className="team-secondary" onClick={() => void run({ action: "remove", id: member.id },
            en ? "Member removed." : "تمت إزالة العضو.")}>{en ? "Remove from team" : "إزالة من الفريق"}</button></div>
      </fieldset>
    </form>
  </details>;
}

function failureText(result: Extract<TeamResult, { ok: false }>, lang: Lang) {
  const error = result.error;
  if (typeof error === "object") return quotaMessage(error.resource, lang);
  const messages = {
    already_member: ["This account is already on the team.", "هذا الحساب عضو في الفريق بالفعل."],
    already_invited: ["There is already an invitation for this email.", "توجد دعوة لهذا البريد بالفعل."],
    invite_unavailable: ["This invitation is no longer active.", "لم تعد هذه الدعوة سارية."],
    last_owner: ["The store needs at least one owner.", "يجب أن يبقى للمتجر مالك واحد على الأقل."],
    restricted: ["Your role cannot make this change.", "لا تتيح لك صلاحياتك إجراء هذا التغيير."],
    invalid_permissions: ["Choose a valid role and permissions.", "اختر دوراً وصلاحيات صالحة."],
    changed: ["The active store changed. Reload the team page.", "تغيّر المتجر النشط. حدّث صفحة الفريق."],
    invalid: ["Check the email and role.", "راجع البريد الإلكتروني والدور."],
    unavailable: ["Could not save your change. Try again.", "تعذّر تنفيذ التغيير. حاول مجدداً."],
  } as const;
  return messages[error][lang === "en" ? 0 : 1];
}

export function TeamPanel({ storeId, team, actor, lang }: {
  storeId: string; team: TeamSnapshot; actor: TeamActor; lang: Lang;
}) {
  const en = lang === "en";
  const firstRole = actor.permissions.manage_orders ? "orders" : actor.permissions.manage_products ? "catalog" : "custom";
  const [assignment, setAssignment] = useState<Assignment>({ role: firstRole, permissions: preset(firstRole) });
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [manualLink, setManualLink] = useState("");
  const [busy, start] = useTransition();
  const owners = team.members.filter(m => m.role === "owner").length;
  function run(command: Command, success: string, onSuccess?: () => void) {
    setManualLink(""); setNotice("");
    start(async () => {
      try {
        const result = await changeTeam(storeId, command);
        if (!result.ok) { setNotice(failureText(result, lang)); return; }
        if (result.token) {
          const link = new URL("/invite/" + result.token, window.location.origin).href;
          try {
            await navigator.clipboard.writeText(link);
          } catch {
            setManualLink(link);
            setNotice(en ? "Select and copy the invitation link." : "حدّد رابط الدعوة وانسخه.");
            return;
          }
        }
        setNotice(success);
        onSuccess?.();
      } catch {
        setNotice(en ? "Could not complete the request. Try again." : "تعذّر إكمال الطلب. حاول مجدداً.");
      }
    });
  }
  function invite(event: FormEvent) {
    event.preventDefault();
    run({ action: "invite", email, assignment }, en ? "Invitation created. Copy its link below." : "تم إنشاء الدعوة. انسخ رابطها أدناه.", () => setEmail(""));
  }
  const seatText = limitLabel(team.used, lang) + " / " + limitLabel(team.cap, lang);
  return <>
    <section className="team-box seat-summary"><div className="team-between">
      <h2 id="team-seats">{en ? "Staff seats" : "مقاعد الفريق"}</h2><strong><bdi dir="ltr">{seatText}</bdi></strong></div>
      {team.cap === null ? <div className="team-unlimited" aria-hidden="true" /> :
        <progress aria-labelledby="team-seats" aria-valuetext={seatText} max={Math.max(team.cap, 1)}
          value={team.cap === 0 ? 1 : Math.min(team.used, team.cap)} />}
      <p>{en ? "Each staff member and unexpired invitation uses one seat. Owners have a free seat." :
        "يُحتسب مقعد لكل موظف ولكل دعوة سارية. مقاعد المالكين مجانية."}</p>
      {actor.permissions.manage_billing && <Link href="/admin/billing">{en ? "View subscription" : "عرض الاشتراك"}</Link>}
    </section>
    <div className="team-feedback" role="status" aria-live="polite">{notice}
      {manualLink && <input aria-label={en ? "Invitation link" : "رابط الدعوة"} readOnly dir="ltr" value={manualLink} onFocus={e => e.target.select()} />}
    </div>
    <section className="team-box"><h2>{en ? "Active members" : "الأعضاء الحاليون"}</h2>
      <ul className="team-list">{team.members.map(member => <li key={member.id}>
        <div className="team-between"><strong dir="auto">{member.email ?? member.id}{member.id === actor.id && <small> · {en ? "You" : "أنت"}</small>}</strong>
          <span className="team-role">{roleNames[member.role][lang]}</span></div>
        {canEditMember(actor, member, owners) && <MemberEditor key={member.role + JSON.stringify(member.permissions)} member={member}
          actor={actor} lang={lang} run={run} busy={busy} />}
      </li>)}</ul>
    </section>
    <section className="team-box"><h2>{en ? "Invite a team member" : "دعوة عضو للفريق"}</h2>
      <form onSubmit={invite}><fieldset disabled={busy} className="team-fields">
        <label>{en ? "Email address" : "البريد الإلكتروني"}<input type="email" autoComplete="off" dir="ltr" required maxLength={254}
          value={email} onChange={e => setEmail(e.target.value)} /></label>
        <AssignmentFields lang={lang} actor={actor} value={assignment} onChange={setAssignment} allowOwner={false} />
        <div><button>{en ? "Create invitation" : "إنشاء الدعوة"}</button></div>
      </fieldset></form>
    </section>
    <section className="team-box"><h2>{en ? "Pending invitations" : "الدعوات المعلّقة"}</h2>
      {team.invites.length === 0 ? <p>{en ? "No invitations awaiting a response." : "لا توجد دعوات بانتظار الرد."}</p> :
        <ul className="team-list">{team.invites.map(i => <li key={i.id}>
          <div className="team-between"><strong dir="auto">{i.email}</strong><span className="team-role">{roleNames[i.role][lang]}</span></div>
          <small>{i.expired ? (en ? "Expired" : "انتهت الصلاحية") : (en ? "Expires" : "تنتهي في")} · {inviteDate(i.expires_at, lang)} UTC</small>
          {canDelegate(actor, i) && <div className="team-actions">
            {!i.expired && <button type="button" disabled={busy} onClick={() => void run({ action: "copy", id: i.id },
              en ? "Invite link copied." : "تم نسخ رابط الدعوة.")}>{en ? "Copy invite link" : "نسخ رابط الدعوة"}</button>}
            <button type="button" className="team-secondary" disabled={busy} onClick={() => void run({ action: "regenerate", id: i.id },
              en ? "New link copied. Share it with the invitee." : "تم نسخ الرابط الجديد. شاركه مع المدعو.")}>{en ? "Regenerate link" : "تجديد الرابط"}</button>
            <button type="button" className="team-secondary" disabled={busy} onClick={() => void run({ action: "revoke", id: i.id },
              en ? "Invitation revoked." : "تم إلغاء الدعوة.")}>{en ? "Revoke" : "إلغاء الدعوة"}</button>
          </div>}
        </li>)}</ul>}
    </section>
  </>;
}
