"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverDb } from "@/lib/db";
import { adminUser, superAdminUser } from "@/lib/access";
import { normalizePhone } from "@/lib/phone";
import { safeRelativePath } from "@/lib/security";
import { resolveActiveStoreOrDefault, storeHref } from "@/lib/tenant";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^[0-9]{6}$/;

function safeNext(raw: FormDataEntryValue | string | null | undefined): string {
  return safeRelativePath(raw, "");
}

async function syncProfileForUser(
  db: Awaited<ReturnType<typeof serverDb>>,
  overrides?: {
    fullName?: string;
    phone?: string;
    governorate?: string;
    city?: string;
    address?: string;
  },
) {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return;
  const meta = user.user_metadata ?? {};
  const metaName =
    typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const metaPhone =
    typeof meta.phone === "string" ? normalizePhone(meta.phone) : "";

  const store = await resolveActiveStoreOrDefault();

  await db
    .rpc("sync_customer_profile", {
      p_full_name: overrides?.fullName ?? metaName,
      p_phone: overrides?.phone ?? metaPhone,
      p_city: overrides?.city ?? "",
      p_address: overrides?.address ?? "",
      p_governorate: overrides?.governorate ?? "",
      p_store_id: store.id,
    })
    .then(
      () => {},
      () => {},
    );
}

async function resolvePostAuthRedirect(
  db: Awaited<ReturnType<typeof serverDb>>,
  nextPath: string,
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
  if (nextPath.startsWith("/admin")) return "/account?notice=customer_only";
  return nextPath || "/account";
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
    | "signup"
    | "otp_send_failed";
  needsConfirmation?: boolean;
  redirectTo?: string;
  retryAfterSeconds?: number;
};

export async function sendEmailOtpAction(
  emailRaw: string,
): Promise<AuthActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, errorCode: "invalid_email" };
  }

  const db = await serverDb();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (
      error.status === 429 ||
      msg.includes("rate limit") ||
      msg.includes("security purposes") ||
      msg.includes("only request this after")
    ) {
      return { ok: false, errorCode: "rate_limit", retryAfterSeconds: 60 };
    }
    return { ok: false, errorCode: "otp_send_failed" };
  }

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

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("expired")) {
      return { ok: false, errorCode: "otp_expired" };
    }
    if (error.status === 429 || msg.includes("rate limit")) {
      return { ok: false, errorCode: "rate_limit" };
    }
    return { ok: false, errorCode: "invalid_otp" };
  }

  await syncProfileForUser(db);
  revalidatePath("/", "layout");
  const redirectTo = await resolvePostAuthRedirect(db, next);
  return { ok: true, redirectTo };
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
  if (password.length < 6) {
    return { ok: false, errorCode: "password" };
  }

  const db = await serverDb();
  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (
      error.code === "email_not_confirmed" ||
      msg.includes("not confirmed")
    ) {
      return { ok: false, errorCode: "unconfirmed" };
    }
    if (error.status === 429 || msg.includes("rate limit")) {
      return { ok: false, errorCode: "rate_limit" };
    }
    return { ok: false, errorCode: "credentials" };
  }

  await syncProfileForUser(db);
  revalidatePath("/", "layout");
  const redirectTo = await resolvePostAuthRedirect(db, next);
  return { ok: true, redirectTo };
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
  const phone = normalizePhone(input.phone);
  const password = input.password;
  const next = safeNext(input.nextPath);

  if (fullName.length < 2 || fullName.length > 100) {
    return { ok: false, errorCode: "name" };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, errorCode: "invalid_email" };
  }
  if (!/^[0-9]{8,15}$/.test(phone)) {
    return { ok: false, errorCode: "phone" };
  }
  if (password.length < 6) {
    return { ok: false, errorCode: "password" };
  }

  const db = await serverDb();
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
    },
  });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (error.status === 429 || msg.includes("rate limit")) {
      return { ok: false, errorCode: "rate_limit" };
    }
    return { ok: false, errorCode: "signup" };
  }

  if (data.session) {
    await syncProfileForUser(db, { fullName, phone });
    revalidatePath("/", "layout");
    const redirectTo = await resolvePostAuthRedirect(db, next);
    return { ok: true, redirectTo };
  }

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

export async function register(form: FormData) {
  const fullName = String(form.get("full_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  const nextSuffix = next ? "&next=" + encodeURIComponent(next) : "";

  const res = await signUpWithPasswordAction({
    fullName,
    phone,
    email,
    password,
    nextPath: next,
  });

  if (!res.ok) {
    redirect(`/register?error=${res.errorCode ?? "signup"}${nextSuffix}`);
  }
  if (res.redirectTo) {
    redirect(res.redirectTo);
  }
  redirect("/login?registered=confirm" + nextSuffix);
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
