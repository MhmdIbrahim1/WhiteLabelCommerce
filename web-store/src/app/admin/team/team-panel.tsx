"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Copy, RotateCcw } from "lucide-react";
import { DataCell, StatusDot, UsageBar, WorkspaceEmpty, WorkspaceTable } from "@/components/workspace-data";
import { WorkspaceDrawer } from "@/components/workspace-drawer";
import { QuotaPrompt } from "@/components/quota-prompt";
import { limitLabel, quotaMessage, type QuotaFailure } from "@/lib/billing";
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

function MemberEditor({ lang, actor, member, run, busy, done }: {
  lang: Lang; actor: TeamActor; member: TeamMember; run: Run; busy: boolean; done: () => void;
}) {
  const [value, setValue] = useState<Assignment>({ role: member.role, permissions: member.permissions });
  const en = lang === "en";
  return <form className="ws-form" onSubmit={e => { e.preventDefault(); void run({ action: "edit", id: member.id, assignment: value }, en ? "Access saved." : "تم حفظ الصلاحيات.", done); }}>
      <fieldset disabled={busy} className="team-fields">
        <AssignmentFields lang={lang} actor={actor} value={value} onChange={setValue} allowOwner={actor.owner} />
        <div className="team-actions"><button className="ws-primary">{en ? "Save access" : "حفظ الصلاحيات"}</button>
          <button type="button" className="ws-button ws-destructive" onClick={() => void run({ action: "remove", id: member.id },
            en ? "Member removed." : "تمت إزالة العضو.", done)}>{en ? "Remove from team" : "إزالة من الفريق"}</button></div>
      </fieldset>
    </form>;
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
  const [editing, setEditing] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaFailure | null>(null);
  const member = team.members.find(m => m.id === editing);
  const [manualLink, setManualLink] = useState("");
  const [busy, start] = useTransition();
  const owners = team.members.filter(m => m.role === "owner").length;
  function run(command: Command, success: string, onSuccess?: () => void) {
    setManualLink(""); setNotice(""); setQuota(null);
    start(async () => {
      try {
        const result = await changeTeam(storeId, command);
        if (!result.ok) {
          if (typeof result.error === "object") setQuota(result.error);
          else setNotice(failureText(result, lang));
          return;
        }
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
    run({ action: "invite", email, assignment }, en ? "Invitation created. Copy its link below." : "تم إنشاء الدعوة. انسخ رابطها أدناه.", () => { setEmail(""); setEditing(null); });
  }
  const seatText = limitLabel(team.used, lang) + " / " + limitLabel(team.cap, lang);
  const memberCols = en ? ["Member", "Role", "Access"] : ["العضو", "الدور", "الصلاحيات"];
  const inviteCols = en ? ["Recipient", "Role", "Expiry", "Actions"] : ["المدعو", "الدور", "الصلاحية", "الإجراءات"];
  const inviteLabel = en ? "Invite member" : "دعوة عضو";
  const open = (id: string) => { setNotice(""); setManualLink(""); setQuota(null); setEditing(id); };
  const feedback = <>{quota && <QuotaPrompt resource={quota.resource} lang={lang} canViewBilling={Boolean(actor.permissions.manage_billing)}
    usage={{ current: quota.current, limit: quota.limit }} />}
    <div role="status" className="team-feedback">{notice}{manualLink && <input aria-label={en ? "Invitation link" : "رابط الدعوة"}
      readOnly dir="ltr" value={manualLink} onFocus={e => e.target.select()} />}</div></>;
  return <>
    <section className="ws-box"><div className="ws-section-line"><h2>{en ? "Staff seats" : "مقاعد الفريق"}</h2>
      <strong><bdi dir="ltr">{seatText}</bdi></strong></div>
      <UsageBar used={team.used} cap={team.cap} label={en ? "Staff seats" : "مقاعد الفريق"} lang={lang} />
      <div className="ws-section-line"><small>{en ? "Staff and open invitations each use one seat. Owners have a free seat." :
        "لكل موظف أو دعوة سارية مقعد واحد. مقاعد المالكين مجانية."}</small>
        {actor.permissions.manage_billing && <Link className="ws-text-link" href="/admin/billing">{en ? "View subscription" : "عرض الاشتراك"}</Link>}</div>
    </section>
    {!editing && feedback}
    <section className="ws-sheet"><div className="ws-section-head"><h2>{en ? "Team members" : "أعضاء الفريق"}</h2>
      <button id="team-invite" type="button" className="ws-primary" aria-haspopup="dialog" onClick={() => open("invite")}><Plus size={15}/>{inviteLabel}</button></div>
      <WorkspaceTable caption={en ? "Team members" : "أعضاء الفريق"} columns={memberCols}>{team.members.map(m => <tr key={m.id} role="row">
        <DataCell><strong><bdi dir="ltr">{m.email ?? m.id}</bdi></strong>{m.id === actor.id && <small> · {en ? "You" : "أنت"}</small>}</DataCell>
        <DataCell label={memberCols[1]}><span className="ws-role">{roleNames[m.role][lang]}</span></DataCell>
        <DataCell label={memberCols[2]}>{canEditMember(actor, m, owners) ?
          <button id={"member-" + m.id} className="ws-button" type="button" aria-haspopup="dialog" onClick={() => open(m.id)}>{en ? "Edit access" : "تعديل الصلاحيات"}</button> : "—"}</DataCell>
      </tr>)}</WorkspaceTable></section>
    <section className="ws-sheet"><div className="ws-section-head"><h2>{en ? "Pending invitations" : "الدعوات المعلّقة"}</h2></div>
      {team.invites.length ? <WorkspaceTable columns={inviteCols} caption={en ? "Team invitations" : "دعوات الفريق"}>
        {team.invites.map(i => <tr key={i.id} role="row">
          <DataCell><bdi dir="ltr">{i.email}</bdi></DataCell>
          <DataCell label={inviteCols[1]}><span className="ws-role">{roleNames[i.role][lang]}</span></DataCell>
          <DataCell label={inviteCols[2]}><div className="ws-cell-stack"><StatusDot status={i.expired ? "expired" : "pending"}>
            {i.expired ? (en ? "Expired" : "منتهية") : (en ? "Awaiting acceptance" : "بانتظار القبول")}</StatusDot>
            <small><bdi dir="ltr">{inviteDate(i.expires_at, lang)} UTC</bdi></small></div></DataCell>
          <DataCell label={inviteCols[3]}>{canDelegate(actor, i) && <div className="ws-actions">
            {!i.expired && <button className="ws-button" type="button" disabled={busy} onClick={() => run({ action: "copy", id: i.id },
              en ? "Invitation link copied." : "نُسخ رابط الدعوة.")}><Copy size={13}/>{en ? "Copy" : "نسخ"}</button>}
            <button className="ws-button" type="button" disabled={busy} onClick={() => run({ action: "regenerate", id: i.id },
              en ? "New link copied. Share it with your teammate." : "نُسخ الرابط الجديد. شاركه مع زميلك.")}><RotateCcw size={13}/>{en ? "Regenerate" : "تجديد"}</button>
            <button className="ws-button ws-destructive" type="button" disabled={busy} onClick={() => run({ action: "revoke", id: i.id },
              en ? "Invitation revoked." : "أُلغيت الدعوة.")}>{en ? "Revoke" : "إلغاء"}</button></div>}</DataCell>
        </tr>)}</WorkspaceTable> : <WorkspaceEmpty title={en ? "No invitations awaiting a reply" : "لا توجد دعوات بانتظار الرد"}
          action={<button className="ws-button" type="button" onClick={() => open("invite")}>{inviteLabel}</button>}>
          {en ? "Invite a colleague and choose what they can manage." : "ادعُ زميلاً وحدّد ما يمكنه إدارته في المتجر."}</WorkspaceEmpty>}
    </section>
    {editing === "invite" && <WorkspaceDrawer title={inviteLabel} onDismiss={() => setEditing(null)} returnFocusId="team-invite">
      <form className="ws-form" onSubmit={invite}><fieldset disabled={busy} className="team-fields">
        <label>{en ? "Email address" : "البريد الإلكتروني"}<input type="email" autoComplete="off" dir="ltr" required maxLength={254}
          value={email} onChange={e => setEmail(e.target.value)} /></label>
        <AssignmentFields lang={lang} actor={actor} value={assignment} onChange={setAssignment} allowOwner={false} />
        <button className="ws-primary">{en ? "Create invitation" : "إنشاء الدعوة"}</button></fieldset>{feedback}</form></WorkspaceDrawer>}
    {member && canEditMember(actor, member, owners) && <WorkspaceDrawer key={member.id} title={en ? "Member access" : "صلاحيات العضو"}
      subtitle={<bdi dir="ltr">{member.email ?? member.id}</bdi>} onDismiss={() => setEditing(null)} returnFocusId={"member-" + member.id}>
      <MemberEditor member={member} actor={actor} lang={lang} run={run} busy={busy} done={() => setEditing(null)}/>{feedback}</WorkspaceDrawer>}
  </>;
}
