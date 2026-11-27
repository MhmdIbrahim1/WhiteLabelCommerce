"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { serverDb } from "@/lib/db";
import { postAuthDestination } from "@/lib/auth-destination";
import { normalizePhone } from "@/lib/phone";
import { normalizeOtp, validOtp, RESEND_SECONDS } from "@/lib/email-otp";
import { authEntry, authErrorCode, safeAuthNext, validEmail, verifiedEmailUser, type AuthErrorCode } from "@/lib/auth-flow";
import { ADMIN_STORE_COOKIE, resolveActiveStore, resolveActiveStoreOrDefault, storeHref } from "@/lib/tenant";

export type AuthActionResult = {
  ok: boolean; errorCode?: AuthErrorCode; needsConfirmation?: boolean; redirectTo?: string; retryAfterSeconds?: number;
};

function failure(error: Parameters<typeof authErrorCode>[0], fallback?: AuthErrorCode): AuthActionResult {
  const errorCode = authErrorCode(error, fallback);
  return { ok: false, errorCode, ...(errorCode === "rate_limit" && { retryAfterSeconds: RESEND_SECONDS }) };
}

async function finishSignIn(db: Awaited<ReturnType<typeof serverDb>>, nextRaw: unknown, email: string, sessionUserId?: string): Promise<AuthActionResult> {
  if (!sessionUserId) return { ok: false, errorCode: "unconfirmed" };
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !verifiedEmailUser(user) || user.id !== sessionUserId || user.email.toLowerCase() !== email) {
    return { ok: false, errorCode: "unconfirmed" };
  }
  const store = await resolveActiveStore();
  if (!store) return { ok: false, errorCode: "server" };
  const next = safeAuthNext(nextRaw, store.basePath, store.slug);
  revalidatePath("/", "layout");
  if (/^\/invite\/[a-f0-9]{64}$/.test(next)) return { ok: true, redirectTo: next };
  const account = storeHref(store.basePath, "/account");
  const { data, error } = await db.rpc("initialize_customer_profile", { p_store_id: store.id });
  if (error || data === "phone_unavailable") {
    if (error) console.error("Customer profile initialization failed", error.code);
    if (!next) return { ok: true, redirectTo: account + "?result=" + (error ? "profile_setup" : "phone_unavailable") };
  }
  return { ok: true, redirectTo: await postAuthDestination(db, user, next, account) };
}

export async function sendEmailOtpAction(emailRaw: string, purpose: "signin" | "signup" = "signin"): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, errorCode: "invalid_email" };
  const db = await serverDb();
  const { error } = purpose === "signup"
    ? await db.auth.resend({ type: "signup", email })
    : await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  // Use the same delivery notice for a missing, existing or already-confirmed address.
  if (error && !["user_not_found", "otp_disabled", "user_already_exists", "email_exists", "email_address_not_confirmed"].includes(error.code ?? "")) {
    return failure(error);
  }
  return { ok: true, retryAfterSeconds: RESEND_SECONDS };
}

export async function verifyEmailOtpAction(emailRaw: string, tokenRaw: string, nextRaw?: string, purpose: "signin" | "signup" = "signin"): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, errorCode: "invalid_email" };
  if (!validOtp(tokenRaw)) return { ok: false, errorCode: "invalid_otp" };
  const db = await serverDb();
  const { data, error } = await db.auth.verifyOtp({ email, token: normalizeOtp(tokenRaw), type: purpose === "signup" ? "signup" : "magiclink" });
  if (error) return failure(error, "invalid_otp");
  return finishSignIn(db, nextRaw, email, data.session?.user.id);
}

export async function signInWithPasswordAction(emailRaw: string, password: string, nextRaw?: string): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, errorCode: "invalid_email" };
  if (!password) return { ok: false, errorCode: "credentials" };
  const db = await serverDb();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return failure(error);
  return finishSignIn(db, nextRaw, email, data.session?.user.id);
}

