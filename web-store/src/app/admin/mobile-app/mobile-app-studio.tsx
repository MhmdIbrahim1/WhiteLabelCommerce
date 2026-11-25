"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Smartphone,
  Lock,
  Sparkles,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Rocket,
  Clock,
  XCircle,
  X,
  MessageCircle,
  Mail,
  QrCode,
  ShieldCheck,
  Search,
  Heart,
  Bell,
  ShoppingBag,
  Upload,
  Link2,
  Trash2,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { date } from "@/lib/brand";
import { generateQrSvg } from "@/lib/qr-svg";
import type { MobileAppAccess, StorePlan } from "@/lib/tenant-shared";
import type { StoreAppBuildRow } from "@/app/api/admin/mobile-builds/route";

type StudioStoreProps = {
  storeId: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  plan: StorePlan;
  mobileAppAccess: MobileAppAccess;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  packageId: string;
  whatsappNumber: string;
  supportEmail: string;
};

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function AndroidPhoneMockup({
  appName,
  iconUrl,
  primaryColor,
  isEn,
  locked = false,
}: {
  appName: string;
  iconUrl: string;
  primaryColor: string;
  isEn: boolean;
  locked?: boolean;
}) {
  const safeAccent = /^#[0-9a-fA-F]{6}$/.test(primaryColor)
    ? primaryColor
    : "#0f172a";
  return (
    <div
      style={{
        width: "268px",
        marginInline: "auto",
        borderRadius: "34px",
        padding: "10px",
        background: "linear-gradient(145deg, #0f172a, #1e293b)",
        boxShadow: "0 20px 50px rgba(15, 23, 42, 0.22)",
        position: "relative",
      }}
    >
      {/* Notch / Camera pill */}
      <div
        style={{
          width: "74px",
          height: "14px",
          borderRadius: "999px",
          background: "#020617",
          margin: "2px auto 8px",
        }}
      />
      {/* Phone Screen */}
      <div
        style={{
          borderRadius: "24px",
          background: "#f8fafc",
          overflow: "hidden",
          minHeight: "430px",
          display: "flex",
          flexDirection: "column",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        {/* Clean Decluttered Top App Bar Preview */}
        <div
          style={{
            background: "#ffffff",
            padding: "11px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              minWidth: 0,
            }}
          >
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt={appName}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "7px",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "7px",
                  background: safeAccent,
                  color: "#ffffff",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  display: "inline-grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {(appName || "S").slice(0, 1).toUpperCase()}
              </span>
            )}
            <strong
              style={{
                fontSize: "0.82rem",
                color: "#0f172a",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {appName || (isEn ? "Your Store" : "متجرك")}
            </strong>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: safeAccent,
              flexShrink: 0,
            }}
          >
            <Search size={14} />
            <Heart size={14} />
            <Bell size={14} />
          </div>
        </div>

        {/* Hero Banner Preview */}
        <div style={{ padding: "12px", display: "grid", gap: "10px", flex: 1 }}>
          <div
            style={{
              borderRadius: "14px",
              padding: "14px",
              background: `linear-gradient(135deg, ${safeAccent}, #1e293b)`,
              color: "#ffffff",
              display: "grid",
              gap: "6px",
            }}
          >
            <span
              style={{
                fontSize: "0.65rem",
                fontWeight: 700,
                opacity: 0.85,
                textTransform: "uppercase",
              }}
            >
              {isEn ? "Native Android App" : "تطبيق أندرويد أصلي"}
            </span>
            <strong style={{ fontSize: "0.95rem", lineHeight: 1.25 }}>
              {appName || (isEn ? "Your Brand" : "علامتك التجارية")}
            </strong>
            <span
              style={{
                display: "inline-block",
                width: "fit-content",
                background: "#ffffff",
                color: safeAccent,
                fontSize: "0.68rem",
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: "999px",
                marginTop: "2px",
              }}
            >
              {isEn ? "Shop Now" : "تسوّق الآن"}
            </span>
          </div>

          {/* Product Grid Skeleton Preview */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {[0, 1].map((idx) => (
              <div
                key={idx}
                style={{
                  borderRadius: "12px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  padding: "8px",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    height: "68px",
                    borderRadius: "8px",
                    background:
                      idx === 0
                        ? "linear-gradient(135deg, #f1f5f9, #e2e8f0)"
                        : "linear-gradient(135deg, #fef2f2, #ffe4e6)",
                  }}
                />
                <div
                  style={{
                    height: "8px",
                    width: "75%",
                    borderRadius: "4px",
                    background: "#cbd5e1",
                  }}
                />
                <div
                  style={{
                    height: "8px",
                    width: "45%",
                    borderRadius: "4px",
                    background: safeAccent,
                    opacity: 0.75,
                  }}
                />
              </div>
            ))}
          </div>

          {/* App Launcher Icon Pill */}
          <div
            style={{
              borderRadius: "12px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "9px",
                background: safeAccent,
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <ShoppingBag size={15} />
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {appName}
              </div>
              <div style={{ fontSize: "0.64rem", color: "#64748b" }}>
                {locked
                  ? isEn
                    ? "Preview · Upgrade to build APK"
                    : "معاينة · قم بالترقية لبناء التطبيق"
                  : isEn
                    ? "Live synced with your catalog"
                    : "متزامن لحظياً مع منتجات متجرك"}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Nav Bar Preview */}
        <div
          style={{
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            padding: "8px 14px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.62rem",
            color: "#64748b",
            fontWeight: 600,
          }}
        >
          <span style={{ color: safeAccent }}>{isEn ? "Home" : "الرئيسية"}</span>
          <span>{isEn ? "Shop" : "الأقسام"}</span>
          <span>{isEn ? "Bag" : "السلة"}</span>
          <span>{isEn ? "Orders" : "طلباتي"}</span>
          <span>{isEn ? "Account" : "حسابي"}</span>
        </div>
      </div>
    </div>
  );
}

function QrCodeCard({ url, isEn }: { url: string; isEn: boolean }) {
  const qr = useMemo(() => generateQrSvg(url), [url]);
  if (!qr) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.45rem",
        padding: "0.75rem",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        background: "#ffffff",
      }}
    >
      <svg
        width={126}
        height={126}
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={isEn ? "APK download QR code" : "رمز QR لتحميل التطبيق"}
      >
        <rect width={qr.size} height={qr.size} fill="#ffffff" />
        <path d={qr.path} fill="#0f172a" />
      </svg>
      <span
        style={{
          fontSize: "0.72rem",
          fontWeight: 600,
          color: "#475569",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
        }}
      >
        <QrCode size={13} />
        {isEn ? "Scan on Android to install" : "امسح الرمز لتثبيت التطبيق"}
      </span>
    </div>
  );
}

