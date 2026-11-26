import type { Lang } from "./i18n";

export const planCodes = ["starter", "pro", "business"] as const;
export const quotaKeys = ["max_products", "max_monthly_orders", "max_monthly_apk_builds"] as const;
export const cycles = ["monthly", "annual"] as const;
export const subscriptionStatuses = ["trialing", "active", "past_due", "canceled"] as const;
export type PlanCode = (typeof planCodes)[number];
export type QuotaKey = (typeof quotaKeys)[number];
export type BillingCycle = (typeof cycles)[number];
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type Entitlements = Record<QuotaKey, number | null> & { custom_domains_enabled: boolean };
export type QuotaOverrides = Partial<Entitlements>;
export type Plan = Entitlements & {
  code: PlanCode; name_ar: string; name_en: string; description_ar: string; description_en: string;
  monthly_price_egp: number; annual_price_egp: number; trial_days: number;
  sort_order: number; is_active: boolean; revision: number;
};
export type Subscription = {
  store_id: string; plan_code: PlanCode; billing_cycle: BillingCycle; status: SubscriptionStatus;
  trial_ends_at: string | null; current_period_start: string; current_period_end: string;
  quota_overrides: QuotaOverrides; admin_notes: string | null; revision: number;
};
export type StoreBilling = Pick<Subscription, "billing_cycle" | "status" | "trial_ends_at" | "current_period_start" | "current_period_end" | "quota_overrides"> & {
  plan: Plan; entitlements: Entitlements; products: number; orders: number; apk_builds: number; period_ym: string;
};

export const quotaResources = {
  max_products: "products", max_monthly_orders: "orders", max_monthly_apk_builds: "apk_builds",
} as const;
export type Resource = (typeof quotaResources)[QuotaKey] | "custom_domains";
const resourceNames: Record<Resource, Record<Lang, string>> = {
  products: { en: "Active products", ar: "المنتجات المنشورة" },
  orders: { en: "Monthly orders", ar: "الطلبات الشهرية" },
  apk_builds: { en: "Monthly APK builds", ar: "عمليات بناء التطبيق الشهرية" },
  custom_domains: { en: "Custom domains", ar: "النطاقات المخصصة" },
};
export function resourceName(resource: Resource, lang: Lang) { return resourceNames[resource][lang]; }
export const statusNames: Record<SubscriptionStatus, Record<Lang, string>> = {
  trialing: { en: "On trial", ar: "فترة تجريبية" }, active: { en: "Active", ar: "نشط" },
  past_due: { en: "Past due", ar: "متأخر السداد" }, canceled: { en: "Canceled", ar: "ملغى" },
};
export function cycleName(cycle: BillingCycle, lang: Lang) {
  if (cycle === "annual") return lang === "en" ? "Annual" : "سنوي";
  return lang === "en" ? "Monthly" : "شهري";
}
export function limitLabel(limit: number | null, lang: Lang) {
  return limit === null ? (lang === "en" ? "Unlimited" : "بلا حد") : limit.toLocaleString(lang === "en" ? "en-EG" : "ar-EG");
}
export function resolveEntitlements(plan: Entitlements, overrides: QuotaOverrides): Entitlements {
  return {
    max_products: plan.max_products, max_monthly_orders: plan.max_monthly_orders,
    max_monthly_apk_builds: plan.max_monthly_apk_builds, custom_domains_enabled: plan.custom_domains_enabled, ...overrides,
  };
}
export function limitReached(current: number, limit: number | null) { return limit !== null && current >= limit; }
export function annualSavings(plan: Pick<Plan, "monthly_price_egp" | "annual_price_egp">) {
  return Math.max(0, 12 * plan.monthly_price_egp - plan.annual_price_egp);
}
export type QuotaFailure = {
  code: "plan_limit_reached" | "feature_not_in_plan"; resource: Resource; current: number; limit: number;
};
export function quotaFailure(error: { message?: string; details?: unknown } | null | undefined): QuotaFailure | null {
  if (error?.message !== "plan_limit_reached" && error?.message !== "feature_not_in_plan") return null;
  let detail = error.details;
  if (typeof detail === "string") {
    try { detail = JSON.parse(detail); } catch { return null; }
  }
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Partial<QuotaFailure>;
  if (d.code !== error.message || !d.resource || !Object.hasOwn(resourceNames, d.resource)
    || typeof d.current !== "number" || !Number.isSafeInteger(d.current) || d.current < 0
    || typeof d.limit !== "number" || !Number.isSafeInteger(d.limit) || d.limit < 0) return null;
  return { code: d.code, resource: d.resource, current: d.current, limit: d.limit };
}
export function quotaMessage(resource: Resource, lang: Lang, featureDisabled = false) {
  const en = lang === "en";
  if (resource === "custom_domains") return en ? "Your plan does not include adding a custom domain." : "باقتك الحالية لا تشمل إضافة نطاق مخصص.";
  if (resource === "apk_builds" && featureDisabled) return en ? "The Android builder is disabled for this store." : "بناء تطبيق أندرويد معطّل لهذا المتجر.";
  if (resource === "apk_builds") return en ? "You’ve used this month’s APK build allowance." : "استهلكت رصيد بناء التطبيق لهذا الشهر.";
  if (resource === "products") return en ? "You’ve reached your active product limit. You can still save drafts." : "وصلت إلى حد المنتجات المنشورة. يمكنك الاستمرار في حفظ المسودات.";
  return en ? "This store has reached its monthly order limit. Please contact the store before trying again." : "بلغ المتجر حد الطلبات لهذا الشهر. يُرجى التواصل مع المتجر قبل المحاولة مجدداً.";
}

