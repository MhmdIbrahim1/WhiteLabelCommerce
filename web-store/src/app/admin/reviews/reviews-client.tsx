"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Star,
  CheckCircle2,
  Eye,
  EyeOff,
  MessageSquareReply,
  Package,
  ExternalLink,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { formatDate, localizedText, type Lang } from "@/lib/i18n";
import { authorInitials, formatRatingScore, withReviewReply } from "@/lib/reviews-wishlist";
import { useReviewReplies } from "@/components/use-review-replies";
import { ReviewThread, ReplyComposer } from "@/components/review-thread";
import type { ReviewReply } from "@/lib/reviews-wishlist";
import { answerFollowUpAction } from "./actions";
import { moderateReviewAction } from "../mutations";

export type AdminReviewItem = {
  id: string;
  store_id: string;
  product_id: string;
  user_id: string;
  order_id: string | null;
  author_name: string;
  rating: number;
  comment: string;
  is_verified_purchase: boolean;
  status: "published" | "hidden";
  review_replies: ReviewReply[];
  admin_reply: string | null;
  admin_replied_at: string | null;
  created_at: string;
  updated_at: string;
  product_name_ar: string;
  product_name_en: string;
  product_image_url: string | null;
};

type FilterTab = "all" | "needs_reply" | "hidden";

function needsReply(review: AdminReviewItem) {
  return review.status === "published" && (!review.admin_reply ||
    (review.review_replies.some((r) => r.role === "customer") && !review.review_replies.some((r) => r.role === "merchant")));
}

