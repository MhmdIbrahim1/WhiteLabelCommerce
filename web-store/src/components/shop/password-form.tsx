"use client";

import { useState } from "react";
import { useLanguage } from "../language-provider";
import { showToast } from "../floating-toast";
import { validPassword } from "@/lib/password-policy";

export function PasswordForm({mode, token, code, storeSlug}: { mode:"change"|"request"|"recover"; token?:string; code?:string; storeSlug?:string }) {
  const en = useLanguage().lang === "en";
  const [busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);
  const request = mode === "request";
  const label = request ? en ? "Send reset link" : "إرسال رابط الاستعادة" : en ? "Change password" : "تغيير كلمة المرور";
  if (done) return <p role="status">{request ? en ? "If the address is registered, check your inbox for a reset link." : "تحقق من بريدك للحصول على رابط الاستعادة إذا كان الحساب مسجلاً."
    : en ? "Your password has been changed." : "تم تغيير كلمة المرور."}</p>;
  return <form className="password-form" onSubmit={async e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") || "");
    if (!request && (!validPassword(password) || password !== data.get("confirmation"))) {
      showToast({kind:"error",message:en ? "Use 8–128 characters and enter the same password twice." : "أدخل كلمة مرور من ٨ إلى ١٢٨ حرفاً وأكدها بالتطابق."});return;
    }
    setBusy(true);
    try {
      const endpoint = mode === "change" ? "password" : mode === "request" ? "password-reset" : "password-reset/complete";
      const response = await fetch("/api/auth/"+endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(request ? {email:data.get("email"),store_slug:storeSlug} : {password,token_hash:token,code})});
      if (!response.ok) throw Error();
      setDone(true);
      showToast({kind:"success",message:request ? en ? "Request received" : "تم استلام الطلب" : en ? "Password changed" : "تم تغيير كلمة المرور"});
    } catch { showToast({kind:"error",message: mode === "recover" ? en ? "This link expired or the password was rejected. Request a new link." : "انتهت صلاحية الرابط أو تعذّر قبول كلمة المرور. اطلب رابطاً جديداً."
      : en ? "Could not complete the request. Try again or sign in again." : "تعذّر إتمام الطلب. أعد المحاولة أو سجّل الدخول مجدداً."}); }
    finally { setBusy(false); }
  }}>
    {request ? <label>{en ? "Email address" : "البريد الإلكتروني"}<input name="email" type="email" dir="ltr" autoComplete="email" required /></label> :
      <><label>{en?"New password":"كلمة المرور الجديدة"}<input type="password" name="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <label>{en?"Confirm new password":"تأكيد كلمة المرور الجديدة"}<input type="password" name="confirmation" dir="ltr" autoComplete="new-password" required /></label></>}
    <button className="cta" disabled={busy}>{label}</button>
  </form>;
}