export async function signUpWithPasswordAction(input: {
  fullName: string; phone: string; email: string; password: string; nextPath?: string;
}): Promise<AuthActionResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone).replace(/^0020/, "20").replace(/^200?(1[0125][0-9]{8})$/, "0$1");
  if (fullName.length < 2 || fullName.length > 100) return { ok: false, errorCode: "name" };
  if (!validEmail(email)) return { ok: false, errorCode: "invalid_email" };
  if (!/^01[0125][0-9]{8}$/.test(phone)) return { ok: false, errorCode: "phone" };
  if (input.password.length < 6) return { ok: false, errorCode: "password" };
  const [db, store] = await Promise.all([serverDb(), resolveActiveStore()]);
  if (!store) return { ok: false, errorCode: "server" };
  const { data, error } = await db.auth.signUp({ email, password: input.password,
    options: { data: { full_name: fullName, phone, signup_store_id: store.id } } });
  const pending = { ok: true, needsConfirmation: true, retryAfterSeconds: RESEND_SECONDS };
  if (error) return ["user_already_exists", "email_exists"].includes(error.code ?? "") ? pending : failure(error);
  if (!data.session || !verifiedEmailUser(data.user) || data.user.identities?.length === 0 ||
      data.user.id !== data.session.user.id) return pending;
  return finishSignIn(db, input.nextPath, email, data.session.user.id);
}

export async function signUpWithCodeAction(input: { fullName: string; phone: string; email: string; nextPath?: string }) {
  // Supabase's OTP sign-in endpoint would also sign in an existing account. Keep registration on the signup endpoint.
  return signUpWithPasswordAction({ ...input, password: crypto.randomUUID() + crypto.randomUUID() });
}

export async function login(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const store = await resolveActiveStoreOrDefault();
  const next = safeAuthNext(form.get("next"), store.basePath, store.slug);
  const res = await signInWithPasswordAction(email, password, next);
  if (!res.ok) {
    const href = authEntry(store.basePath, "/login", next);
    redirect(href + (next ? "&" : "?") + "error=" + (res.errorCode ?? "credentials"));
  }
  redirect(res.redirectTo || storeHref(store.basePath, "/account"));
}

export async function endSessionAction(form?: FormData): Promise<{ ok: true; redirectTo: string } | { ok: false }> {
  const [db, store, jar] = await Promise.all([serverDb(), resolveActiveStore(), cookies()]);
  const { error } = await db.auth.signOut({ scope: "local" });
  if (error) return { ok: false };
  for (const { name } of jar.getAll()) {
    if (name === ADMIN_STORE_COOKIE || /^wlc_(?:order|receipt)_/.test(name)) jar.delete(name);
  }
  revalidatePath("/", "layout");
  if (form?.get("switchAccount") === "1") {
    const next = safeAuthNext(form.get("next"), "") || "/create-store";
    return { ok: true, redirectTo: authEntry("", "/register", next) };
  }
  return { ok: true, redirectTo: storeHref(store?.basePath ?? "", "/") };
}

export async function logout(form?: FormData) {
  const result = await endSessionAction(form);
  if (!result.ok) throw new Error("تعذّر تسجيل الخروج. Sign out failed.");
  redirect(result.redirectTo);
}

export async function saveCustomerAccount(form: FormData) {
  const [db, store] = await Promise.all([
    serverDb(),
    resolveActiveStoreOrDefault(),
  ]);
  const accountBase = storeHref(store.basePath, "/account");
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(accountBase);

  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 100);
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const governorate = String(form.get("governorate") ?? "").trim().slice(0, 80);
  const city = String(form.get("city") ?? "").trim().slice(0, 80);
  const address = String(form.get("address") ?? "").trim().slice(0, 500);

  if (phone && !/^[0-9]{8,15}$/.test(phone)) {
    redirect(storeHref(store.basePath, "/account?result=phone_error"));
  }

  const { error } = await db.rpc("sync_customer_profile", {
    p_full_name: fullName,
    p_phone: phone,
    p_city: city,
    p_address: address,
    p_governorate: governorate,
    p_store_id: store.id,
  });

  revalidatePath(accountBase);
  revalidatePath("/account");
  revalidatePath(storeHref(store.basePath, "/checkout"));
  revalidatePath("/checkout");
  revalidatePath(storeHref(store.basePath, "/orders"));
  revalidatePath("/orders");
  const isPhoneUsed = error?.message?.includes("phone_already_in_use");
  redirect(
    storeHref(
      store.basePath,
      "/account?result=" +
        (error ? (isPhoneUsed ? "phone_in_use" : "error") : "saved"),
    ),
  );
}
