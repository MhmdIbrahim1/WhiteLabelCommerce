"use client";

import { useActionState, useState } from "react";
import { Check, ChevronDown, Copy, Globe } from "lucide-react";
import { QuotaPrompt } from "@/components/quota-prompt";
import { manageDomain, type DomainResult, type DomainRow, type DomainState } from "./domain-actions";
import "./domains.css";

const messages: Record<Exclude<Extract<DomainResult, string>, "">, [string, string]> = {
  added: ["Domain added. Publish the TXT record below.", "تمت إضافة النطاق. انشر سجل TXT الموضح أدناه."],
  verified: ["Ownership verified. Connect the domain to your hosting provider, then activate it.", "تم إثبات الملكية. اربط النطاق بالاستضافة ثم فعّله."],
  activated: ["Your custom domain is active.", "تم تفعيل نطاقك المخصص."],
  removed: ["Domain removed.", "تمت إزالة النطاق."],
  primary_saved: ["Primary address updated.", "تم تحديث العنوان الرئيسي."],
  invalid: ["Enter a public domain name without a URL or port.", "أدخل اسم نطاق عام دون بروتوكول أو رقم منفذ."],
  taken: ["This domain is already registered.", "هذا النطاق مسجل بالفعل."],
  changed: ["The store or domain changed. Refresh and try again.", "تغيّر المتجر أو النطاق. حدّث الصفحة وحاول مجدداً."],
  unavailable: ["Domain settings are temporarily unavailable.", "إعدادات النطاق غير متاحة مؤقتاً."],
  txt_missing: ["The matching TXT record was not found. Check the name and value, then retry after DNS propagation.", "لم نجد سجل TXT المطابق. راجع الاسم والقيمة ثم أعد المحاولة بعد انتشار السجل."],
  dns_timeout: ["DNS took too long to respond. Try again.", "انتهت مهلة استجابة DNS. أعد المحاولة."],
  dns_failed: ["The DNS provider could not answer. Check your DNS settings and retry.", "تعذرت استجابة مزود DNS. راجع الإعدادات ثم أعد المحاولة."],
};
const states: Record<DomainState, [string, string]> = {
  pending_dns: ["Awaiting DNS", "بانتظار سجل DNS"], verified: ["Ownership verified", "تم إثبات الملكية"],
  active: ["Active", "نشط"], error: ["Check DNS", "راجع سجل DNS"],
};

function CopyValue({ label, value, en }: { label: string; value: string; en: boolean }) {
  const [feedback, setFeedback] = useState("");
  return <div className="domain-record">
    <span>{label}</span><code dir="ltr">{value}</code>
    <button type="button" aria-label={(en ? "Copy " : "نسخ ") + label} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setFeedback(en ? "Copied" : "تم النسخ"); }
      catch { setFeedback(en ? "Select the value to copy it." : "حدد القيمة لنسخها."); }
    }}><Copy size={14} aria-hidden="true" />{en ? "Copy" : "نسخ"}</button>
    {feedback && <small role="status">{feedback}</small>}
  </div>;
}

