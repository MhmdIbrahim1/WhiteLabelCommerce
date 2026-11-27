"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Check, Copy } from "lucide-react";
import { PlanComparison } from "@/components/plan-comparison";
import { WorkspaceDrawer } from "@/components/workspace-drawer";
import { annualSavings, cycleName, resourceName, type BillingCycle, type Plan, type StoreBilling } from "@/lib/billing";
import { billingDate, billingEligibility, billingMoney, channelNames, downgradeImpact, paymentChannels, planPrice,
  receiptLimit, receiptTypes, type BillingOptions, type PaymentChannel } from "@/lib/billing-checkout";
import { localizedText, type Lang } from "@/lib/i18n";
import { cancelBillingChange, changeBillingPlan, submitBillingTransfer, type BillingActionResult } from "./merchant-actions";

const errors = {
  invalid: ["Check the transfer details and try again.", "راجع بيانات التحويل ثم أعد المحاولة."],
  receipt: ["Choose a JPEG, PNG or WebP image up to 5 MB.", "اختر صورة JPEG أو PNG أو WebP بحجم لا يتجاوز ٥ ميغابايت."],
  pending: ["A transfer is already awaiting review.", "يوجد تحويل قيد المراجعة بالفعل."],
  disabled: ["This payment method is currently unavailable.", "وسيلة الدفع هذه غير متاحة حالياً."],
  changed: ["Your billing details have changed. Refresh the page to see your options.", "تغيّرت بيانات الفوترة. حدّث الصفحة لعرض الخيارات المتاحة."],
  price: ["The price has changed. Refresh the page to review the new amount.", "تغيّر السعر. حدّث الصفحة لمراجعة المبلغ الجديد."],
  unavailable: ["We couldn’t complete this request. Please try again.", "تعذّر إتمام الطلب. يُرجى المحاولة مجدداً."],
};
function ErrorMessage({ result, lang }: { result: BillingActionResult | null; lang: Lang }) {
  return result && result !== "ok" ? <p role="alert" className="ws-field-error">{errors[result][lang === "en" ? 0 : 1]}</p> : null;
}
type Selection = { plan: Plan; cycle: BillingCycle };

export function MerchantPlans({ plans, bill, options, store, lang, manualPending }: {
  plans: Plan[]; bill: StoreBilling; options: BillingOptions; store: string; lang: Lang; manualPending: boolean;
}) {
  const en = lang === "en";
  const [checkout, setCheckout] = useState<Selection | null>(null);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<BillingActionResult | null>(null);
  function change(plan: Plan, cycle: BillingCycle, action: "trial" | "schedule") {
    setResult(null);
    start(async () => {
      try { setResult(await changeBillingPlan(store, action, plan.code, cycle)); }
      catch { setResult("unavailable"); }
    });
  }
  return <div id="plans">
    <PlanComparison lang={lang} plans={plans} current={bill.plan.code} initialCycle={bill.billing_cycle}
      renderActions={(plan, cycle) => {
        const actions = billingEligibility(bill, plan, cycle);
        if (!actions.trial && !actions.checkout && !actions.downgrade) return null;
        const name = localizedText(lang, plan.name_ar, plan.name_en);
        return <div className="billing-plan-actions">
          {actions.trial && <button type="button" className="ws-button" disabled={busy} onClick={() => change(plan, cycle, "trial")}
            aria-label={en ? `Start ${plan.trial_days}-day free trial` : `ابدأ تجربة مجانية لمدة ${plan.trial_days} يوماً`}>
            {en ? <>Start <bdi dir="ltr">{plan.trial_days}</bdi>-day free trial</> : <>ابدأ تجربة مجانية لمدة <bdi dir="ltr">{plan.trial_days}</bdi> يوماً</>}
          </button>}
          {actions.checkout && <button id={"checkout-" + plan.code} type="button" className="ws-primary" disabled={busy}
            aria-haspopup="dialog" onClick={() => setCheckout({ plan, cycle })}>
            {actions.annualSwitch ? <>{en ? "Switch to annual & save " : "حوّل إلى السنوي ووفّر "}<bdi dir="ltr">{billingMoney(annualSavings(plan), lang)}</bdi></> :
              actions.activation ? (en ? "Activate " : "فعّل باقة ") + name : (en ? "Upgrade to " : "ترقية إلى ") + name}
          </button>}
          {actions.downgrade && <>
            <small>{en ? "Takes effect on " : "يسري التغيير في "}<bdi dir="ltr">{billingDate(bill.current_period_end, lang)} UTC</bdi></small>
            {downgradeImpact(bill, plan).map(({ resource, used, cap }) => <small key={resource} className="billing-impact">
              {resourceName(resource, lang)} · {en ? "Using " : "الاستخدام "}<bdi dir="ltr">{used}</bdi>{en ? ", new limit " : "، الحد الجديد "}<bdi dir="ltr">{cap}</bdi>
            </small>)}
            <button type="button" className="ws-button" disabled={busy} onClick={() => change(plan, cycle, "schedule")}>
              {en ? "Schedule downgrade" : "جدولة خفض الباقة"}</button>
          </>}
        </div>;
      }} />
    <ErrorMessage result={result} lang={lang} />
    {checkout && <Checkout selection={checkout} store={store} lang={lang} options={options} manualPending={manualPending}
      onClose={() => setCheckout(null)} />}
  </div>;
}

