"use client";

import { useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { FOLLOW_UP_LIMIT, type ProductReview } from "@/lib/reviews-wishlist";
import "./review-thread.css";

type Thread = Pick<ProductReview, "admin_reply" | "admin_replied_at" | "review_replies">;

export function ReviewThread({ review, lang, expanded, onToggle }: {
  review: Thread; lang: Lang; expanded?: boolean; onToggle?: (open: boolean) => void;
}) {
  if (!review.admin_reply) return null;
  const isEn = lang === "en";
  const timestamp = new Intl.DateTimeFormat(isEn ? "en-GB" : "ar-EG", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo",
  });
  const opening = { role: "merchant", body: review.admin_reply, created_at: review.admin_replied_at };
  const turns = [opening, ...[...(review.review_replies ?? [])].sort((a, b) => a.role.localeCompare(b.role))];
  const body = turns.map((turn, index) => (
    <div className="review-thread-turn" key={index}>
      <div className="review-thread-meta">
        <strong data-role={turn.role}>{turn.role === "customer" ? (isEn ? "Customer Follow-up" : "رد العميل") : (isEn ? "Store Reply" : "رد المتجر")}</strong>
        {turn.created_at && <time dateTime={turn.created_at}>{timestamp.format(new Date(turn.created_at))}</time>}
      </div>
      <p dir="auto">{turn.body}</p>
    </div>
  ));
  if (turns.length === 1) return <div className="review-thread">{body}</div>;
  return (
    <details className="review-thread" open={expanded} onToggle={onToggle && ((e) => onToggle(e.currentTarget.open))}>
      <summary>{isEn ? "Customer Follow-up" : "رد العميل"} · {turns.length.toLocaleString(isEn ? "en" : "ar-EG")} {isEn ? "replies" : "ردود"}</summary>
      {body}
    </details>
  );
}

export function ReplyComposer({ label, lang, initial = "", limit = FOLLOW_UP_LIMIT, allowClear = false,
  onCancel, onSave }: {
  label: string; lang: Lang; initial?: string; limit?: number; allowClear?: boolean;
  onCancel: () => void; onSave: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const count = Array.from(body).length;
  const valid = (allowClear || !!body.trim()) && count <= limit;
  const isEn = lang === "en";
  return (
    <form className="review-thread-editor" onSubmit={async (e) => {
      e.preventDefault();
      if (!valid || lock.current) return;
      lock.current = true;
      setBusy(true);
      setFailed(false);
      try { setFailed(!await onSave(body.trim())); }
      catch { setFailed(true); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <label>{label}<textarea autoFocus rows={3} value={body} disabled={busy}
        onChange={(e) => setBody(e.target.value)} aria-invalid={count > limit} /></label>
      <small dir="ltr">{count} / {limit}</small>
      {failed && <span role="alert">{isEn ? "Couldn’t save your reply. Refresh to check the conversation." : "تعذر حفظ الرد. حدّث الصفحة لمراجعة الردود."}</span>}
      <div>
        <button type="submit" disabled={busy || !valid}>{isEn ? "Save reply" : "حفظ الرد"}</button>
        <button type="button" className="review-thread-link" disabled={busy} onClick={onCancel}>{isEn ? "Cancel" : "إلغاء"}</button>
      </div>
    </form>
  );
}
