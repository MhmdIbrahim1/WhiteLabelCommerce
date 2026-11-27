"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { useHydrated } from "@/components/use-hydrated";
import type { Lang } from "@/lib/i18n";
import { Editor } from "./controls";
import { reviewUpgrade, savePaymentSettings } from "./payment-actions";
import { credentialFields, paymentFlags, receivingFields, type CredentialStatus, type PaymentSettings } from "./payment-fields";

function CopyEndpoint({ url, label, lang }: { url: string; label: string; lang: Lang }) {
  const [status, setStatus] = useState("");
  const en = lang === "en";
  return <div className="payment-endpoint"><strong>{label}</strong><bdi dir="ltr">{url}</bdi>
    <button type="button" className="ws-button" aria-label={(en ? "Copy " : "نسخ ") + label} onClick={async () => {
      try { await navigator.clipboard.writeText(url); setStatus(en ? "Copied" : "تم النسخ"); }
      catch { setStatus(en ? "Select the URL to copy it." : "حدّد الرابط لنسخه."); }
    }}><Copy size={15} strokeWidth={1.5} aria-hidden="true" />{en ? "Copy" : "نسخ"}</button><small role="status">{status}</small>
  </div>;
}

export function PaymentSettingsEditor({ settings, configured, origin, lang }: {
  settings: PaymentSettings; configured: CredentialStatus; origin: string; lang: Lang;
}) {
  const en = lang === "en";
  const flag = (name: keyof typeof paymentFlags) => <label key={name}><input name={name} type="checkbox" defaultChecked={settings[name]} />
    {paymentFlags[name][en ? 0 : 1]}</label>;
  return <section className="billing-box billing-editor"><header className="billing-section-head">
    <h2>{en ? "Platform payment settings" : "إعدادات دفع المنصة"}</h2></header>
    <Editor lang={lang} save={savePaymentSettings.bind(null, settings.revision)} label={en ? "Save payment settings" : "حفظ إعدادات الدفع"}>
      <div className="billing-field-group" key={settings.revision}>
        <h3>{en ? "Manual transfers" : "التحويلات اليدوية"}</h3>
        <div className="billing-checks">{flag("manual_transfer_enabled")}</div>
        <div className="billing-form-grid">{Object.entries(receivingFields).map(([key, field]) =>
          <label key={key}>{field[lang]}<input name={key} dir={field.dir} maxLength={field.max}
            defaultValue={settings[key as keyof typeof receivingFields] ?? ""} /></label>)}</div>
        <div className="billing-form-grid">{(["ar", "en"] as const).map(language =>
          <label key={language}>{language === "ar" ? (en ? "Transfer instructions in Arabic" : "تعليمات التحويل بالعربية") :
            (en ? "Transfer instructions in English" : "تعليمات التحويل بالإنجليزية")}
            <textarea rows={2} lang={language} dir={language === "ar" ? "rtl" : "ltr"} name={"manual_instructions_" + language}
              maxLength={1000} defaultValue={settings[`manual_instructions_${language}`] ?? ""} /></label>)}</div>
        <div className="ws-rule"><h3>{en ? "Paymob online checkout" : "الدفع الإلكتروني عبر باي موب"}</h3></div>
        <div className="billing-checks">{flag("paymob_enabled")}{flag("paymob_card_enabled")}{flag("paymob_wallet_enabled")}</div>
        <small>{en ? "Fill in a credential to replace it. Empty fields keep the saved value." : "أدخل قيمة جديدة لتغيير بيانات الربط. الحقول الفارغة تحتفظ بالقيم المحفوظة."}</small>
        <div className="billing-form-grid">{Object.entries(credentialFields).map(([key, names]) => <label key={key}>
          {names[en ? 0 : 1]}<small>{configured[key as keyof CredentialStatus] ? (en ? "Configured" : "تم الإعداد") : (en ? "Not configured" : "غير مُعدّ")}</small>
          <input type="password" name={key} dir="ltr" autoComplete="new-password" maxLength={key.endsWith("_id") ? 15 : 4000}
            inputMode={key.endsWith("_id") ? "numeric" : "text"} pattern={key.endsWith("_id") ? "[0-9]{1,15}" : undefined} />
        </label>)}</div>
      </div>
    </Editor>
    <div className="payment-endpoints">{(["callback", "webhook"] as const).map(key => <CopyEndpoint key={key} lang={lang}
      label={key === "callback" ? (en ? "Callback URL" : "رابط العودة") : (en ? "Webhook URL" : "رابط إشعارات الدفع")}
      url={origin + "/api/billing/paymob/" + key} />)}</div>
  </section>;
}

export function ReviewControls({ invoiceId, lang }: { invoiceId: string; lang: Lang }) {
  const en = lang === "en";
  const interactive = useHydrated();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState("");
  const router = useRouter();
  function review(decision: "approve" | "reject", form: FormData) {
    if (pending) return;
    start(async () => {
      try {
        const result = await reviewUpgrade(invoiceId, decision, form);
        if (result === "saved") { router.refresh(); return; }
        if (result === "invalid") { setFeedback(en ? "Enter a rejection reason." : "أدخل سبب الرفض."); return; }
        if (result === "conflict") { router.refresh(); }
      } catch { /* Keep the form available when the request can be retried. */ }
      setFeedback(en ? "Could not review this request. Refresh and try again." : "تعذّرت مراجعة الطلب. حدّث الصفحة وحاول مرة أخرى.");
    });
  }
  return <div className="billing-review-actions">
    <button type="button" className="ws-primary" disabled={!interactive || pending} onClick={() => review("approve", new FormData())}>
      {en ? "Approve & activate" : "الموافقة وتفعيل الاشتراك"}</button>
    <form method="post" onSubmit={event => { event.preventDefault(); review("reject", new FormData(event.currentTarget)); }}>
      <label>{en ? "Rejection reason" : "سبب الرفض"}<input name="review_note" required maxLength={1000} dir="auto" disabled={!interactive || pending} /></label>
      <button className="ws-button" type="submit" disabled={!interactive || pending}>{en ? "Reject" : "رفض"}</button>
    </form><span role="status">{feedback}</span>
  </div>;
}
