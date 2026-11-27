import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { adminUser, superAdminUser } from "@/lib/access";
import { verifiedEmailUser } from "@/lib/auth-flow";
import { requestUser, serverDb } from "@/lib/db";

// Callers pass only the sanitized return path from the current tenant.
export async function postAuthDestination(db: SupabaseClient, user: User, next: string, account: string) {
  if (/^\/super-admin(?:[/?#]|$)/.test(next)) return (await superAdminUser(db, user)) ? next : "/";
  if (next && !/^\/admin(?:[/?#]|$)/.test(next)) return next;
  if (await adminUser(db, undefined, user)) return next || "/admin";
  return next ? account + "?notice=customer_only" : account;
}

export async function continueSignedInLogin(next: string, account: string) {
  const user = await requestUser();
  if (verifiedEmailUser(user)) redirect(await postAuthDestination(await serverDb(), user, next, account));
}
