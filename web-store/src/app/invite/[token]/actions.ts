"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { quotaFailure, type QuotaFailure } from "@/lib/billing";
import { ADMIN_STORE_COOKIE } from "@/lib/tenant-shared";
import { validInviteToken } from "@/lib/team";

export type AcceptanceResult = QuotaFailure | "member" | "changed" | null;

export async function acceptInvitation(token: string): Promise<AcceptanceResult> {
  if (!validInviteToken(token)) redirect("/invite/invalid");
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  const path = "/invite/" + token;
  if (!user) redirect(path);
  const { data: preview } = await db.rpc("team_invite_preview", { p_token: token });
  if (preview?.account !== "ready") redirect(path);
  const { data: storeId, error } = await db.rpc("team_accept_invite", { p_token: token });
  if (error || typeof storeId !== "string") {
    return quotaFailure(error) ?? (error?.message === "already_member" ? "member" : "changed");
  }
  (await cookies()).set(ADMIN_STORE_COOKIE, storeId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/admin", "layout");
  redirect("/admin");
}
