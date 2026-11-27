import type { BillingCycle, Plan, PlanCode, StoreBilling } from "./billing";
import type { Lang } from "./i18n";

export const manualChannels = ["instapay", "mobile_wallet_manual", "bank_transfer"] as const;
export type ManualChannel = (typeof manualChannels)[number];
export type PaymentChannel = ManualChannel | "paymob_card" | "paymob_wallet";
export type BillingOptions = {
  paymob_enabled: boolean; paymob_card_enabled: boolean; paymob_wallet_enabled: boolean; manual_transfer_enabled: boolean;
  instapay_handle: string | null; wallet_transfer_number: string | null; bank_iban: string | null;
  bank_name: string | null; bank_account_name: string | null; manual_instructions_en: string | null; manual_instructions_ar: string | null;
};
export const channelNames: Record<PaymentChannel, Record<Lang, string>> = {
  paymob_card: { en: "Bank card · Paymob", ar: "بطاقة بنكية · باي موب" },
  paymob_wallet: { en: "Mobile wallet · Paymob", ar: "محفظة إلكترونية · باي موب" },
  instapay: { en: "InstaPay transfer", ar: "تحويل إنستاباي" },
  mobile_wallet_manual: { en: "Mobile wallet transfer", ar: "تحويل إلى محفظة" },
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
};
export const invoiceStatuses = {
  pending: { en: "Pending", ar: "قيد الانتظار" }, awaiting_review: { en: "Awaiting review", ar: "قيد المراجعة" },
  paid: { en: "Paid", ar: "مدفوع" }, failed: { en: "Failed", ar: "فشل الدفع" },
  rejected: { en: "Rejected", ar: "مرفوض" }, cancelled: { en: "Cancelled", ar: "ملغى" },
  expired: { en: "Expired", ar: "منتهي الصلاحية" }, refunded: { en: "Refunded", ar: "مسترد" },
};
export type BillingInvoice = {
  id: string; target_plan_code: PlanCode; target_billing_cycle: BillingCycle; amount_egp: number;
  payment_channel: PaymentChannel; status: keyof typeof invoiceStatuses; transfer_reference: string | null;
  paymob_order_id: string | null; review_note: string | null; receipt_path: string | null; created_at: string;
  saas_plans: Pick<Plan, "name_ar" | "name_en"> | null;
};
export function paymentChannels(options: BillingOptions, manualRequestOpen = false): PaymentChannel[] {
  const available: PaymentChannel[] = [];
  if (options.paymob_enabled && options.paymob_card_enabled) available.push("paymob_card");
  if (options.paymob_enabled && options.paymob_wallet_enabled) available.push("paymob_wallet");
  if (options.manual_transfer_enabled && !manualRequestOpen) {
    if (options.instapay_handle) available.push("instapay");
    if (options.wallet_transfer_number) available.push("mobile_wallet_manual");
    if (options.bank_iban) available.push("bank_transfer");
  }
  return available;
}
export function planPrice(plan: Plan, cycle: BillingCycle) {
  return cycle === "annual" ? plan.annual_price_egp : plan.monthly_price_egp;
}
export function billingEligibility(bill: StoreBilling, target: Plan, cycle: BillingCycle) {
  const amount = planPrice(target, cycle);
  const samePlan = target.code === bill.plan.code;
  const higher = !samePlan && amount > planPrice(bill.plan, cycle);
  const lower = !samePlan && (amount < planPrice(bill.plan, cycle) || (target.code === "starter" && amount === 0));
  const annualSwitch = samePlan && cycle === "annual" && bill.billing_cycle === "monthly" &&
    amount < target.monthly_price_egp * 12;
  const activation = samePlan && bill.status !== "active";
  return {
    trial: target.is_active && higher && !bill.trial_used_at && bill.can_start_trial && target.trial_days > 0,
    checkout: target.is_active && amount > 0 && (higher || annualSwitch || activation),
    annualSwitch, activation,
    downgrade: target.is_active && lower &&
      (bill.scheduled_plan_code !== target.code || bill.scheduled_billing_cycle !== cycle),
  };
}
export function downgradeImpact(bill: StoreBilling, target: Plan) {
  const caps = { ...target, ...bill.quota_overrides };
  const resources = [
    { resource: "products", used: bill.products, cap: caps.max_products },
    { resource: "staff_members", used: bill.staff_members, cap: caps.max_staff_members },
    { resource: "custom_domains", used: bill.custom_domains, cap: caps.custom_domains_enabled ? null : 0 },
  ] as const;
  return resources.filter(item => item.cap !== null && item.used > item.cap);
}
export const receiptLimit = 5 * 1024 * 1024;
export const receiptTypes = ["image/jpeg", "image/png", "image/webp"];
export const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function parseManualTransfer(form: FormData) {
  const read = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const channel = manualChannels.find(c => c === read("paymentMethod"));
  const reference = read("reference"), sender = read("sender"), note = read("note");
  const key = read("idempotencyKey");
  const receipt = form.get("receipt");
  if (!channel || !uuidPattern.test(key) || reference.length < 3 || reference.length > 120 ||
    sender.length > 120 || note.length > 1000) throw new Error("invalid");
  if (typeof receipt === "string" || (receipt && (receipt.name || receipt.size) &&
    (!receipt.size || receipt.size > receiptLimit || !receiptTypes.includes(receipt.type)))) throw new Error("receipt");
  return { channel, reference, sender: sender || null, note: note || null, key, receipt: receipt?.size ? receipt : null };
}
export function billingMoney(amount: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "en" ? "en-EG" : "ar-EG", {
    style: "currency", currency: "EGP", maximumFractionDigits: 0,
  }).format(amount);
}
export function billingDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG", {
    dateStyle: "medium", timeZone: "UTC",
  }).format(new Date(value));
}
