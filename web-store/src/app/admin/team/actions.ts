"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/db";
import { quotaFailure, type QuotaFailure } from "@/lib/billing";
import { canDelegate, canEditMember, normalizeInviteEmail, readAssignment, validInviteToken, type Assignment,
  type TeamActor, type TeamSnapshot } from "@/lib/team";

const knownErrors = ["already_member", "already_invited", "invite_unavailable", "last_owner", "invalid_permissions"] as const;
type TeamError = (typeof knownErrors)[number] | "invalid" | "changed" | "restricted" | "unavailable";
export type TeamResult = { ok: true; token?: string } | { ok: false; error: TeamError | QuotaFailure };
type Command = { action: "invite"; email: string; assignment: Assignment }
  | { action: "edit"; id: string; assignment: Assignment }
  | { action: "remove" | "copy" | "revoke" | "regenerate"; id: string };

function failure(error: { code: string; message: string; details: string }): TeamResult {
  const quota = quotaFailure(error);
  if (quota) return { ok: false, error: quota };
  if (error.code === "42501") return { ok: false, error: "restricted" };
  return { ok: false, error: knownErrors.find(code => code === error.message) ?? "unavailable" };
}

export async function changeTeam(expectedStore: string, command: Command): Promise<TeamResult> {
  const { db, storeId, permissions, owner, user } = await requireAdmin("manage_staff");
  if (storeId !== expectedStore) return { ok: false, error: "changed" };
  if (!command || typeof command !== "object") return { ok: false, error: "invalid" };
  const actor: TeamActor = { id: user.id, owner, permissions };
  const assignment = "assignment" in command ? readAssignment(command.assignment?.role, command.assignment?.permissions) : null;
  if (command.action === "edit" || command.action === "invite") {
    if (!assignment) return { ok: false, error: "invalid_permissions" };
    if (!canDelegate(actor, assignment)) return { ok: false, error: "restricted" };
  }
  const fields = { p_role: assignment?.role ?? null, p_permissions: assignment?.permissions ?? null };
  let token: string | undefined;
  if (command.action === "invite") {
    const email = typeof command.email === "string" && normalizeInviteEmail(command.email);
    if (!email || assignment?.role === "owner") return { ok: false, error: "invalid" };
    const result = await db.rpc("team_invite", { p_store: storeId, p_email: email, ...fields });
    if (result.error) return failure(result.error);
  } else {
    if (typeof command.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(command.id)) {
      return { ok: false, error: "invalid" };
    }
    const { data, error } = await db.rpc("get_store_team", { p_store: storeId });
    if (error) return failure(error);
    const team = data as TeamSnapshot;
    if (command.action === "edit" || command.action === "remove") {
      const member = team.members.find(m => m.id === command.id);
      if (!member || !canEditMember(actor, member, team.members.filter(m => m.role === "owner").length)) {
        return { ok: false, error: "restricted" };
      }
      const result = await db.rpc("team_edit_member", { p_store: storeId, p_user: command.id,
        p_role: command.action === "edit" ? fields.p_role : null,
        p_permissions: command.action === "edit" ? fields.p_permissions : null });
      if (result.error) return failure(result.error);
    } else {
      if (!["copy", "regenerate", "revoke"].includes(command.action)) return { ok: false, error: "invalid" };
      const invite = team.invites.find(i => i.id === command.id);
      if (!invite || !canDelegate(actor, invite)) return { ok: false, error: "restricted" };
      const result = await db.rpc("team_invite_link", { p_store: storeId, p_id: command.id, p_action: command.action });
      if (result.error) return failure(result.error);
      if (command.action !== "revoke") {
        if (!validInviteToken(result.data)) return { ok: false, error: "unavailable" };
        token = result.data;
      }
    }
  }
  if (command.action !== "copy") revalidatePath("/admin", "layout");
  return { ok: true, token };
}