export function DomainCard({ storeId, en, subdomain, target, rows, unavailable, canAdd }: {
  storeId: string; en: boolean; subdomain: string; target: string | null; rows: DomainRow[]; unavailable: boolean; canAdd: boolean;
}) {
  const [result, act, pending] = useActionState(manageDomain.bind(null, storeId), "");
  const t = (english: string, arabic: string) => en ? english : arabic;
  const ix = en ? 0 : 1;
  return <section className="card domain-settings" aria-labelledby="domain-title">
    <h2 id="domain-title"><Globe size={19} aria-hidden="true" />{t("Store domains", "نطاقات المتجر")}</h2>
    <div className="domain-subdomain">
      <div><small>{t("Your store subdomain", "النطاق الفرعي لمتجرك")}</small>
        <a href={subdomain} target="_blank" rel="noreferrer" dir="ltr">{new URL(subdomain).host}</a></div>
      <span className="domain-status" data-state="active"><Check size={14} />{t("Active", "نشط")}</span>
    </div>
    <details className="domain-custom">
      <summary><span>{t("Custom domains", "النطاقات المخصصة")}</span><ChevronDown size={17} /></summary>
      {unavailable ? <p role="status">{messages.unavailable[ix]}</p> : <>
        <p>{t("Connect an address you own. Your store subdomain stays available.", "اربط عنواناً تملكه بمتجرك. يبقى النطاق الفرعي متاحاً.")}</p>
        {(!canAdd || typeof result === "object") && <QuotaPrompt resource="custom_domains" lang={en ? "en" : "ar"} />}
        {canAdd && <form action={act} className="domain-add">
          <label htmlFor="new-domain">{t("Domain name", "اسم النطاق")}</label>
          <input id="new-domain" name="domain" dir="ltr" type="text" inputMode="url" autoCapitalize="none"
            autoComplete="off" spellCheck={false} required maxLength={253} placeholder="shop.example.com" />
          <button name="action" value="add" disabled={pending}>{t("Add domain", "إضافة نطاق")}</button>
        </form>}
        <p role="status" aria-live="polite" className="domain-feedback">{pending ? t("Saving…", "جارٍ الحفظ…") : typeof result === "string" && result && messages[result][ix]}</p>
        {rows.map(row => <article className="domain-item" key={row.id}>
          <header>{row.status === "active" ? <a href={"https://" + row.domain} target="_blank" rel="noreferrer" dir="ltr">{row.domain}</a> :
            <b dir="ltr">{row.domain}</b>}<span className="domain-status" data-state={row.status}>{states[row.status][ix]}</span></header>
          {row.status !== "active" && <div className="domain-instructions">
            <p>{t("In your DNS provider, add a TXT record with this full name and value. Keep the record in place through activation.",
              "أضف سجل TXT لدى مزود DNS بهذا الاسم الكامل والقيمة. احتفظ بالسجل حتى اكتمال التفعيل.")}</p>
            <CopyValue en={en} label={t("TXT name", "اسم سجل TXT")} value={"_wlc-verify." + row.domain} />
            <CopyValue en={en} label={t("TXT value", "قيمة سجل TXT")} value={"wlc-verification=" + row.verification_token} />
            {row.last_error && <p>{messages[row.last_error][ix]}</p>}
            {row.status === "verified" && <>
              <p>{t("Attach this domain to the storefront deployment and enable HTTPS. Point its CNAME (or apex ALIAS) to the hosting target, then activate.",
                "أضف النطاق إلى استضافة المتجر وفعّل HTTPS. وجّه سجل CNAME، أو ALIAS للنطاق الرئيسي، إلى عنوان الاستضافة ثم فعّل النطاق.")}</p>
              {target && <CopyValue en={en} label={t("Hosting target", "عنوان الاستضافة")} value={target} />}
            </>}
          </div>}
          <form action={act} className="domain-actions"><input type="hidden" name="id" value={row.id} />
            {row.status === "active" ? <>
              <input type="hidden" name="primary" value={String(!row.is_primary)} />
              <button type="submit" name="action" value="primary" role="switch" aria-checked={row.is_primary} disabled={pending}
                className="domain-primary"><span aria-hidden="true" />{t("Primary domain", "النطاق الرئيسي")}</button>
              <small>{t("Used for your public store link and search previews.", "يُستخدم لرابط مشاركة المتجر ومعاينته في نتائج البحث.")}</small>
            </> : <button name="action" value={row.status === "verified" ? "activate" : "verify"} disabled={pending}>
              {row.status === "verified" ? t("Activate domain", "تفعيل النطاق") : t("Verify DNS", "التحقق من DNS")}</button>}
          </form>
          <details className="domain-remove"><summary>{t("Remove domain", "إزالة النطاق")}</summary>
            <form action={act}><input type="hidden" name="id" value={row.id}/>
              <p>{t("Removing this address disconnects it from your store.", "تؤدي إزالة هذا العنوان إلى فصله عن المتجر.")}</p>
              <button name="action" value="remove" disabled={pending}>{t("Confirm removal", "تأكيد الإزالة")}</button>
            </form>
          </details>
        </article>)}
      </>}
    </details>
  </section>;
}
