"use client";

import { useState, type FormEvent } from "react";
import { completeStoreOnboardingAction } from "@/app/login/storefront-actions";
import { authMessage, onboardingProfile, type AuthErrorCode } from "@/lib/auth-flow";
import { useLanguage } from "@/components/language-provider";
import { useHydrated } from "@/components/use-hydrated";

export function OnboardingForm({ expectedUserId, initialName, next }: { expectedUserId: string; initialName: string; next: string }) {
  const en = useLanguage().lang === "en";
  const interactive = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactive || busy) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("full_name") ?? ""), phone = String(form.get("phone") ?? "");
    const profile = onboardingProfile(name, phone);
    if (profile.errorCode) { setError(profile.errorCode); return; }
    setError(undefined);
    setBusy(true);
    try {
      const result = await completeStoreOnboardingAction(name, phone, next, expectedUserId);
      if (result.ok && result.redirectTo) { window.location.replace(result.redirectTo); return; }
      setError(result.errorCode ?? "server");
    } catch { setError("network"); }
    setBusy(false);
  }
  return <form className="auth-form" onSubmit={submit}>
    <label>{en ? "Full name" : "الاسم الكامل"}<input required dir="auto" name="full_name" autoComplete="name" minLength={2} maxLength={100}
      defaultValue={initialName} aria-invalid={error === "name"} /></label>
    <label>{en ? "Mobile phone (optional)" : "رقم الموبايل (اختياري)"}<input dir="ltr" type="tel" name="phone" autoComplete="tel"
      maxLength={24} placeholder="01012345678" aria-invalid={error === "phone" || error === "phone_already_in_use"} /></label>
    {error && <p role="alert" className="auth-error">{authMessage(error, en)}</p>}
    <button className="auth-submit-btn" disabled={!interactive || busy} aria-busy={busy}>{en ? "Complete profile" : "إكمال البيانات"}</button>
  </form>;
}
