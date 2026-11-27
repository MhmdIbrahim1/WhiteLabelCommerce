"use server";

import { revalidatePath } from "next/cache";
import { authErrorCode, onboardingProfile, safeStorefrontNext, validEmail, verifiedEmailUser } from "@/lib/auth-flow";
import { normalizeOtp, RESEND_SECONDS, validOtp } from "@/lib/email-otp";
import { serverDb } from "@/lib/db";
import { authStorefront, storefrontDestination } from "@/lib/storefront-auth";
import { storeHref } from "@/lib/tenant-shared";
import type { AuthActionResult } from "./actions";

export async function sendStorefrontEmailOtpAction(emailRaw: string): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, errorCode: "invalid_email" };
  const store = await authStorefront();
  if (!store) return { ok: false, errorCode: "server" };
  const db = await serverDb();
  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: { signup_store_id: store.id } } });
  if (error) {
    const errorCode = authErrorCode(error, "otp_send_failed");
    return { ok: false, errorCode, ...(errorCode === "rate_limit" && { retryAfterSeconds: RESEND_SECONDS }) };
  }
  return { ok: true, retryAfterSeconds: RESEND_SECONDS };
}

export async function verifyStorefrontEmailOtpAction(emailRaw: string, tokenRaw: string, nextRaw: string): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, errorCode: "invalid_email" };
  if (!validOtp(tokenRaw)) return { ok: false, errorCode: "invalid_otp" };
  const store = await authStorefront();
  if (!store) return { ok: false, errorCode: "server" };
  const db = await serverDb();
  const { data, error } = await db.auth.verifyOtp({ email, token: normalizeOtp(tokenRaw), type: "email" });
  if (error) return { ok: false, errorCode: authErrorCode(error, "invalid_otp") };
  if (!verifiedEmailUser(data.user) || data.session?.user.id !== data.user.id || data.user.email.toLowerCase() !== email) {
    return { ok: false, errorCode: "unconfirmed" };
  }
  const next = safeStorefrontNext(nextRaw, store.basePath, store.slug);
  const redirectTo = await storefrontDestination(db, store.id, store.basePath, next);
  revalidatePath("/", "layout");
  return { ok: true, redirectTo };
}

export async function completeStoreOnboardingAction(name: string, phone: string, nextRaw: string, expectedUserId: string): Promise<AuthActionResult> {
  const profile = onboardingProfile(name, phone);
  if (profile.errorCode) return { ok: false, errorCode: profile.errorCode };
  const store = await authStorefront();
  if (!store) return { ok: false, errorCode: "server" };
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  if (!verifiedEmailUser(user)) return { ok: false, errorCode: "unconfirmed" };
  if (user.id !== expectedUserId) return { ok: false, errorCode: "account_changed" };
  const { error } = await db.rpc("complete_store_customer_onboarding", {
    p_store_id: store.id, p_full_name: profile.fullName, p_phone: profile.phone,
  });
  if (error) {
    const code = { invalid_name: "name", invalid_phone: "phone", phone_already_in_use: "phone_already_in_use" } as const;
    return { ok: false, errorCode: code[error.message as keyof typeof code] ?? "server" };
  }
  revalidatePath("/", "layout");
  return { ok: true, redirectTo: safeStorefrontNext(nextRaw, store.basePath, store.slug) || storeHref(store.basePath, "/account") };
}
