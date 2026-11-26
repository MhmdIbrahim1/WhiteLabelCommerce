"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { adminUser, superAdminUser } from "@/lib/access";
import { normalizePhone } from "@/lib/phone";
import { safeRelativePath } from "@/lib/security";
import { resolveActiveStore, resolveActiveStoreOrDefault, storeHref } from "@/lib/tenant";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^[0-9]{6,10}$/;

function safeNext(raw: FormDataEntryValue | string | null | undefined): string {
  return safeRelativePath(raw, "");
}

async function resolvePostAuthRedirect(
  db: Awaited<ReturnType<typeof serverDb>>,
  nextPath: string,
  account: string,
): Promise<string> {
  const [isAdmin, isSuper] = await Promise.all([
    adminUser(db).then(Boolean),
    superAdminUser(db).then(Boolean),
  ]);
  if (nextPath.startsWith("/super-admin")) {
    return isSuper ? nextPath : "/";
  }
  if (nextPath.startsWith("/create-store")) {
    return nextPath;
  }
  if (isAdmin) return nextPath || "/admin";
  if (nextPath.startsWith("/admin")) return account + "?notice=customer_only";
  return nextPath || account;
}

export type AuthActionResult = {
  ok: boolean;
  errorCode?:
    | "invalid_email"
    | "invalid_otp"
    | "otp_expired"
    | "rate_limit"
    | "unconfirmed"
    | "credentials"
    | "name"
    | "phone"
    | "password"
    | "duplicate_email"
    | "signup_disabled"
    | "network"
    | "server"
    | "weak_password"
    | "otp_send_failed";
  needsConfirmation?: boolean;
  redirectTo?: string;
  retryAfterSeconds?: number;
};

function authFailure(error: { code?: string; status?: number; name?: string; message: string }): AuthActionResult {
  if (error.status === 429 || error.code?.includes("rate_limit")) {
    return { ok: false, errorCode: "rate_limit", retryAfterSeconds: 60 };
  }
  const codes = {
    user_already_exists: "duplicate_email",
    email_exists: "duplicate_email",
    weak_password: "weak_password",
    email_address_invalid: "invalid_email",
    email_address_not_authorized: "otp_send_failed",
    signup_disabled: "signup_disabled",
    email_provider_disabled: "signup_disabled",
    email_not_confirmed: "unconfirmed",
    invalid_credentials: "credentials",
    otp_expired: "otp_expired",
  } as const;
  const code = codes[error.code as keyof typeof codes];
  if (code) return { ok: false, errorCode: code };
  if (/sending .*email/i.test(error.message)) return { ok: false, errorCode: "otp_send_failed" };
  if (!error.status || (error.name === "AuthRetryableFetchError" && /fetch|network/i.test(error.message))) {
    return { ok: false, errorCode: "network" };
  }
  console.error("Customer authentication failed", error.code, error.status);
  return { ok: false, errorCode: "server" };
}

async function finishSignIn(db: Awaited<ReturnType<typeof serverDb>>, next: string): Promise<AuthActionResult> {
  const store = await resolveActiveStore();
  if (!store) return { ok: false, errorCode: "server" };
  const account = storeHref(store.basePath, "/account");
  const { data, error } = await db.rpc("initialize_customer_profile", { p_store_id: store.id });
  revalidatePath("/", "layout");
  if (error || data === "phone_unavailable") {
    if (error) console.error("Customer profile initialization failed", error.code);
    return { ok: true, redirectTo: account + "?result=" + (error ? "profile_setup" : "phone_unavailable") };
  }
  return { ok: true, redirectTo: await resolvePostAuthRedirect(db, next, account) };
}

export async function sendEmailOtpAction(
  emailRaw: string,
): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, errorCode: "invalid_email" };
  }

  const [db, store] = await Promise.all([serverDb(), resolveActiveStore()]);
  if (!store) return { ok: false, errorCode: "server" };
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { signup_store_id: store.id } },
  });

  if (error) return authFailure(error);

  return { ok: true, retryAfterSeconds: 60 };
}

export async function verifyEmailOtpAction(
  emailRaw: string,
  tokenRaw: string,
  nextRaw?: string,
): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  const token = tokenRaw.replace(/\D/g, "").trim();
  const next = safeNext(nextRaw);

  if (!EMAIL_RE.test(email)) {
    return { ok: false, errorCode: "invalid_email" };
  }
  if (!OTP_RE.test(token)) {
    return { ok: false, errorCode: "invalid_otp" };
  }

  const db = await serverDb();
  const { error } = await db.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) return authFailure(error);

  return finishSignIn(db, next);
}

export async function signInWithPasswordAction(
  emailRaw: string,
  password: string,
  nextRaw?: string,
): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  const next = safeNext(nextRaw);

  if (!EMAIL_RE.test(email)) {
    return { ok: false, errorCode: "invalid_email" };
  }
  if (!password) {
    return { ok: false, errorCode: "credentials" };
  }

  const db = await serverDb();
  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) return authFailure(error);

  return finishSignIn(db, next);
}

export async function signUpWithPasswordAction(input: {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  nextPath?: string;
}): Promise<AuthActionResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone)
    .replace(/^0020/, "20")
    .replace(/^200?(1[0125][0-9]{8})$/, "0$1");
  const password = input.password;
  const next = safeNext(input.nextPath);

  if (fullName.length < 2 || fullName.length > 100) {
    return { ok: false, errorCode: "name" };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, errorCode: "invalid_email" };
  }
  if (!/^01[0125][0-9]{8}$/.test(phone)) {
    return { ok: false, errorCode: "phone" };
  }
  if (password.length < 6) {
    return { ok: false, errorCode: "password" };
  }

  const db = await serverDb();
  const store = await resolveActiveStore();
  if (!store) return { ok: false, errorCode: "server" };
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, signup_store_id: store.id },
    },
  });

  if (error) return authFailure(error);

  if (data.session) return finishSignIn(db, next);

  return { ok: true, needsConfirmation: true };
}

export async function login(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const res = await signInWithPasswordAction(email, password, next);
  if (!res.ok) {
    redirect(
      `/login?error=${res.errorCode ?? "credentials"}` +
        (next ? "&next=" + encodeURIComponent(next) : ""),
    );
  }
  redirect(res.redirectTo || "/account");
}

export async function logout() {
  const db = await serverDb();
  const { error } = await db.auth.signOut({ scope: "local" });
  if (error) throw new Error("تعذر تسجيل الخروج.");
  revalidatePath("/", "layout");
  redirect("/");
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
