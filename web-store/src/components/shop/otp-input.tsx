"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { emptyOtp, enterOtp, navigateOtp, normalizeOtp, OTP_LENGTH, RESEND_SECONDS } from "@/lib/email-otp";

export function useResendCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (!until) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time >= until) setUntil(0);
    };
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [until]);
  function start(delay = RESEND_SECONDS) {
    const time = Date.now();
    setNow(time);
    setUntil(time + delay * 1000);
  }
  return { seconds, start };
}

export function ResendCode({ en, seconds, busy, onClick }: { en: boolean; seconds: number; busy: boolean; onClick: () => void }) {
  return <button type="button" className="hybrid-link-btn" disabled={busy || seconds > 0} onClick={onClick}>
    {seconds ? <>{en ? "Resend in " : "إعادة الإرسال خلال "}<bdi dir="ltr">{seconds}</bdi>{en ? "s" : " ثانية"}</>
      : en ? "Request a new code" : "إعادة إرسال الرمز"}
  </button>;
}

export function OtpInput({ en, busy, errorId, onChange, submitRef }: {
  en: boolean; busy: boolean; errorId?: string; onChange: (value: string) => void;
  submitRef: RefObject<HTMLButtonElement | null>;
}) {
  const [cells, setCells] = useState(emptyOtp);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const heading = useId();
  const frame = useRef(0);
  useEffect(() => {
    inputs.current[0]?.focus();
    return () => cancelAnimationFrame(frame.current);
  }, []);
  function apply(edit: { cells: string[]; focus: number }) {
    setCells(edit.cells);
    onChange(edit.cells.join(""));
    if (edit.focus === OTP_LENGTH && edit.cells.every(Boolean)) {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => submitRef.current?.focus());
    } else {
      const next = inputs.current[Math.min(edit.focus, OTP_LENGTH - 1)];
      next?.focus();
      next?.select();
    }
  }
  return <div className="otp-field"><span id={heading}>{en ? "6-digit verification code" : "رمز التحقق من ٦ أرقام"}</span>
    <div className="otp-boxes tabular-nums" role="group" dir="ltr" aria-labelledby={heading} aria-describedby={errorId} aria-busy={busy}>
      {cells.map((digit, index) => <input key={index} ref={el => { inputs.current[index] = el; }}
        type="text" dir="ltr" inputMode="numeric" pattern="[0-9]*" autoComplete={index === 0 ? "one-time-code" : "off"}
        aria-label={en ? `Digit ${index + 1} of 6` : `الرقم ${index + 1} من ٦`} aria-invalid={Boolean(errorId)} aria-describedby={errorId}
        value={digit} disabled={busy} required onFocus={e => e.target.select()}
        onChange={e => {
          if (!e.target.value) return apply(navigateOtp(cells, index, "Delete")!);
          apply(enterOtp(cells, index, e.target.value));
        }}
        onKeyDown={e => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const edit = navigateOtp(cells, index, e.key);
          if (edit) { e.preventDefault(); apply(edit); }
          else if (/^\d$/.test(normalizeOtp(e.key))) { e.preventDefault(); apply(enterOtp(cells, index, e.key)); }
        }}
        onPaste={e => { e.preventDefault(); apply(enterOtp(cells, index, e.clipboardData.getData("text"))); }}
      />)}
    </div>
  </div>;
}