export function CancelChange({ store, invoice, lang }: { store: string; invoice?: string; lang: Lang }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<BillingActionResult | null>(null);
  const en = lang === "en";
  return <div><button className="ws-button" type="button" disabled={busy} onClick={() => start(async () => {
    try { setResult(await cancelBillingChange(store, invoice)); } catch { setResult("unavailable"); }
  })}>{invoice ? (en ? "Cancel request" : "إلغاء الطلب") : (en ? "Cancel scheduled change" : "إلغاء التغيير المجدول")}</button>
    <ErrorMessage result={result} lang={lang} /></div>;
}

function ReceivingDetail({ label, value, lang }: { label: string; value: string | null; lang: Lang }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!value) return null;
  const en = lang === "en";
  return <div className="billing-receiving-detail"><div><dt>{label}</dt><dd><bdi dir="ltr">{value}</bdi></dd></div>
    <button type="button" className="ws-button" aria-label={(en ? "Copy " : "نسخ ") + label} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setCopied(true); setFailed(false); } catch { setFailed(true); }
    }}>{copied ? <Check size={15} strokeWidth={1.5} /> : <Copy size={15} strokeWidth={1.5} />}
      {copied ? (en ? "Copied" : "تم النسخ") : (en ? "Copy" : "نسخ")}</button>
    {failed && <small role="status">{en ? "Select the value to copy it." : "حدّد القيمة لنسخها."}</small>}</div>;
}

function ReceiptField({ lang }: { lang: Lang }) {
  const en = lang === "en";
  const [name, setName] = useState("");
  return <label>{en ? "Receipt image (optional)" : "صورة الإيصال (اختياري)"}
    <span className="billing-file">
      <span aria-hidden="true">{en ? "Choose image" : "اختر صورة"}</span>
      <bdi dir="auto" aria-hidden="true">{name || (en ? "No image selected" : "لم تُحدّد صورة")}</bdi>
      <input name="receipt" type="file" accept={receiptTypes.join(",")}
        onChange={event => setName(event.currentTarget.files?.[0]?.name ?? "")} />
    </span>
    <small>{en ? "JPEG, PNG or WebP, up to 5 MB." : "صورة JPEG أو PNG أو WebP حتى ٥ ميغابايت."}</small>
  </label>;
}