export function AdminReviewsClient({
  initialReviews,
  initialLang,
  basePath,
}: {
  initialReviews: AdminReviewItem[];
  initialLang: Lang;
  basePath: string;
}) {
  const { lang: ctxLang } = useLanguage();
  const lang = ctxLang ?? initialLang;
  const isEn = lang === "en";

  const [reviews, setReviews] = useState<AdminReviewItem[]>(initialReviews);
  useReviewReplies(initialReviews[0]?.store_id, setReviews);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const kpis = useMemo(() => {
    const published = reviews.filter((r) => r.status === "published");
    const avg =
      published.length > 0
        ? published.reduce((s, r) => s + r.rating, 0) / published.length
        : 0;
    const awaitingReply = reviews.filter(needsReply).length;
    const hidden = reviews.filter((r) => r.status === "hidden").length;
    return {
      avg,
      total: reviews.length,
      needsReply: awaitingReply,
      hidden,
    };
  }, [reviews]);

  const visibleReviews = useMemo(() => {
    if (filter === "needs_reply") {
      return reviews.filter(needsReply);
    }
    if (filter === "hidden") {
      return reviews.filter((r) => r.status === "hidden");
    }
    return reviews;
  }, [reviews, filter]);

  async function handleToggleStatus(item: AdminReviewItem) {
    const nextStatus = item.status === "published" ? "hidden" : "published";
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await moderateReviewAction({
        reviewId: item.id,
        status: nextStatus,
      });
      if (!res.ok) {
        setNotice({
          kind: "err",
          text: isEn
            ? "Could not update review visibility."
            : "تعذر تحديث حالة التقييم.",
        });
        return;
      }
      setReviews((prev) =>
        prev.map((r) =>
          r.id === item.id ? { ...r, status: res.review.status } : r,
        ),
      );
      setNotice({
        kind: "ok",
        text:
          nextStatus === "published"
            ? isEn
              ? "Review published and rating updated."
              : "تم نشر التقييم وتحديث متوسط التقييم."
            : isEn
              ? "Review hidden from storefront."
              : "تم إخفاء التقييم من واجهة المتجر.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveReply(item: AdminReviewItem, body: string) {
    setBusyId(item.id);
    setNotice(null);
    try {
      if (item.review_replies.length) {
        const res = await answerFollowUpAction(item.id, body);
        if (!res.ok) return false;
        setReviews((prev) => prev.map((r) => r.id === item.id
          ? withReviewReply(r, res.reply) : r));
        setExpanded((prev) => ({ ...prev, [item.id]: true }));
      } else {
        const res = await moderateReviewAction({ reviewId: item.id, status: item.status, adminReply: body });
        if (!res.ok) return false;
        setReviews((prev) => prev.map((r) => r.id === item.id
          ? { ...r, admin_reply: res.review.admin_reply, admin_replied_at: res.review.admin_replied_at } : r));
      }
      setEditingId(null);
      setNotice({ kind: "ok", text: isEn ? "Store reply saved." : "تم حفظ رد المتجر." });
      return true;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>
            {isEn ? "Verified Product Reviews" : "تقييمات المنتجات الموثّقة"}
          </h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
            {isEn
              ? "Moderate customer feedback, reply directly as your store, and keep ratings authentic."
              : "أدِر آراء المشترين الموثّقين، ردّ على تقييماتهم باسم متجرك، وتحكّم بظهورها بضغطة واحدة."}
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <div className="card" style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.25rem" }}>
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Average Rating" : "متوسط التقييم"}
          </small>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Star size={19} fill="#F59E0B" stroke="#F59E0B" />
            <strong style={{ fontSize: "1.45rem" }}>
              {kpis.avg > 0 ? formatRatingScore(kpis.avg) : "—"}
            </strong>
          </div>
        </div>

        <div className="card" style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.25rem" }}>
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Total Reviews" : "إجمالي التقييمات"}
          </small>
          <strong style={{ fontSize: "1.45rem" }}>{kpis.total}</strong>
        </div>

        <div className="card" style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.25rem" }}>
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Needs Reply" : "بانتظار الرد"}
          </small>
          <strong style={{ fontSize: "1.45rem", color: kpis.needsReply > 0 ? "#D97706" : "inherit" }}>
            {kpis.needsReply}
          </strong>
        </div>

        <div className="card" style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.25rem" }}>
          <small style={{ color: "var(--muted)", fontWeight: 600 }}>
            {isEn ? "Hidden Reviews" : "تقييمات مخفية"}
          </small>
          <strong style={{ fontSize: "1.45rem", color: "var(--muted)" }}>
            {kpis.hidden}
          </strong>
        </div>
      </div>

      {/* Quick Filter Tabs & Status Notice */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div
          role="tablist"
          aria-label={isEn ? "Filter reviews" : "تصفية التقييمات"}
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          {(
            [
              {
                key: "all" as const,
                label: isEn ? `All (${kpis.total})` : `الكل (${kpis.total})`,
              },
              {
                key: "needs_reply" as const,
                label: isEn
                  ? `Needs Reply (${kpis.needsReply})`
                  : `بانتظار الرد (${kpis.needsReply})`,
              },
              {
                key: "hidden" as const,
                label: isEn
                  ? `Hidden (${kpis.hidden})`
                  : `مخفي (${kpis.hidden})`,
              },
            ]
          ).map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.key)}
                style={{
                  background: active ? "var(--primary)" : "var(--surface)",
                  color: active ? "#ffffff" : "var(--ink)",
                  border: active
                    ? "1px solid var(--primary)"
                    : "1px solid var(--line)",
                  borderRadius: "999px",
                  padding: "0.42rem 0.95rem",
                  fontSize: "0.84rem",
                  fontWeight: 650,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {notice && (
          <div
            role="status"
            style={{
              padding: "0.45rem 0.85rem",
              borderRadius: "10px",
              fontSize: "0.84rem",
              fontWeight: 600,
              background: notice.kind === "ok" ? "#ecfdf5" : "#fef2f2",
              color: notice.kind === "ok" ? "#047857" : "#b91c1c",
              border: `1px solid ${notice.kind === "ok" ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            {notice.text}
          </div>
        )}
      </div>

      {/* Reviews Moderation List */}
      {visibleReviews.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "2.25rem 1.25rem",
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          <p style={{ margin: 0 }}>
            {filter === "all"
              ? isEn
                ? "No verified product reviews yet for this store."
                : "لا توجد تقييمات موثّقة لهذا المتجر بعد."
              : isEn
                ? "No reviews match this filter."
                : "لا توجد تقييمات ضمن هذا التصنيف."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.9rem" }}>
          {visibleReviews.map((item) => {
            const productTitle = localizedText(
              lang,
              item.product_name_ar,
              item.product_name_en,
            );
            const editorKey = `${item.id}-${item.review_replies.length}`;
            const isEditing = editingId === editorKey;
            const isBusy = busyId === item.id;
            const isPublished = item.status === "published";

            return (
              <article
                key={item.id}
                className="card"
                style={{
                  padding: "1.1rem 1.2rem",
                  display: "grid",
                  gap: "0.85rem",
                  opacity: isPublished ? 1 : 0.78,
                  borderColor: isPublished ? undefined : "#cbd5e1",
                }}
              >
                {/* Top row: Product + Visibility toggle */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.85rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.7rem",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "10px",
                        overflow: "hidden",
                        background: "#f1f5f9",
                        display: "inline-grid",
                        placeItems: "center",
                        flexShrink: 0,
                        position: "relative",
                      }}
                    >
                      {item.product_image_url ? (
                        <Image
                          src={item.product_image_url}
                          alt={productTitle}
                          fill
                          unoptimized
                          style={{ objectFit: "cover" }}
                        />
                      ) : (
                        <Package size={18} color="#64748b" />
                      )}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`${basePath}/products/${item.product_id}#reviews`}
                        target="_blank"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          fontWeight: 700,
                          fontSize: "0.93rem",
                          color: "var(--ink)",
                          textDecoration: "none",
                        }}
                      >
                        <span>{productTitle || item.product_id.slice(0, 8)}</span>
                        <ExternalLink size={13} />
                      </Link>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                          marginTop: "0.18rem",
                          fontSize: "0.8rem",
                          color: "var(--muted)",
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "999px",
                            background: "color-mix(in srgb, var(--primary) 12%, transparent)",
                            color: "var(--primary)",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            display: "inline-grid",
                            placeItems: "center",
                          }}
                        >
                          {authorInitials(item.author_name)}
                        </span>
                        <strong style={{ color: "var(--ink)" }}>
                          {item.author_name}
                        </strong>
                        {item.is_verified_purchase && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.22rem",
                              padding: "0.12rem 0.48rem",
                              borderRadius: "999px",
                              background: "#ecfdf5",
                              color: "#047857",
                              fontSize: "0.72rem",
                              fontWeight: 650,
                            }}
                          >
                            <CheckCircle2 size={11} />
                            {isEn ? "Verified" : "مشتري موثّق"}
                          </span>
                        )}
                        <span>· {formatDate(item.created_at, lang)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.22rem",
                        padding: "0.24rem 0.62rem",
                        borderRadius: "999px",
                        background: "#fffbeb",
                        color: "#b45309",
                        border: "1px solid #fde68a",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                      }}
                    >
                      <Star size={13} fill="#F59E0B" stroke="#F59E0B" />
                      <span>{item.rating}.0</span>
                    </span>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleToggleStatus(item)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.32rem",
                        padding: "0.35rem 0.78rem",
                        borderRadius: "999px",
                        fontSize: "0.8rem",
                        fontWeight: 650,
                        background: isPublished ? "#ecfdf5" : "#f1f5f9",
                        color: isPublished ? "#047857" : "#475569",
                        border: `1px solid ${isPublished ? "#a7f3d0" : "#cbd5e1"}`,
                      }}
                    >
                      {isPublished ? <Eye size={14} /> : <EyeOff size={14} />}
                      <span>
                        {isPublished
                          ? isEn
                            ? "Published · Hide"
                            : "منشور · إخفاء"
                          : isEn
                            ? "Hidden · Publish"
                            : "مخفي · نشر"}
                      </span>
                    </button>

                    {(!item.review_replies.length || needsReply(item)) && (
                      <button type="button" className="review-thread-link" disabled={busyId !== null}
                        onClick={() => {
                          setEditingId(isEditing ? null : editorKey);
                          if (item.review_replies.length) setExpanded((prev) => ({ ...prev, [item.id]: true }));
                        }}>
                        <MessageSquareReply size={14} /> {item.review_replies.length
                          ? (isEn ? "Answer follow-up" : "الرد على العميل")
                          : item.admin_reply ? (isEn ? "Edit Reply" : "تعديل الرد") : (isEn ? "Reply" : "رد على التقييم")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Comment Body */}
                {item.comment.trim() && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.93rem",
                      lineHeight: 1.65,
                      color: "var(--ink)",
                    }}
                  >
                    {item.comment}
                  </p>
                )}

                <ReviewThread review={item} lang={lang} expanded={!!expanded[item.id]}
                  onToggle={(open) => setExpanded((prev) => ({ ...prev, [item.id]: open }))} />
                {isEditing && (
                  <ReplyComposer lang={lang} label={isEn ? "Store Reply" : "رد المتجر"}
                    initial={item.review_replies.length ? "" : item.admin_reply ?? ""}
                    limit={item.review_replies.length ? 500 : 1500}
                    allowClear={!!item.admin_reply && !item.review_replies.length}
                    onCancel={() => setEditingId(null)} onSave={(body) => handleSaveReply(item, body)} />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
