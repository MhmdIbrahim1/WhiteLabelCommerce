import { safeRelativePath } from "./security.ts";
import { storePath } from "./host-routing.ts";
import { storeHref } from "./tenant-shared.ts";
import { normalizePhone } from "./phone.ts";

export const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validTokenHash = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{32,256}$/.test(value);

export function verifiedEmailUser<T extends { id: string; email?: string; email_confirmed_at?: string }>(
  user: T | null | undefined,
): user is T & { email: string } {
  return Boolean(user?.id && user.email && user.email_confirmed_at);
}

export function safeAuthNext(raw: unknown, basePath: string, slug?: string): string {
  const safe = safeRelativePath(raw);
  if (!safe) return "";
  const { pathname, search, hash } = new URL(safe, "https://internal.invalid");
  const alias = storePath(pathname);
  if (alias === "invalid" || (alias && alias.slug !== (slug || basePath.split("/")[2]))) return "";
  const path = alias ? alias.pathname : pathname;
  if (/^\/(?:login|register|auth|forgot-password|reset-password|api|platform-access|platform-redirect|platform-landing|_next)(?:\/|$)/i.test(path)) return "";
  return storeHref(basePath, path) + search + hash;
}

export function authEntry(basePath: string, route: "/login" | "/register" | "/forgot-password", next?: string) {
  const path = safeAuthNext(next, basePath);
  return basePath + route + (path ? "?next=" + encodeURIComponent(path) : "");
}

export function safeStorefrontNext(raw: unknown, basePath: string, slug?: string) {
  const safe = safeAuthNext(raw, basePath, slug);
  if (!safe) return "";
  const pathname = new URL(safe, "https://internal.invalid").pathname;
  const alias = storePath(pathname);
  if (alias === "invalid") return "";
  const path = alias ? alias.pathname : pathname;
  return /^\/(?:$|(?:account|cart|checkout|contact|orders|products|support|wishlist)(?:\/|$))/.test(path) ? safe : "";
}

export function welcomeHref(basePath: string, safeNext = "") {
  return storeHref(basePath, "/welcome") + (safeNext ? "?next=" + encodeURIComponent(safeNext) : "");
}

export function onboardingProfile(nameRaw: string, phoneRaw: string) {
  const fullName = nameRaw.trim();
  const phone = normalizePhone(phoneRaw).replace(/^0020/, "20").replace(/^200?(1[0125][0-9]{8})$/, "0$1");
  if (Array.from(fullName).length < 2 || Array.from(fullName).length > 100) return { errorCode: "name" } as const;
  if (phoneRaw.trim() && !/^01[0125][0-9]{8}$/.test(phone)) return { errorCode: "phone" } as const;
  return { fullName, phone } as const;
}

export function recoveryRedirect(origin: string | null, basePath: string) {
  if (!origin || !URL.canParse(origin)) return null;
  if (basePath) {
    const alias = storePath(basePath);
    if (!alias || alias === "invalid" || alias.basePath !== basePath) return null;
  }
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== "https:" && !(url.protocol === "http:" &&
      /^(?:localhost|[a-z0-9-]+\.localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)))) return null;
  return origin + basePath + "/auth/confirm";
}

const messages = {
  account_changed: ["Your account changed. Reload this page to review the signed-in email.", "تغيّر الحساب. أعد تحميل الصفحة لمراجعة البريد المسجّل."],
  oauth_cancelled: ["Google sign-in was cancelled. You can try again.", "ألغيت تسجيل الدخول باستخدام Google. يمكنك المحاولة مجدداً."],
  oauth_failed: ["Google sign-in could not be completed. Try again or use an email code.", "تعذّر إكمال تسجيل الدخول باستخدام Google. حاول مجدداً أو استخدم رمز البريد."],
  phone_already_in_use: ["This phone is already linked to an account at this store.", "هذا الرقم مرتبط بالفعل بحساب في هذا المتجر."],
  invalid_email: ["Enter a valid email address.", "أدخل بريداً إلكترونياً صحيحاً."],
  invalid_otp: ["Check the six digits and the email address, or request a new code.", "تحقق من الأرقام الستة وعنوان البريد، أو اطلب رمزاً جديداً."],
  otp_expired: ["This code or link is invalid, expired or already used. Request a new one.", "الرمز أو الرابط غير صحيح، أو انتهت صلاحيته، أو سبق استخدامه. اطلب رمزاً جديداً."],
  invalid_link: ["This link is incomplete or no longer valid. Request a new code.", "الرابط غير مكتمل أو لم يعد صالحاً. اطلب رمزاً جديداً."],
  rate_limit: ["Please wait a minute before trying again.", "انتظر دقيقة قبل المحاولة مجدداً."],
  unconfirmed: ["Confirm your email with the code in your inbox.", "أكّد بريدك بالرمز المرسل إليك."],
  credentials: ["Check your email and password, then try again.", "تحقق من البريد وكلمة المرور ثم أعد المحاولة."],
  name: ["Enter your full name (2–100 characters).", "أدخل اسمك الكامل (من حرفين إلى ١٠٠ حرف)."],
  phone: ["Enter a valid Egyptian mobile number.", "أدخل رقم موبايل مصرياً صحيحاً."],
  password: ["Use at least 6 characters for your password.", "أدخل كلمة مرور من ٦ أحرف على الأقل."],
  weak_password: ["Choose a stronger, different password.", "اختر كلمة مرور جديدة أقوى."],
  password_mismatch: ["The two passwords must match.", "يجب أن تتطابق كلمتا المرور."],
  password_length: ["Use 8 to 128 characters for your new password.", "أدخل كلمة مرور جديدة من ٨ إلى ١٢٨ حرفاً."],
  signup_disabled: ["Account registration is currently unavailable.", "إنشاء الحسابات غير متاح حالياً."],
  otp_send_failed: ["Email delivery failed. Try again shortly.", "تعذّر إرسال البريد. حاول مجدداً بعد قليل."],
  network: ["Check your connection and try again.", "تحقق من اتصالك بالإنترنت ثم أعد المحاولة."],
  server: ["The account service is unavailable. Please try again.", "خدمة الحسابات غير متاحة حالياً. حاول مرة أخرى."],
} as const;
export type AuthErrorCode = keyof typeof messages;

export function authMessage(code: string, en: boolean) {
  const key = Object.hasOwn(messages, code) ? code as AuthErrorCode : "server";
  return messages[key][en ? 0 : 1];
}

export function authErrorCode(error: { code?: string; status?: number; message?: string }, fallback: AuthErrorCode = "server"): AuthErrorCode {
  if (error.status === 429 || error.code?.includes("rate_limit")) return "rate_limit";
  switch (error.code) {
    case "otp_expired": case "flow_state_expired": return "otp_expired";
    case "otp_disabled": case "invalid_otp": case "bad_code_verifier": case "validation_failed": return fallback === "invalid_link" ? fallback : "invalid_otp";
    case "flow_state_not_found": case "bad_jwt": return "invalid_link";
    case "email_address_invalid": return "invalid_email";
    case "email_address_not_authorized": return "otp_send_failed";
    case "weak_password": case "same_password": return "weak_password";
    case "signup_disabled": case "email_provider_disabled": return "signup_disabled";
    case "email_not_confirmed": return "unconfirmed";
    case "invalid_credentials": return "credentials";
  }
  if (/sending .*email/i.test(error.message ?? "")) return "otp_send_failed";
  if (!error.status) return "network";
  return error.status >= 500 ? "server" : fallback;
}