function Checkout({ selection: { plan, cycle }, store, options, manualPending, onClose, lang }: {
  selection: Selection; store: string; options: BillingOptions; manualPending: boolean; onClose: () => void; lang: Lang;
}) {
  const en = lang === "en";
  const channels = paymentChannels(options, manualPending);
  const [method, setMethod] = useState<PaymentChannel | undefined>(channels[0]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, start] = useTransition();
  const [error, setError] = useState<BillingActionResult | null>(null);
  const online = method === "paymob_card" || method === "paymob_wallet";
  const name = localizedText(lang, plan.name_ar, plan.name_en);
  const amount = planPrice(plan, cycle);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!method || busy) return;
    const form = new FormData(event.currentTarget);
    const receipt = form.get("receipt");
    if (receipt instanceof File && !receipt.name && receipt.size === 0) form.delete("receipt");
    setError(null);
    if (receipt instanceof File && receipt.name && (!receipt.size || receipt.size > receiptLimit || !receiptTypes.includes(receipt.type))) {
      setError("receipt");
      return;
    }
    form.set("idempotencyKey", key);
    start(async () => {
      try {
        if (online) {
          const response = await fetch("/api/billing/paymob/initiate", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: store, planCode: plan.code, billingCycle: cycle, paymentMethod: method, walletPhone: form.get("walletPhone"), idempotencyKey: key, expectedAmountEGP: amount }) });
          const result = await response.json();
          if (!response.ok || !result.ok) {
            if (["payment_failed", "expired"].includes(result.code)) setKey(crypto.randomUUID());
            setError(result.code === "billing_price_changed" ? "price" : "unavailable");
            return;
          }
          const url = result.redirectUrl ?? result.iframeUrl;
          if (typeof url !== "string") { setError("unavailable"); return; }
          window.location.assign(url);
        } else {
          const result = await submitBillingTransfer(store, plan.code, cycle, amount, form);
          if (result === "ok") onClose(); else setError(result);
        }
      } catch { setError("unavailable"); }
    });
  }
  const instructions = localizedText(lang, options.manual_instructions_ar, options.manual_instructions_en);
  return <WorkspaceDrawer title={en ? "Subscription checkout" : "دفع اشتراك المتجر"} onDismiss={onClose} returnFocusId={"checkout-" + plan.code}>
    <div className="billing-checkout-summary"><div><h3>{name}</h3><p>{cycleName(cycle, lang)}</p></div>
      <strong><bdi dir="ltr">{billingMoney(amount, lang)}</bdi></strong></div>
    {!channels.length ? <p role="status">{manualPending ? (en ? "Your transfer is awaiting review." : "تحويلك قيد المراجعة.") :
      (en ? "Payment methods are currently unavailable. Contact platform support to upgrade." : "وسائل الدفع غير متاحة حالياً. تواصل مع دعم المنصة لترقية باقتك.")}</p> :
      <form className="ws-form billing-checkout-form" onSubmit={submit}>
        <label>{en ? "Payment method" : "وسيلة الدفع"}<select name="paymentMethod" value={method} disabled={busy}
          onChange={event => { setMethod(event.target.value as PaymentChannel); setKey(crypto.randomUUID()); setError(null); }}>
          {channels.map(value => <option key={value} value={value}>{channelNames[value][lang]}</option>)}
        </select></label>
        {online ? <>
          {method === "paymob_wallet" && <label>{en ? "Wallet mobile number" : "رقم هاتف المحفظة"}
            <input type="tel" name="walletPhone" dir="ltr" placeholder="01012345678" required pattern="01[0125][0-9]{8}" maxLength={11} /></label>}
        </> : <>
          <dl className="billing-receiving" key={method}>
            {method === "instapay" && <ReceivingDetail lang={lang} label={en ? "InstaPay address" : "عنوان إنستاباي"} value={options.instapay_handle} />}
            {method === "mobile_wallet_manual" && <ReceivingDetail lang={lang} label={en ? "Receiving wallet" : "محفظة الاستلام"} value={options.wallet_transfer_number} />}
            {method === "bank_transfer" && <>
              <ReceivingDetail lang={lang} label={en ? "Bank" : "البنك"} value={options.bank_name} />
              <ReceivingDetail lang={lang} label={en ? "Account holder" : "اسم صاحب الحساب"} value={options.bank_account_name} />
              <ReceivingDetail lang={lang} label="IBAN" value={options.bank_iban} />
            </>}
          </dl>
          {instructions && <p className="billing-transfer-instructions" dir="auto">{instructions}</p>}
          <label>{en ? "Transfer reference" : "مرجع التحويل"}<input name="reference" dir="ltr" required minLength={3} maxLength={120} /></label>
          <label>{en ? "Sender handle or number (optional)" : "عنوان المرسل أو رقمه (اختياري)"}<input name="sender" dir="ltr" maxLength={120} /></label>
          <ReceiptField lang={lang} />
          <label>{en ? "Note (optional)" : "ملاحظة (اختياري)"}<textarea name="note" dir="auto" rows={3} maxLength={1000} /></label>
        </>}
        <ErrorMessage result={error} lang={lang} />
        <button className="ws-primary" type="submit" disabled={busy}>{busy ? (en ? "Submitting…" : "جارٍ الإرسال…") :
          online ? (en ? "Continue to Paymob" : "متابعة إلى باي موب") : (en ? "Submit transfer for review" : "إرسال التحويل للمراجعة")}</button>
      </form>}
  </WorkspaceDrawer>;
}
