"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Eye, EyeOff, MessageSquareReply, Package, Star } from "lucide-react";
import { ToastFeedback } from "@/components/floating-toast";
import { ReviewThread, ReplyComposer } from "@/components/review-thread";
import { browserDb } from "@/lib/supabase/browser";
import { formatDate, localizedText, type Lang } from "@/lib/i18n";
import type { DirectoryReview } from "@/lib/review-directory";
import { answerFollowUpAction } from "./actions";
import { moderateReviewAction } from "../mutations";
import "./reviews.css";

type Review = DirectoryReview & { product_image_url: string | null };

export function AdminReviewsClient({ reviews, storeId, lang, basePath }: {
  reviews: Review[]; storeId: string; lang: Lang; basePath: string;
}) {
  const router = useRouter();
  const en = lang === "en";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // A new customer turn can move a review into this page or change an off-page KPI.
  useEffect(() => {
    const db = browserDb();
    const channel = db.channel("merchant-reviews-" + storeId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "review_replies", filter: "store_id=eq." + storeId },
        () => router.refresh()).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [router, storeId]);

  async function changeVisibility(item: Review) {
    const status = item.status === "published" ? "hidden" : "published";
    setBusyId(item.id);
    setNotice(null);
    try {
      const result = await moderateReviewAction({ reviewId: item.id, status });
      if (!result.ok) throw new Error("moderation_failed");
      setNotice({ kind: "success", text: status === "published"
        ? (en ? "Review published." : "تم نشر التقييم.") : (en ? "Review hidden." : "تم إخفاء التقييم.") });
    } catch {
      setNotice({ kind: "error", text: en ? "Could not update review visibility." : "تعذر تحديث حالة التقييم." });
    } finally { setBusyId(null); }
  }

  async function saveReply(item: Review, body: string) {
    setBusyId(item.id);
    try {
      const result = item.review_replies.length ? await answerFollowUpAction(item.id, body)
        : await moderateReviewAction({ reviewId: item.id, status: item.status, adminReply: body });
      if (!result.ok) return false;
      setEditingId(null);
      setExpanded(prev => ({ ...prev, [item.id]: true }));
      setNotice({ kind: "success", text: en ? "Store reply saved." : "تم حفظ رد المتجر." });
      return true;
    } finally { setBusyId(null); }
  }

  return <div className="ws-stack ws-reviews">
    {notice && <ToastFeedback message={notice.text} kind={notice.kind} />}
    {!reviews.length && <div className="ws-sheet ws-empty-state"><h3>{en ? "No reviews to show" : "لا توجد تقييمات للعرض"}</h3></div>}
    {reviews.map(item => {
      const title = localizedText(lang, item.product_name_ar ?? "", item.product_name_en) || item.product_id.slice(0, 8);
      const published = item.status === "published";
      const editorKey = item.id + "-" + item.review_replies.length;
      const editing = editingId === editorKey;
      return <article key={item.id} className="ws-box ws-stack ws-review">
        <header className="ws-review-head"><div className="ws-record">
          <span className="ws-thumb">{item.product_image_url
            ? <Image src={item.product_image_url} alt="" width={42} height={48} unoptimized />
            : <Package size={18} aria-hidden="true" />}</span>
          <div className="ws-cell-stack"><Link className="ws-text-link" href={basePath + "/products/" + item.product_id + "#reviews"} target="_blank">
            <bdi dir="auto">{title}</bdi><ExternalLink size={13} aria-hidden="true" /></Link>
            <div className="ws-review-meta"><strong><bdi dir="auto">{item.author_name}</bdi></strong>
              {item.is_verified_purchase && <span><CheckCircle2 size={13} aria-hidden="true" />{en ? "Verified purchase" : "شراء موثّق"}</span>}
              <time dateTime={item.created_at}><bdi dir="ltr">{formatDate(item.created_at, lang)}</bdi></time>
            </div></div>
        </div><span className="ws-review-score"><Star size={15} aria-hidden="true" /><bdi dir="ltr">{item.rating.toLocaleString(lang)} / {Number(5).toLocaleString(lang)}</bdi></span></header>
        {item.comment.trim() && <p dir="auto">{item.comment}</p>}
        <div className="ws-review-actions">
          <button type="button" className="ws-button" disabled={busyId !== null} onClick={() => void changeVisibility(item)}>
            {published ? <Eye size={15} /> : <EyeOff size={15} />}{published ? (en ? "Published · Hide" : "منشور · إخفاء") : (en ? "Hidden · Publish" : "مخفي · نشر")}
          </button>
          {(!item.review_replies.length || item.needs_reply) && <button type="button" className="ws-button" disabled={busyId !== null}
            aria-expanded={editing} onClick={() => {
              setEditingId(editing ? null : editorKey);
              if (item.review_replies.length) setExpanded(prev => ({ ...prev, [item.id]: true }));
            }}><MessageSquareReply size={15} />{item.review_replies.length ? (en ? "Answer follow-up" : "الرد على العميل")
              : item.admin_reply ? (en ? "Edit reply" : "تعديل الرد") : (en ? "Reply" : "رد على التقييم")}</button>}
        </div>
        <ReviewThread review={item} lang={lang} expanded={!!expanded[item.id]} onToggle={open => setExpanded(prev => ({ ...prev, [item.id]: open }))} />
        {editing && <ReplyComposer lang={lang} label={en ? "Store reply" : "رد المتجر"} initial={item.review_replies.length ? "" : item.admin_reply ?? ""}
          limit={item.review_replies.length ? 500 : 1500} allowClear={!!item.admin_reply && !item.review_replies.length}
          onCancel={() => setEditingId(null)} onSave={body => saveReply(item, body)} />}
      </article>;
    })}
  </div>;
}
