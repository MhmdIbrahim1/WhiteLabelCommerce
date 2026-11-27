"use client";

import { useId, useState, type ReactNode } from "react";
import { useHydrated } from "@/components/use-hydrated";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({ en, label, name = "password", newPassword = false, minLength, maxLength, extra }: {
  en: boolean; label: string; name?: string; newPassword?: boolean; minLength?: number; maxLength?: number; extra?: ReactNode;
}) {
  const id = useId();
  const interactive = useHydrated();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  const toggle = visible ? (en ? "Hide password" : "إخفاء كلمة المرور") : (en ? "Show password" : "إظهار كلمة المرور");
  const hint = newPassword && minLength
    ? (en ? `At least ${minLength} characters` : `كلمة مرور من ${minLength.toLocaleString("ar-EG")} أحرف على الأقل`) : undefined;
  return <div className="auth-password-field">
    <div className="auth-label-line"><label htmlFor={id}>{label}</label>{extra}</div>
    <div className="auth-password-control">
      <input id={id} name={name} type={visible ? "text" : "password"} dir="auto" placeholder={hint}
        autoComplete={newPassword ? "new-password" : "current-password"} minLength={minLength} maxLength={maxLength} required />
      <button type="button" className="auth-eye" disabled={!interactive} aria-controls={id} aria-label={toggle} title={toggle}
        onClick={() => setVisible(v => !v)}><Icon size={19} strokeWidth={1.5} aria-hidden="true" /></button>
    </div>
  </div>;
}