export function MobileAppStudio({
  store,
  unlocked,
  isSuperAdmin,
  githubConfigured,
  initialBuilds,
}: {
  store: StudioStoreProps;
  unlocked: boolean;
  isSuperAdmin: boolean;
  githubConfigured: boolean;
  initialBuilds: StoreAppBuildRow[];
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";

  const [builds, setBuilds] = useState<StoreAppBuildRow[]>(initialBuilds);
  const [appName, setAppName] = useState<string>(
    (isEn ? store.nameEn : store.nameAr) || store.nameAr,
  );
  const [iconUrl, setIconUrl] = useState<string>(store.logoUrl || "");
  const [uploadedIconPath, setUploadedIconPath] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconFeedback, setIconFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState<{
    kind: "ok" | "err" | "warn";
    text: string;
  } | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const handleIconFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setIconFeedback({
        kind: "err",
        text: isEn
          ? "Unsupported format. Please choose a PNG, JPG, or WEBP image."
          : "نوع الملف غير مدعوم. يرجى اختيار صورة بصيغة PNG أو JPG أو WEBP.",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setIconFeedback({
        kind: "err",
        text: isEn
          ? "Image size must be 2 MB or less."
          : "يجب ألا يتجاوز حجم الصورة 2 ميجابايت.",
      });
      return;
    }

    setUploadingIcon(true);
    setIconFeedback(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (uploadedIconPath) {
        formData.append("previousPath", uploadedIconPath);
      }
      const resp = await fetch("/api/admin/mobile-builds/icon", {
        method: "POST",
        body: formData,
      });
      const json = (await resp.json().catch(() => ({}))) as {
        url?: string;
        path?: string;
        message_ar?: string;
        message_en?: string;
      };
      if (!resp.ok || !json.url) {
        setIconFeedback({
          kind: "err",
          text:
            (isEn ? json.message_en : json.message_ar) ||
            (isEn
              ? "Could not upload icon image. Please try again."
              : "تعذر رفع صورة الأيقونة. حاول مرة أخرى."),
        });
        return;
      }
      setIconUrl(json.url);
      setUploadedIconPath(json.path ?? null);
      setIconFeedback({
        kind: "ok",
        text: isEn
          ? "App icon uploaded and applied to live preview."
          : "تم رفع أيقونة التطبيق وتحديث المعاينة بنجاح.",
      });
    } catch {
      setIconFeedback({
        kind: "err",
        text: isEn
          ? "Network error while uploading the icon."
          : "حدث خطأ في الاتصال أثناء رفع الأيقونة.",
      });
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleRemoveIcon = async () => {
    const pathToDelete = uploadedIconPath;
    setIconUrl("");
    setUploadedIconPath(null);
    setIconFeedback(null);
    if (pathToDelete) {
      await fetch("/api/admin/mobile-builds/icon", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathToDelete }),
      }).catch(() => undefined);
    }
  };

  const hasActiveBuild = builds.some(
    (b) => b.status === "queued" || b.status === "building",
  );

  const fetchBuilds = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const resp = await fetch("/api/admin/mobile-builds", {
        cache: "no-store",
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as { builds?: StoreAppBuildRow[] };
      if (Array.isArray(data.builds)) {
        setBuilds(data.builds);
      }
    } catch {
      /* ignore transient polling errors */
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  // Poll every 10s while a build is queued or building
  useEffect(() => {
    if (!unlocked || !hasActiveBuild) return;
    const timer = setInterval(() => {
      void fetchBuilds(false);
    }, 10_000);
    return () => clearInterval(timer);
  }, [unlocked, hasActiveBuild, fetchBuilds]);

  const handleTriggerBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlocked || submitting) return;
    setSubmitting(true);
    setBanner(null);

    try {
      const resp = await fetch("/api/admin/mobile-builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: appName.trim(),
          iconUrl: iconUrl.trim(),
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        build?: StoreAppBuildRow;
        error?: string;
        message_ar?: string;
        message_en?: string;
      };
      if (!resp.ok) {
        setBanner({
          kind: resp.status === 503 ? "warn" : "err",
          text:
            (isEn ? json.message_en : json.message_ar) ||
            (isEn
              ? "Could not start the APK build. Please try again."
              : "تعذر بدء بناء ملف APK. حاول مرة أخرى."),
        });
        return;
      }
      if (json.build) {
        setBuilds((prev) => [json.build!, ...prev]);
      }
      setBanner({
        kind: "ok",
        text: isEn
          ? "APK build queued! GitHub Actions is compiling your custom Android app now (typically 3–5 minutes)."
          : "تم إرسال طلب بناء التطبيق بنجاح! يقوم الخادم الآن بتجهيز ملف APK الخاص بمتجرك (يستغرق عادةً 3–5 دقائق).",
      });
    } catch {
      setBanner({
        kind: "err",
        text: isEn
          ? "Network error while triggering the APK build."
          : "حدث خطأ في الاتصال أثناء إرسال طلب البناء.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const planLabel =
    store.plan === "enterprise"
      ? isEn
        ? "Enterprise"
        : "مؤسسي"
      : store.plan === "growth"
        ? isEn
          ? "Growth"
          : "نمو"
        : isEn
          ? "Starter"
          : "مبتدئ";

  const whatsappUpgradeHref = (() => {
    const cleanNum = (store.whatsappNumber || "201000000000").replace(/[^\d]/g, "");
    const msg = isEn
      ? `Hello! I would like to upgrade my store "${store.nameEn}" (/${store.slug}) to unlock the Branded Android Mobile App.`
      : `مرحباً! أرغب في ترقية باقة متجري "${store.nameAr}" (/${store.slug}) لتفعيل تطبيق الأندرويد الخاص بمتجري.`;
    return `https://wa.me/${cleanNum}?text=${encodeURIComponent(msg)}`;
  })();

  // =========================================================================
  // LOCKED STATE (Starter Plan / Disabled Override) — Flagship Upsell Screen
  // =========================================================================
  if (!unlocked) {
    return (
      <div style={{ display: "grid", gap: "1.4rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.75rem",
                fontWeight: 700,
                padding: "0.22rem 0.65rem",
                borderRadius: "999px",
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #fde68a",
                marginBottom: "0.45rem",
              }}
            >
              <Lock size={12} />
              {isEn ? "Growth & Enterprise Feature" : "ميزة باقة النمو والمؤسسي"}
            </span>
            <h1 style={{ margin: 0, fontSize: "1.55rem", fontWeight: 800 }}>
              {isEn
                ? "Launch Your Store's Branded Android App"
                : "أطلق تطبيق أندرويد خاصاً بعلامتك التجارية"}
            </h1>
            <p style={{ margin: "0.35rem 0 0", color: "#64748b", fontSize: "0.92rem" }}>
              {isEn
                ? "Your current plan covers your web storefront. Upgrade to Growth or Enterprise to generate ready-to-install branded APKs in one click."
                : "باقتك الحالية تشمل المتجر الإلكتروني (الويب) فقط. قم بالترقية إلى باقة النمو أو المؤسسي لبناء تطبيق أندرويد باسم متجرك وأيقونتك بضغطة زر."}
            </p>
          </div>
          <span
            style={{
              fontSize: "0.82rem",
              fontWeight: 700,
              padding: "0.38rem 0.85rem",
              borderRadius: "999px",
              background: "#f1f5f9",
              color: "#334155",
              border: "1px solid #cbd5e1",
            }}
          >
            {isEn ? `Current Plan: ${planLabel}` : `الباقة الحالية: ${planLabel}`}
          </span>
        </div>

        {/* Hero Upsell Split Card */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: "1.75rem",
            alignItems: "center",
            background: "#ffffff",
            borderRadius: "20px",
            border: "1px solid #e2e8f0",
            padding: "1.75rem",
            boxShadow: "0 8px 30px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div style={{ display: "grid", gap: "1.1rem" }}>
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  color: "#0284c7",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                }}
              >
                <Sparkles size={14} />
                {isEn ? "White-Label Native Android Experience" : "تجربة تطبيق أصلي باسم متجرك"}
              </span>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>
                {isEn
                  ? "Turn one-time visitors into loyal mobile shoppers"
                  : "حوّل زوار متجرك إلى عملاء دائمين عبر تطبيقهم الخاص"}
              </h2>
            </div>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: "0.65rem",
                fontSize: "0.9rem",
                color: "#334155",
              }}
            >
              {(isEn
                ? [
                    "Custom app name, launcher icon & isolated Android Package ID",
                    "Real-time sync with your products, Flash Deals, Coupons & Theme",
                    "Native RTL Arabic / LTR English support & dark mode",
                    "Instant APK download link + scannable QR code for customers",
                  ]
                : [
                    "اسم التطبيق وأيقونة التشغيل ومعرّف حزمة (Package ID) مستقل لمتجرك",
                    "مزامنة فورية مع منتجاتك، العروض المؤقتة، الكوبونات وتصميم المتجر",
                    "دعم كامل للغتين العربية (RTL) والإنجليزية (LTR) والوضع الليلي",
                    "رابط تحميل مباشر لملف APK مع رمز QR جاهز للمشاركة مع عملائك",
                  ]
              ).map((item) => (
                <li
                  key={item}
                  style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}
                >
                  <CheckCircle2
                    size={17}
                    style={{ color: "#059669", flexShrink: 0, marginTop: "2px" }}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {/* Compact Plan Comparison */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  padding: "0.85rem",
                }}
              >
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b" }}>
                  {isEn ? "Starter" : "باقة المبتدئ"}
                </div>
                <div style={{ fontSize: "0.88rem", fontWeight: 800, marginTop: "0.2rem" }}>
                  {isEn ? "Web Storefront Only" : "متجر إلكتروني فقط"}
                </div>
                <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "0.25rem" }}>
                  {isEn ? "Up to 50 products · Mobile web" : "حتى 50 منتجاً · ويب متجاوب"}
                </div>
              </div>
              <div
                style={{
                  borderRadius: "12px",
                  border: "2px solid #0284c7",
                  background: "#f0f9ff",
                  padding: "0.85rem",
                }}
              >
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0369a1" }}>
                  {isEn ? "Growth & Enterprise" : "النمو والمؤسسي"}
                </div>
                <div style={{ fontSize: "0.88rem", fontWeight: 800, marginTop: "0.2rem", color: "#0f172a" }}>
                  {isEn ? "Web + Branded Android APK" : "متجر ويب + تطبيق أندرويد"}
                </div>
                <div style={{ fontSize: "0.76rem", color: "#0369a1", marginTop: "0.25rem" }}>
                  {isEn ? "500–10,000 products · 1-Click APK" : "500–10,000 منتج · بناء APK فوري"}
                </div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  background: "#0f172a",
                  color: "#ffffff",
                  padding: "0.82rem 1.35rem",
                  borderRadius: "12px",
                  fontSize: "0.94rem",
                  fontWeight: 700,
                }}
              >
                <Rocket size={17} />
                <span>
                  {isEn
                    ? "Upgrade Plan to Unlock"
                    : "ترقية الباقة لتفعيل التطبيق"}
                </span>
              </button>
            </div>
          </div>

          <div>
            <AndroidPhoneMockup
              appName={isEn ? store.nameEn : store.nameAr}
              iconUrl={store.logoUrl}
              primaryColor={store.primaryColor}
              isEn={isEn}
              locked
            />
          </div>
        </section>

        {/* Upgrade Request Modal */}
        {upgradeModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setUpgradeModalOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              background: "rgba(15, 23, 42, 0.55)",
              display: "grid",
              placeItems: "center",
              padding: "1rem",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "440px",
                background: "#ffffff",
                borderRadius: "18px",
                border: "1px solid #e2e8f0",
                padding: "1.4rem",
                display: "grid",
                gap: "1rem",
                boxShadow: "0 24px 60px rgba(15, 23, 42, 0.25)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "1.08rem" }}>
                  {isEn ? "Upgrade to Unlock Mobile App" : "ترقية الباقة لتفعيل التطبيق"}
                </strong>
                <button
                  type="button"
                  onClick={() => setUpgradeModalOpen(false)}
                  style={{ background: "transparent", color: "#64748b", padding: "0.25rem" }}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "#475569", lineHeight: 1.6 }}>
                {isEn
                  ? `Contact our platform team to upgrade "${store.nameEn}" (/${store.slug}) to Growth or Enterprise. Once activated, the Android APK Builder unlocks immediately.`
                  : `تواصل مع فريق المنصة لترقية متجر "${store.nameAr}" (/${store.slug}) إلى باقة النمو أو المؤسسي، وسيتم فتح مصنع تطبيق الأندرويد فور التفعيل.`}
              </p>
              <div style={{ display: "grid", gap: "0.6rem" }}>
                <a
                  href={whatsappUpgradeHref}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1rem",
                    borderRadius: "11px",
                    background: "#16a34a",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    textDecoration: "none",
                  }}
                >
                  <MessageCircle size={17} />
                  <span>{isEn ? "Request Upgrade via WhatsApp" : "طلب الترقية عبر واتساب"}</span>
                </a>
                {store.supportEmail && (
                  <a
                    href={`mailto:${store.supportEmail}?subject=${encodeURIComponent(
                      isEn
                        ? `Upgrade request: ${store.slug}`
                        : `طلب ترقية باقة: ${store.slug}`,
                    )}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      padding: "0.7rem 1rem",
                      borderRadius: "11px",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#0f172a",
                      fontWeight: 650,
                      fontSize: "0.88rem",
                      textDecoration: "none",
                    }}
                  >
                    <Mail size={16} />
                    <span>{isEn ? "Email Support" : "مراسلة الدعم عبر البريد"}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // UNLOCKED STATE (Growth / Enterprise / Force Enabled) — Live APK Studio
  // =========================================================================
  const latestSucceeded = builds.find((b) => b.status === "succeeded" && b.apk_url);

  const statusMeta = (status: StoreAppBuildRow["status"]) => {
    if (status === "succeeded") {
      return {
        label: isEn ? "Ready" : "جاهز للتحميل",
        bg: "#ecfdf5",
        fg: "#047857",
        border: "#a7f3d0",
        Icon: CheckCircle2,
      };
    }
    if (status === "failed") {
      return {
        label: isEn ? "Failed" : "فشل البناء",
        bg: "#fef2f2",
        fg: "#b91c1c",
        border: "#fecaca",
        Icon: XCircle,
      };
    }
    if (status === "building") {
      return {
        label: isEn ? "Building..." : "جارٍ البناء...",
        bg: "#eff6ff",
        fg: "#1d4ed8",
        border: "#bfdbfe",
        Icon: RefreshCw,
      };
    }
    return {
      label: isEn ? "Queued" : "في الانتظار",
      bg: "#fffbeb",
      fg: "#b45309",
      border: "#fde68a",
      Icon: Clock,
    };
  };

  return (
    <div style={{ display: "grid", gap: "1.4rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "0.22rem 0.65rem",
              borderRadius: "999px",
              background: "#e0f2fe",
              color: "#0369a1",
              border: "1px solid #bae6fd",
              marginBottom: "0.45rem",
            }}
          >
            <Smartphone size={12} />
            {isEn ? "Self-Serve White-Label APK Factory" : "مصنع تطبيقات الأندرويد الذاتي"}
          </span>
          <h1 style={{ margin: 0, fontSize: "1.55rem", fontWeight: 800 }}>
            {isEn ? "Android Mobile App Studio" : "استوديو تطبيق الموبايل (APK)"}
          </h1>
          <p style={{ margin: "0.3rem 0 0", color: "#64748b", fontSize: "0.9rem" }}>
            {isEn
              ? "Customize your branded Android app name & icon and generate a ready-to-install APK connected directly to your store."
              : "خصّص اسم وأيقونة تطبيق متجرك وأنشئ ملف APK جاهز للتثبيت ومرتبط مباشرةً بمتجرك."}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.78rem",
              fontWeight: 700,
              padding: "0.35rem 0.78rem",
              borderRadius: "999px",
              background: "#ecfdf5",
              color: "#047857",
              border: "1px solid #a7f3d0",
            }}
          >
            <ShieldCheck size={14} />
            {planLabel} · {isEn ? "Unlocked" : "مفعّل"}
          </span>
        </div>
      </div>

      {!githubConfigured && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.65rem",
            padding: "0.9rem 1.05rem",
            borderRadius: "14px",
            border: isSuperAdmin ? "1px solid #fde68a" : "1px solid #cbd5e1",
            background: isSuperAdmin ? "#fffbeb" : "#f8fafc",
            color: isSuperAdmin ? "#92400e" : "#334155",
            fontSize: "0.86rem",
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            {isSuperAdmin ? (
              <>
                <strong>
                  {isEn
                    ? "GitHub Actions Cloud Builder not connected on this server yet."
                    : "خادم البناء السحابي (GitHub Actions) غير مربوط بعد على هذه البيئة."}
                </strong>
                <div style={{ marginTop: "0.2rem", opacity: 0.9 }}>
                  {isEn
                    ? "Set GITHUB_ACTIONS_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in web-store/.env.local to enable 1-click cloud APK builds."
                    : "أضف GITHUB_ACTIONS_TOKEN و GITHUB_REPO_OWNER و GITHUB_REPO_NAME في web-store/.env.local لتفعيل البناء السحابي التلقائي."}
                </div>
              </>
            ) : (
              <strong>
                {isEn
                  ? "Cloud APK builder is currently being provisioned. Please check back shortly."
                  : "خدمة بناء التطبيق قيد التجهيز حالياً. يرجى المحاولة مرة أخرى قريباً."}
              </strong>
            )}
          </div>
        </div>
      )}

      {banner && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "0.85rem 1rem",
            borderRadius: "12px",
            fontSize: "0.88rem",
            fontWeight: 600,
            border:
              banner.kind === "ok"
                ? "1px solid #a7f3d0"
                : banner.kind === "warn"
                  ? "1px solid #fde68a"
                  : "1px solid #fecaca",
            background:
              banner.kind === "ok"
                ? "#ecfdf5"
                : banner.kind === "warn"
                  ? "#fffbeb"
                  : "#fef2f2",
            color:
              banner.kind === "ok"
                ? "#047857"
                : banner.kind === "warn"
                  ? "#92400e"
                  : "#b91c1c",
          }}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            style={{ background: "transparent", color: "inherit", padding: "0.2rem" }}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Main Split: Configuration Form + Live Phone Preview */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Config Card */}
        <form
          onSubmit={handleTriggerBuild}
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            border: "1px solid #e2e8f0",
            padding: "1.4rem",
            display: "grid",
            gap: "1rem",
            marginTop: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 800 }}>
            {isEn ? "App Identity & Build Settings" : "هوية التطبيق وإعدادات البناء"}
          </h2>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.84rem", fontWeight: 700 }}>
              {isEn ? "App Display Name" : "اسم التطبيق على الهاتف"}
            </span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={60}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder={isEn ? "e.g. Velvet Boutique" : "مثال: متجر فيلفيت"}
            />
          </label>

          {/* Direct Device App Icon Uploader Card */}
          <div style={{ display: "grid", gap: "0.55rem" }}>
            <span style={{ fontSize: "0.84rem", fontWeight: 700 }}>
              {isEn ? "App Launcher Icon" : "أيقونة التطبيق"}
            </span>
            <div
              style={{
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                padding: "0.9rem",
                display: "grid",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.9rem",
                  flexWrap: "wrap",
                }}
              >
                {/* Live 64x64 Rounded-Square Preview */}
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    background: /^#[0-9a-fA-F]{6}$/.test(store.primaryColor)
                      ? store.primaryColor
                      : "#0f172a",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "1.45rem",
                    fontWeight: 800,
                    border: "1px solid rgba(15, 23, 42, 0.1)",
                    flexShrink: 0,
                    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.1)",
                  }}
                >
                  {iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={iconUrl}
                      alt={appName || "App icon"}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span>{(appName || "S").slice(0, 1).toUpperCase()}</span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: "180px", display: "grid", gap: "0.45rem" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleIconFileChange}
                    style={{ display: "none" }}
                    aria-label={
                      isEn ? "Upload app icon from device" : "رفع أيقونة التطبيق من الجهاز"
                    }
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={uploadingIcon}
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.52rem 0.9rem",
                        borderRadius: "10px",
                        background: "#0284c7",
                        color: "#ffffff",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                      }}
                    >
                      <Upload size={14} />
                      <span>
                        {uploadingIcon
                          ? isEn
                            ? "Uploading…"
                            : "جارٍ الرفع…"
                          : isEn
                            ? "Upload from Device"
                            : "رفع صورة من الجهاز"}
                      </span>
                    </button>

                    {iconUrl && (
                      <button
                        type="button"
                        disabled={uploadingIcon}
                        onClick={() => void handleRemoveIcon()}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.5rem 0.72rem",
                          borderRadius: "10px",
                          background: "#ffffff",
                          color: "#b91c1c",
                          border: "1px solid #fecaca",
                          fontSize: "0.78rem",
                          fontWeight: 650,
                        }}
                      >
                        <Trash2 size={13} />
                        <span>{isEn ? "Remove" : "إزالة"}</span>
                      </button>
                    )}
                  </div>
                  <small style={{ color: "#64748b", fontSize: "0.74rem" }}>
                    {isEn
                      ? "PNG, JPG, or WEBP · 512×512 square recommended · Max 2 MB"
                      : "PNG أو JPG أو WEBP · يُفضّل 512×512 مربعة · الحد الأقصى 2 ميجابايت"}
                  </small>
                </div>
              </div>

              {iconFeedback && (
                <div
                  role="status"
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    padding: "0.45rem 0.65rem",
                    borderRadius: "8px",
                    background:
                      iconFeedback.kind === "ok" ? "#ecfdf5" : "#fef2f2",
                    color: iconFeedback.kind === "ok" ? "#047857" : "#b91c1c",
                    border:
                      iconFeedback.kind === "ok"
                        ? "1px solid #a7f3d0"
                        : "1px solid #fecaca",
                  }}
                >
                  {iconFeedback.text}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowUrlInput((v) => !v)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    background: "transparent",
                    color: "#475569",
                    padding: "0.15rem 0",
                    fontSize: "0.76rem",
                    fontWeight: 650,
                  }}
                >
                  <Link2 size={13} />
                  <span>
                    {showUrlInput
                      ? isEn
                        ? "Hide direct image URL"
                        : "إخفاء رابط الصورة المباشر"
                      : isEn
                        ? "Or paste image URL"
                        : "أو استخدام رابط مباشر"}
                  </span>
                </button>

                {showUrlInput && (
                  <input
                    type="url"
                    dir="ltr"
                    value={iconUrl}
                    onChange={(e) => {
                      setIconUrl(e.target.value);
                      setUploadedIconPath(null);
                      setIconFeedback(null);
                    }}
                    placeholder="https://.../logo.png"
                    style={{ marginTop: "0.45rem", background: "#ffffff" }}
                  />
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: "12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              padding: "0.85rem",
              display: "grid",
              gap: "0.45rem",
              fontSize: "0.8rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <span style={{ color: "#64748b", fontWeight: 600 }}>
                {isEn ? "Android Package ID" : "معرّف الحزمة (Package ID)"}
              </span>
              <code dir="ltr" style={{ fontWeight: 700, color: "#0f172a" }}>
                {store.packageId}
              </code>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <span style={{ color: "#64748b", fontWeight: 600 }}>
                {isEn ? "Tenant Store ID" : "معرّف المتجر"}
              </span>
              <code dir="ltr" style={{ fontSize: "0.74rem", color: "#475569" }}>
                {store.storeId.slice(0, 8)}…{store.storeId.slice(-4)}
              </code>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || hasActiveBuild}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.85rem 1.2rem",
              borderRadius: "12px",
              background: hasActiveBuild ? "#64748b" : "#0f172a",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.94rem",
            }}
          >
            <Rocket size={17} />
            <span>
              {submitting
                ? isEn
                  ? "Starting Build…"
                  : "جارٍ إرسال الطلب…"
                : hasActiveBuild
                  ? isEn
                    ? "Build In Progress…"
                    : "يوجد بناء قيد التنفيذ…"
                  : isEn
                    ? "Build APK Now"
                    : "بناء ملف APK الآن"}
            </span>
          </button>
        </form>

        {/* Live Android Preview + Latest QR */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            border: "1px solid #e2e8f0",
            padding: "1.4rem",
            display: "grid",
            gap: "1rem",
            justifyItems: "center",
          }}
        >
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#475569" }}>
            {isEn ? "Live App Preview" : "معاينة فورية للتطبيق"}
          </span>
          <AndroidPhoneMockup
            appName={appName}
            iconUrl={iconUrl}
            primaryColor={store.primaryColor}
            isEn={isEn}
          />
          {latestSucceeded?.apk_url && (
            <QrCodeCard url={latestSucceeded.apk_url} isEn={isEn} />
          )}
        </div>
      </section>

      {/* Build History */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          padding: "1.4rem",
          display: "grid",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 800 }}>
              {isEn ? "Build History" : "سجل إصدارات التطبيق"}
            </h2>
            {hasActiveBuild && (
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "#0284c7" }}>
                {isEn
                  ? "Auto-refreshing every 10 seconds while build is running…"
                  : "يتم التحديث تلقائياً كل 10 ثوانٍ أثناء بناء التطبيق…"}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void fetchBuilds(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "#f8fafc",
              color: "#0f172a",
              border: "1px solid #cbd5e1",
              padding: "0.45rem 0.8rem",
              borderRadius: "10px",
              fontSize: "0.8rem",
              fontWeight: 650,
            }}
          >
            <RefreshCw size={14} />
            <span>{isEn ? "Refresh" : "تحديث"}</span>
          </button>
        </div>

        {builds.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "2rem 1rem",
              borderRadius: "14px",
              background: "#f8fafc",
              border: "1px dashed #cbd5e1",
              color: "#64748b",
              fontSize: "0.88rem",
            }}
          >
            {isEn
              ? 'No APK builds yet. Click "Build APK Now" above to compile your store\'s first Android app.'
              : 'لم يتم بناء أي نسخة APK بعد. اضغط على «بناء ملف APK الآن» لإنشاء أول تطبيق لمتجرك.'}
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {builds.map((b) => {
              const meta = statusMeta(b.status);
              const StatusIcon = meta.Icon;
              return (
                <article
                  key={b.id}
                  style={{
                    borderRadius: "14px",
                    border: "1px solid #e2e8f0",
                    padding: "1rem",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.85rem",
                  }}
                >
                  <div style={{ display: "grid", gap: "0.3rem", minWidth: "200px", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.95rem" }}>{b.app_name}</strong>
                      <span
                        dir="ltr"
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#475569",
                          background: "#f1f5f9",
                          padding: "0.12rem 0.5rem",
                          borderRadius: "999px",
                        }}
                      >
                        v{b.version_name} (#{b.version_code})
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          padding: "0.16rem 0.58rem",
                          borderRadius: "999px",
                          background: meta.bg,
                          color: meta.fg,
                          border: `1px solid ${meta.border}`,
                        }}
                      >
                        <StatusIcon size={12} />
                        {meta.label}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#64748b", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                      <span dir="ltr">{b.package_id}</span>
                      <span>{date(b.created_at, lang)}</span>
                      {b.apk_size_bytes ? (
                        <span dir="ltr">{formatFileSize(b.apk_size_bytes)}</span>
                      ) : null}
                    </div>
                    {b.error_message && (
                      <div style={{ fontSize: "0.78rem", color: "#b91c1c", marginTop: "0.2rem" }}>
                        {b.error_message}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    {b.apk_url && b.status === "succeeded" && (
                      <a
                        href={b.apk_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          padding: "0.5rem 0.9rem",
                          borderRadius: "10px",
                          background: "#059669",
                          color: "#ffffff",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        <Download size={14} />
                        <span>{isEn ? "Download APK" : "تحميل APK"}</span>
                      </a>
                    )}
                    {b.github_run_url && (
                      <a
                        href={b.github_run_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.48rem 0.78rem",
                          borderRadius: "10px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#334155",
                          fontSize: "0.78rem",
                          fontWeight: 650,
                          textDecoration: "none",
                        }}
                      >
                        <ExternalLink size={13} />
                        <span>{isEn ? "Build Log" : "سجل البناء"}</span>
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