const maxInt = 2147483647;
function field(form: FormData, name: string) {
  const value = form.get(name);
  if (typeof value !== "string") throw new Error(name);
  return value.trim();
}
function boundedText(form: FormData, name: string, max: number) {
  const value = field(form, name);
  if (!value || value.length > max) throw new Error(name);
  return value;
}
function integer(form: FormData, name: string, signed = false) {
  const raw = field(form, name);
  const value = Number(raw);
  if (!/^-?\d+$/.test(raw) || !Number.isInteger(value) || value < (signed ? -maxInt - 1 : 0) || value > maxInt) throw new Error(name);
  return value;
}
function choice<T extends string>(form: FormData, name: string, options: readonly T[]): T {
  const value = field(form, name);
  const match = options.find(option => option === value);
  if (!match) throw new Error(name);
  return match;
}
function checkbox(form: FormData, name: string) {
  const value = form.get(name);
  if (value === null) return false;
  if (value !== "on") throw new Error(name);
  return true;
}
function quotaFields(form: FormData, allowInherit: boolean) {
  const values: QuotaOverrides = {};
  for (const key of quotaKeys) {
    const mode = choice(form, key + "_mode", allowInherit ? ["inherit", "custom", "unlimited"] : ["custom", "unlimited"]);
    if (mode !== "inherit") values[key] = mode === "unlimited" ? null : integer(form, key);
  }
  return values;
}
export function parsePlan(form: FormData): Omit<Plan, "revision"> {
  const caps = quotaFields(form, false);
  return {
    code: choice(form, "code", planCodes),
    name_ar: boundedText(form, "name_ar", 100), name_en: boundedText(form, "name_en", 100),
    description_ar: boundedText(form, "description_ar", 1000), description_en: boundedText(form, "description_en", 1000),
    monthly_price_egp: integer(form, "monthly_price_egp"), annual_price_egp: integer(form, "annual_price_egp"),
    trial_days: integer(form, "trial_days"), sort_order: integer(form, "sort_order", true),
    max_products: caps.max_products ?? null, max_monthly_orders: caps.max_monthly_orders ?? null, max_monthly_apk_builds: caps.max_monthly_apk_builds ?? null,
    custom_domains_enabled: checkbox(form, "custom_domains_enabled"), is_active: checkbox(form, "is_active"),
  };
}
export function parseSubscription(form: FormData) {
  const overrides = quotaFields(form, true);
  const domains = choice(form, "custom_domains_enabled", ["inherit", "enabled", "disabled"]);
  if (domains !== "inherit") overrides.custom_domains_enabled = domains === "enabled";
  const status = choice(form, "status", subscriptionStatuses);
  const date = field(form, "trial_end");
  let trialEnd = null;
  if (date) {
    const parsed = new Date(date + "T23:59:59.999Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("trial_end");
    trialEnd = parsed.toISOString();
  } else if (status === "trialing") throw new Error("trial_end");
  const notes = field(form, "admin_notes");
  if (notes.length > 4000) throw new Error("admin_notes");
  return { p_plan: choice(form, "plan_code", planCodes), p_cycle: choice(form, "billing_cycle", cycles),
    p_status: status, p_trial_end: trialEnd, p_overrides: overrides, p_notes: notes || null };
}
