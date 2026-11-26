"use client";

import { ToastFeedback } from "@/components/floating-toast";
import { useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Megaphone,
  Radio,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { Lang } from "@/lib/i18n";
import {
  validateGa4Id,
  validateMetaPixelId,
  validateTiktokPixelId,
} from "@/lib/marketing";
import { saveMarketingPixelsAction } from "../mutations";

const CONVERSION_EVENTS = [
  {
    event: "PageView",
    ar: "مشاهدة أي صفحة في المتجر",
    en: "Storefront page navigation",
    meta: "PageView",
    tiktok: "ttq.page()",
    ga4: "page_view",
  },
  {
    event: "ViewContent",
    ar: "فتح صفحة تفاصيل منتج",
    en: "Opening a product detail page",
    meta: "ViewContent",
    tiktok: "ViewContent",
    ga4: "view_item",
  },
  {
    event: "AddToCart",
    ar: "إضافة منتج إلى السلة",
    en: "Adding an item to shopping bag",
    meta: "AddToCart",
    tiktok: "AddToCart",
    ga4: "add_to_cart",
  },
  {
    event: "InitiateCheckout",
    ar: "الانتقال إلى صفحة إتمام الطلب",
    en: "Entering checkout with bag items",
    meta: "InitiateCheckout",
    tiktok: "InitiateCheckout",
    ga4: "begin_checkout",
  },
  {
    event: "Purchase",
    ar: "تأكيد الطلب (مع منع التكرار لكل طلب)",
    en: "Order confirmation (deduplicated per order)",
    meta: "Purchase",
    tiktok: "CompletePayment",
    ga4: "purchase",
  },
] as const;

export function AdminMarketingClient({
  initialMetaPixelId,
  initialTiktokPixelId,
  initialGa4Id,
  storefrontPath,
  initialLang,
}: {
  initialMetaPixelId: string;
  initialTiktokPixelId: string;
  initialGa4Id: string;
  storefrontPath: string;
  initialLang: Lang;
}) {
  const { lang: ctxLang } = useLanguage();
  const lang = ctxLang ?? initialLang;
  const isEn = lang === "en";

  const [metaId, setMetaId] = useState(initialMetaPixelId);
  const [tiktokId, setTiktokId] = useState(initialTiktokPixelId);
  const [ga4Id, setGa4Id] = useState(initialGa4Id);
  const [savedIds, setSavedIds] = useState({
    meta: initialMetaPixelId,
    tiktok: initialTiktokPixelId,
    ga4: initialGa4Id,
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const metaValid = validateMetaPixelId(metaId);
  const tiktokValid = validateTiktokPixelId(tiktokId);
  const ga4Valid = validateGa4Id(ga4Id);

  const activeCount = [savedIds.meta, savedIds.tiktok, savedIds.ga4].filter(
    Boolean,
  ).length;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);

    if (!metaValid.valid) {
      setNotice({
        kind: "err",
        text: isEn
          ? "Meta Pixel ID must be 5–20 digits (numbers only)."
          : "معرّف Meta Pixel يجب أن يتكون من 5 إلى 20 رقماً فقط.",
      });
      return;
    }
    if (!tiktokValid.valid) {
      setNotice({
        kind: "err",
        text: isEn
          ? "TikTok Pixel ID must be 6–32 alphanumeric characters."
          : "معرّف TikTok Pixel يجب أن يتكون من 6 إلى 32 حرفاً أو رقماً.",
      });
      return;
    }
    if (!ga4Valid.valid) {
      setNotice({
        kind: "err",
        text: isEn
          ? "GA4 Measurement ID must follow the format G-XXXXXXXXXX."
          : "معرّف GA4 يجب أن يبدأ بـ G- متبوعاً بأحرف وأرقام (مثال: G-XXXXXXXXXX).",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await saveMarketingPixelsAction({
        metaPixelId: metaValid.value,
        tiktokPixelId: tiktokValid.value,
        ga4MeasurementId: ga4Valid.value,
      });

      if (!res.ok) {
        setNotice({
          kind: "err",
          text: isEn
            ? "Could not save pixel settings. Please verify your IDs."
            : "تعذر حفظ إعدادات البكسل. تحقق من صحة المعرّفات وحاول مجدداً.",
        });
        return;
      }

      setMetaId(res.metaPixelId);
      setTiktokId(res.tiktokPixelId);
      setGa4Id(res.ga4MeasurementId);
      setSavedIds({
        meta: res.metaPixelId,
        tiktok: res.tiktokPixelId,
        ga4: res.ga4MeasurementId,
      });
      setNotice({
        kind: "ok",
        text: isEn
          ? "Ad Pixel settings saved and activated on your storefront!"
          : "تم حفظ إعدادات بكسلات الإعلانات وتفعيلها مباشرة على متجرك!",
      });
    } finally {
      setSaving(false);
    }
  }

  const testUrl = `${storefrontPath}${storefrontPath.includes("?") ? "&" : "?"}wlc_pixel_test=1`;

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
            {isEn
              ? "Ad Pixels & Conversion Tracking"
              : "بكسلات الإعلانات وتتبع التحويلات"}
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0",
              color: "var(--muted)",
              fontSize: "0.9rem",
            }}
          >
            {isEn
              ? "Connect Meta, TikTok, and Google Analytics 4 for this store. Events fire strictly per tenant with purchase deduplication."
              : "اربط Meta و TikTok و Google Analytics 4 لمتجرك فقط. تُرسل أحداث التحويل تلقائياً بدقة مع منع التكرار."}
          </p>
        </div>

        <a
          href={testUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-outline-admin"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            padding: "0.52rem 0.95rem",
            borderRadius: "10px",
            fontWeight: 700,
            fontSize: "0.84rem",
          }}
        >
          <Radio size={15} />
          <span>
            {isEn ? "Test Pixel Events" : "معاينة وإرسال حدث تجريبي"}
          </span>
          <ExternalLink size={13} />
        </a>
      </div>

      {/* Active Summary Banner */}
      <div
        className="card"
        style={{
          padding: "0.9rem 1.15rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
          }}
        >
          <Megaphone size={18} color="var(--primary)" />
          <strong>
            {isEn
              ? `${activeCount} / 3 Tracking Channels Active`
              : `${activeCount} / 3 قنوات تتبع مفعّلة`}
          </strong>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.8rem",
            color: "var(--muted)",
          }}
        >
          <ShieldCheck size={15} color="#047857" />
          {isEn
            ? "Strict multi-tenant isolation · Zero double-initialization"
            : "عزل كامل لكل متجر · لا يتم التهيئة المزدوجة مطلقاً"}
        </span>
      </div>

      {notice && <ToastFeedback message={notice.text} kind={notice.kind === "ok" ? "success" : "error"} />}

      {/* Pixel Configuration Cards */}
      <form onSubmit={handleSave} style={{ display: "grid", gap: "1rem", marginTop: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Meta Pixel Card */}
          <section
            className="card"
            style={{
              padding: "1.15rem 1.2rem",
              display: "grid",
              gap: "0.75rem",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <strong style={{ fontSize: "1rem" }}>
                {isEn ? "Meta (Facebook) Pixel" : "Meta (فيسبوك وإنستغرام) Pixel"}
              </strong>
              <StatusPill active={Boolean(savedIds.meta)} isEn={isEn} />
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>
              {isEn
                ? "Tracks Facebook & Instagram ad conversions, retargeting audiences, and ROAS."
                : "يتتبع تحويلات إعلانات فيسبوك وإنستغرام، إعادة الاستهداف، والعائد على الإنفاق الإعلاني."}
            </p>
            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.82rem", fontWeight: 700 }}>
              <span>{isEn ? "Meta Pixel ID" : "معرّف Meta Pixel"}</span>
              <input
                type="text"
                dir="ltr"
                inputMode="numeric"
                value={metaId}
                onChange={(e) => setMetaId(e.target.value)}
                placeholder="123456789012345"
                maxLength={24}
                style={{
                  borderColor: metaValid.valid ? undefined : "#dc2626",
                }}
              />
              <small style={{ color: metaValid.valid ? "var(--muted)" : "#b91c1c" }}>
                {isEn ? "Numbers only (5–20 digits)" : "أرقام فقط (من 5 إلى 20 رقماً)"}
              </small>
            </label>
          </section>

          {/* TikTok Pixel Card */}
          <section
            className="card"
            style={{
              padding: "1.15rem 1.2rem",
              display: "grid",
              gap: "0.75rem",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <strong style={{ fontSize: "1rem" }}>
                {isEn ? "TikTok Pixel" : "TikTok Pixel"}
              </strong>
              <StatusPill active={Boolean(savedIds.tiktok)} isEn={isEn} />
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>
              {isEn
                ? "Optimizes TikTok Ads campaigns with real-time ViewContent, AddToCart, and CompletePayment events."
                : "يحسّن حملات إعلانات تيك توك بأحداث المشاهدة والإضافة للسلة وإتمام الشراء لحظياً."}
            </p>
            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.82rem", fontWeight: 700 }}>
              <span>{isEn ? "TikTok Pixel ID" : "معرّف TikTok Pixel"}</span>
              <input
                type="text"
                dir="ltr"
                value={tiktokId}
                onChange={(e) => setTiktokId(e.target.value)}
                placeholder="C9ABCDEFGHIJ12345678"
                maxLength={36}
                style={{
                  borderColor: tiktokValid.valid ? undefined : "#dc2626",
                }}
              />
              <small style={{ color: tiktokValid.valid ? "var(--muted)" : "#b91c1c" }}>
                {isEn ? "Alphanumeric ID (6–32 chars)" : "حروف وأرقام إنجليزية (6 إلى 32 حرفاً)"}
              </small>
            </label>
          </section>

          {/* GA4 Card */}
          <section
            className="card"
            style={{
              padding: "1.15rem 1.2rem",
              display: "grid",
              gap: "0.75rem",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <strong style={{ fontSize: "1rem" }}>
                {isEn ? "Google Analytics 4 (GA4)" : "إحصاءات جوجل (GA4)"}
              </strong>
              <StatusPill active={Boolean(savedIds.ga4)} isEn={isEn} />
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>
              {isEn
                ? "Full e-commerce funnel analytics including view_item, add_to_cart, begin_checkout, and purchase."
                : "تحليلات متكاملة لمسار الشراء تشمل مشاهدة المنتجات والسلة وإتمام الدفع والمبيعات."}
            </p>
            <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.82rem", fontWeight: 700 }}>
              <span>{isEn ? "GA4 Measurement ID" : "معرّف القياس GA4"}</span>
              <input
                type="text"
                dir="ltr"
                value={ga4Id}
                onChange={(e) => setGa4Id(e.target.value)}
                placeholder="G-XXXXXXXXXX"
                maxLength={24}
                style={{
                  borderColor: ga4Valid.valid ? undefined : "#dc2626",
                }}
              />
              <small style={{ color: ga4Valid.valid ? "var(--muted)" : "#b91c1c" }}>
                {isEn ? "Starts with G- (e.g. G-AB12CD34EF)" : "يبدأ بـ G- (مثال: G-AB12CD34EF)"}
              </small>
            </label>
          </section>
        </div>

        <div>
          <button type="submit" disabled={saving}>
            <Save size={16} />
            <span>
              {saving
                ? isEn
                  ? "Saving…"
                  : "جارٍ الحفظ…"
                : isEn
                  ? "Save Pixel Settings"
                  : "حفظ إعدادات البكسلات"}
            </span>
          </button>
        </div>
      </form>

      {/* Supported Conversion Events Matrix */}
      <section className="card" style={{ padding: "1.15rem 1.25rem", display: "grid", gap: "0.85rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {isEn ? "Automated E-Commerce Conversion Events" : "أحداث التحويل المفعّلة تلقائياً"}
          </h2>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.84rem", color: "var(--muted)" }}>
            {isEn
              ? "Every standard funnel event fires automatically once your pixel IDs are saved."
              : "يتم إرسال جميع أحداث التجارة الإلكترونية القياسية تلقائياً فور حفظ المعرّفات."}
          </p>
        </div>

        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{isEn ? "Storefront Event" : "الحدث"}</th>
                <th>{isEn ? "Trigger" : "متى يُرسل"}</th>
                <th>Meta</th>
                <th>TikTok</th>
                <th>GA4</th>
              </tr>
            </thead>
            <tbody>
              {CONVERSION_EVENTS.map((row) => (
                <tr key={row.event}>
                  <td>
                    <strong dir="ltr">{row.event}</strong>
                  </td>
                  <td>{isEn ? row.en : row.ar}</td>
                  <td>
                    <code dir="ltr">{row.meta}</code>
                  </td>
                  <td>
                    <code dir="ltr">{row.tiktok}</code>
                  </td>
                  <td>
                    <code dir="ltr">{row.ga4}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ active, isEn }: { active: boolean; isEn: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.28rem",
        padding: "0.2rem 0.6rem",
        borderRadius: "999px",
        fontSize: "0.74rem",
        fontWeight: 700,
        background: active ? "#ecfdf5" : "#f1f5f9",
        color: active ? "#047857" : "#475569",
        border: `1px solid ${active ? "#a7f3d0" : "#cbd5e1"}`,
        whiteSpace: "nowrap",
      }}
    >
      {active ? <CheckCircle2 size={12} /> : <CircleDashed size={12} />}
      <span>{active ? (isEn ? "Active" : "مفعّل") : isEn ? "Inactive" : "غير مفعّل"}</span>
    </span>
  );
}
