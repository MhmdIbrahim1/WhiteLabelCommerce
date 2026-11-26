"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Smartphone,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Rocket,
  Clock,
  XCircle,
  X,
  QrCode,
  ShieldCheck,
  Search,
  Heart,
  Bell,
  ShoppingBag,
  Upload,
  Link2,
  Trash2,
  Sun,
  Moon,
  Palette,
  Zap,
  Star,
  Plus,
  Package,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { date, money } from "@/lib/brand";
import { localizedText, translateHomeCopy } from "@/lib/i18n";
import {
  getFlashSavingsPercent,
  isFlashSaleActive,
  resolveEffectivePrice,
} from "@/lib/flash-sale";
import { generateQrSvg } from "@/lib/qr-svg";
import { limitReached, quotaFailure } from "@/lib/billing";
import { QuotaPrompt } from "@/components/quota-prompt";
import type { StoreAppBuildRow } from "@/app/api/admin/mobile-builds/route";

export type PreviewProduct = {
  id: string;
  name: string;
  name_en: string | null;
  price: number;
  old_price: number | null;
  flash_sale_price: number | null;
  flash_sale_starts_at: string | null;
  flash_sale_ends_at: string | null;
  stock: number;
  imageUrl: string | null;
  avg_rating: number;
  review_count: number;
};

type StudioStoreProps = {
  storeId: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  planNameAr: string;
  planNameEn: string;
  logoUrl: string;
  primaryColor: string;
  primaryText: string;
  secondaryColor: string;
  pageBg: string;
  cardSurface: string;
  borderRadius: number;
  currency: string;
  packageId: string;
  supportEmail: string;
};

type StorePreviewProps = {
  heroVisible: boolean;
  heroImageUrl: string | null;
  heroOverlayOpacity: number;
  heroGradientStart: string;
  heroGradientEnd: string;
  heroTextColor: string;
  heroBadgeVisible: boolean;
  heroBadgeAr: string;
  heroBadgeEn: string;
  heroTitleAr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleEn: string;
  heroCtaVisible: boolean;
  heroCtaAr: string;
  heroCtaEn: string;
  announcementText: string;
  products: PreviewProduct[];
};

function safeHex(color: string | null | undefined, fallback: string): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function AndroidPhoneMockup({
  appName,
  iconUrl,
  store,
  preview,
  isEn,
  darkMode,
  locked = false,
}: {
  appName: string;
  iconUrl: string;
  store: StudioStoreProps;
  preview: StorePreviewProps;
  isEn: boolean;
  darkMode: boolean;
  locked?: boolean;
}) {
  const lang = isEn ? "en" : "ar";
  const primary = safeHex(store.primaryColor, "#0f172a");
  const primaryText = safeHex(store.primaryText, "#ffffff");
  const accent = safeHex(store.secondaryColor, "#0284c7");
  const radius = Math.max(6, Math.min(20, Number(store.borderRadius ?? 12)));

  const screenBg = darkMode ? "#0b1120" : safeHex(store.pageBg, "#f8fafc");
  const surfaceBg = darkMode ? "#131c31" : safeHex(store.cardSurface, "#ffffff");
  const ink = darkMode ? "#f8fafc" : "#0f172a";
  const muted = darkMode ? "#94a3b8" : "#64748b";
  const hairline = darkMode ? "rgba(148, 163, 184, 0.18)" : "#e2e8f0";

  const heroTitle =
    (isEn ? preview.heroTitleEn : preview.heroTitleAr).trim() ||
    (isEn ? store.nameEn : store.nameAr) ||
    appName ||
    (isEn ? preview.heroTitleAr : preview.heroTitleEn).trim();
  const heroSubtitle =
    (isEn ? preview.heroSubtitleEn : preview.heroSubtitleAr).trim() ||
    (isEn
      ? "Curated pieces blending quiet elegance with everyday craftsmanship."
      : preview.heroSubtitleAr.trim());
  const heroBadge =
    (isEn ? preview.heroBadgeEn : preview.heroBadgeAr).trim() ||
    (isEn ? "Curated Collection" : "تشكيلة مختارة");
  const heroCta =
    (isEn ? preview.heroCtaEn : preview.heroCtaAr).trim() ||
    (isEn ? "Shop Now" : "تسوّق الآن");
  const announcementDisplay = preview.announcementText
    ? translateHomeCopy(preview.announcementText, lang)
    : "";
  const overlayAlpha = Math.max(0.15, Math.min(0.8, (preview.heroOverlayOpacity ?? 45) / 100));

  return (
    <div
      style={{
        width: "296px",
        maxWidth: "100%",
        marginInline: "auto",
        borderRadius: "36px",
        padding: "10px",
        background: "linear-gradient(155deg, #0f172a, #1e293b)",
        boxShadow: "0 22px 54px rgba(15, 23, 42, 0.24)",
        position: "relative",
      }}
    >
      {/* Top Speaker / Camera Pill */}
      <div
        style={{
          width: "76px",
          height: "13px",
          borderRadius: "999px",
          background: "#020617",
          margin: "2px auto 8px",
        }}
      />

      {/* Screen Container */}
      <div
        dir={isEn ? "ltr" : "rtl"}
        style={{
          borderRadius: "26px",
          background: screenBg,
          color: ink,
          height: "510px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: `1px solid ${hairline}`,
        }}
      >
        {/* Optional Customizer Announcement / Promo Strip */}
        {announcementDisplay && (
          <div
            style={{
              background: accent,
              color: "#ffffff",
              fontSize: "0.64rem",
              fontWeight: 700,
              textAlign: "center",
              padding: "4px 8px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {announcementDisplay}
          </div>
        )}

        {/* Decluttered Android Top App Bar */}
        <div
          style={{
            background: surfaceBg,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            borderBottom: `1px solid ${hairline}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              minWidth: 0,
              flex: 1,
            }}
          >
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt={appName}
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "8px",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "8px",
                  background: primary,
                  color: primaryText,
                  fontSize: "0.75rem",
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
                fontSize: "0.84rem",
                color: ink,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {appName || (isEn ? store.nameEn : store.nameAr)}
            </strong>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              color: darkMode ? "#e2e8f0" : primary,
              flexShrink: 0,
            }}
          >
            <Search size={14} />
            <Heart size={14} />
            <Bell size={14} />
          </div>
        </div>

        {/* Scrollable Storefront Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px",
            display: "grid",
            gap: "10px",
            alignContent: "start",
          }}
        >
          {/* Real Customizer Hero Banner */}
          {preview.heroVisible && (
            <div
              style={{
                position: "relative",
                borderRadius: `${radius}px`,
                overflow: "hidden",
                minHeight: "136px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                padding: "12px",
                background: `linear-gradient(135deg, ${safeHex(preview.heroGradientStart, primary)}, ${safeHex(preview.heroGradientEnd, accent)})`,
                color: safeHex(preview.heroTextColor, "#ffffff"),
              }}
            >
              {preview.heroImageUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.heroImageUrl}
                    alt={heroTitle}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `linear-gradient(180deg, rgba(10,15,28,${(overlayAlpha * 0.65).toFixed(2)}), rgba(10,15,28,${overlayAlpha.toFixed(2)}))`,
                    }}
                  />
                </>
              )}
              <div style={{ position: "relative", zIndex: 1, display: "grid", gap: "5px" }}>
                {preview.heroBadgeVisible && heroBadge && (
                  <span
                    style={{
                      display: "inline-block",
                      width: "fit-content",
                      background: "rgba(255,255,255,0.2)",
                      backdropFilter: "blur(4px)",
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "999px",
                    }}
                  >
                    {heroBadge}
                  </span>
                )}
                <strong style={{ fontSize: "0.92rem", lineHeight: 1.25 }}>
                  {heroTitle}
                </strong>
                {heroSubtitle && (
                  <span
                    style={{
                      fontSize: "0.66rem",
                      opacity: 0.9,
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {heroSubtitle}
                  </span>
                )}
                {preview.heroCtaVisible && (
                  <span
                    style={{
                      display: "inline-block",
                      width: "fit-content",
                      background: "#ffffff",
                      color: primary,
                      fontSize: "0.67rem",
                      fontWeight: 750,
                      padding: "4px 10px",
                      borderRadius: `${Math.min(radius, 999)}px`,
                      marginTop: "2px",
                    }}
                  >
                    {heroCta}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Real Products Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingInline: "2px",
            }}
          >
            <strong style={{ fontSize: "0.76rem", color: ink }}>
              {isEn ? "Latest Products" : "أحدث المنتجات"}
            </strong>
            <span style={{ fontSize: "0.64rem", color: muted, fontWeight: 600 }}>
              {preview.products.length > 0
                ? isEn
                  ? `${preview.products.length} live`
                  : `${preview.products.length} منتجات`
                : isEn
                  ? "Live catalog"
                  : "الكتالوج"}
            </span>
          </div>

          {/* Real 2-Column Store Products Grid */}
          {preview.products.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
              }}
            >
              {preview.products.map((p) => {
                const title = localizedText(lang, p.name, p.name_en);
                const flashOn = isFlashSaleActive(p);
                const flashPct = flashOn ? getFlashSavingsPercent(p) : null;
                const effPrice = resolveEffectivePrice(p);
                const strikePrice = flashOn
                  ? p.price
                  : p.old_price && p.old_price > p.price
                    ? p.old_price
                    : null;

                return (
                  <div
                    key={p.id}
                    style={{
                      borderRadius: `${Math.min(radius, 14)}px`,
                      background: surfaceBg,
                      border: `1px solid ${hairline}`,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        aspectRatio: "4 / 4.2",
                        background: darkMode ? "#1e293b" : "#f1f5f9",
                        display: "grid",
                        placeItems: "center",
                        overflow: "hidden",
                      }}
                    >
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <Package size={20} style={{ color: muted, opacity: 0.6 }} />
                      )}

                      {flashPct && (
                        <span
                          style={{
                            position: "absolute",
                            top: "5px",
                            insetInlineStart: "5px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            background: "#be123c",
                            color: "#ffffff",
                            fontSize: "0.58rem",
                            fontWeight: 800,
                            padding: "2px 5px",
                            borderRadius: "999px",
                          }}
                        >
                          <Zap size={9} />-{flashPct}%
                        </span>
                      )}

                      {p.review_count > 0 && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: "5px",
                            insetInlineStart: "5px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            background: "rgba(15, 23, 42, 0.78)",
                            color: "#fbbf24",
                            fontSize: "0.58rem",
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: "999px",
                          }}
                        >
                          <Star size={8} fill="#fbbf24" />
                          {p.avg_rating.toFixed(1)}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        padding: "7px",
                        display: "grid",
                        gap: "4px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          color: ink,
                          lineHeight: 1.25,
                          display: "-webkit-box",
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {title}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "4px",
                        }}
                      >
                        <div style={{ display: "grid", lineHeight: 1.15 }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              color: flashOn
                                ? "#e11d48"
                                : darkMode
                                  ? "#38bdf8"
                                  : primary,
                            }}
                          >
                            {money(effPrice, store.currency, lang)}
                          </span>
                          {strikePrice && (
                            <del
                              style={{
                                fontSize: "0.56rem",
                                color: muted,
                              }}
                            >
                              {money(strikePrice, store.currency, lang)}
                            </del>
                          )}
                        </div>
                        <span
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "999px",
                            background: primary,
                            color: primaryText,
                            display: "inline-grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Plus size={11} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                borderRadius: `${Math.min(radius, 12)}px`,
                background: surfaceBg,
                border: `1px dashed ${hairline}`,
                padding: "14px 10px",
                textAlign: "center",
                fontSize: "0.7rem",
                color: muted,
              }}
            >
              {isEn
                ? "Add products in Catalog to see them live inside your app preview."
                : "أضف منتجاتك في قسم المنتجات لتظهر مباشرةً داخل معاينة التطبيق."}
            </div>
          )}

          {/* Launcher Identity Card */}
          <div
            style={{
              borderRadius: `${Math.min(radius, 12)}px`,
              background: surfaceBg,
              border: `1px solid ${hairline}`,
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
                background: primary,
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                color: primaryText,
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
                  color: ink,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {appName || (isEn ? store.nameEn : store.nameAr)}
              </div>
              <div style={{ fontSize: "0.62rem", color: muted }}>
                {locked
                  ? isEn
                    ? "Preview · App builds paused"
                    : "معاينة · بناء التطبيق متوقف"
                  : isEn
                    ? "Synced live with Customizer & Catalog"
                    : "متزامن مع التصميم ومنتجات متجرك"}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom 5-Tab Navigation Bar */}
        <div
          style={{
            background: surfaceBg,
            borderTop: `1px solid ${hairline}`,
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.62rem",
            color: muted,
            fontWeight: 650,
            flexShrink: 0,
          }}
        >
          <span style={{ color: darkMode ? "#38bdf8" : primary }}>
            {isEn ? "Home" : "الرئيسية"}
          </span>
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
  preview,
  unlocked,
  isSuperAdmin,
  canViewBilling,
  githubConfigured,
  initialBuilds,
  initialQuota,
}: {
  store: StudioStoreProps;
  preview: StorePreviewProps;
  unlocked: boolean;
  isSuperAdmin: boolean;
  canViewBilling: boolean;
  githubConfigured: boolean;
  initialBuilds: StoreAppBuildRow[];
  initialQuota: { current: number; limit: number | null };
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
  const [previewDarkMode, setPreviewDarkMode] = useState(false);
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
  const [quota, setQuota] = useState(initialQuota);
  const [builderDisabled, setBuilderDisabled] = useState(false);

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
      const data = (await resp.json()) as { builds?: StoreAppBuildRow[]; quota?: typeof initialQuota; unlocked?: boolean };
      if (data.quota) setQuota(data.quota);
      if (typeof data.unlocked === "boolean") setBuilderDisabled(!data.unlocked);
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
        const failure = quotaFailure({ message: json.error, details: json });
        if (failure?.resource === "apk_builds") {
          setQuota({ current: failure.current, limit: failure.limit });
          setBuilderDisabled(failure.code === "feature_not_in_plan");
          return;
        }
        if (resp.status === 502) void fetchBuilds();
        setBanner({
          kind: resp.status === 503 ? "warn" : "err",
          text:
            (isEn ? json.message_en : json.message_ar) ||
            (isEn
              ? `Could not start the APK build (HTTP ${resp.status}).`
              : `تعذر بدء بناء ملف APK (HTTP ${resp.status}).`),
        });
        return;
      }
      if (json.build) {
        setBuilds((prev) => [json.build!, ...prev]);
        setQuota(previous => ({ ...previous, current: previous.current + 1 }));
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

  const planLabel = localizedText(lang, store.planNameAr, store.planNameEn);

  const PreviewControlsBar = (
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.5rem",
        flexWrap: "wrap",
      }}
    >
      <div
        role="group"
        aria-label={isEn ? "Preview theme mode" : "وضع معاينة المظهر"}
        style={{
          display: "inline-flex",
          padding: "3px",
          borderRadius: "999px",
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
        }}
      >
        <button
          type="button"
          onClick={() => setPreviewDarkMode(false)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            padding: "0.28rem 0.65rem",
            borderRadius: "999px",
            fontSize: "0.74rem",
            fontWeight: 700,
            background: !previewDarkMode ? "#ffffff" : "transparent",
            color: !previewDarkMode ? "#0f172a" : "#64748b",
            boxShadow: !previewDarkMode
              ? "0 1px 3px rgba(15, 23, 42, 0.1)"
              : "none",
          }}
        >
          <Sun size={12} />
          <span>{isEn ? "Light" : "فاتح"}</span>
        </button>
        <button
          type="button"
          onClick={() => setPreviewDarkMode(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            padding: "0.28rem 0.65rem",
            borderRadius: "999px",
            fontSize: "0.74rem",
            fontWeight: 700,
            background: previewDarkMode ? "#0f172a" : "transparent",
            color: previewDarkMode ? "#ffffff" : "#64748b",
          }}
        >
          <Moon size={12} />
          <span>{isEn ? "Dark" : "داكن"}</span>
        </button>
      </div>

      <Link
        href="/admin/customizer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.32rem",
          fontSize: "0.75rem",
          fontWeight: 700,
          color: "#0284c7",
          textDecoration: "none",
          padding: "0.32rem 0.65rem",
          borderRadius: "999px",
          background: "#f0f9ff",
          border: "1px solid #bae6fd",
        }}
      >
        <Palette size={13} />
        <span>
          {isEn
            ? "Edit Design in Customizer"
            : "تعديل التصميم في استوديو المظهر"}
        </span>
      </Link>
    </div>
  );

  if (!unlocked || builderDisabled) {
    return <section className="card">
      <h1>{isEn ? "Android Mobile App Studio" : "استوديو تطبيق أندرويد"}</h1>
      <QuotaPrompt canViewBilling={canViewBilling} resource="apk_builds" lang={lang} disabled />
      {PreviewControlsBar}
      <AndroidPhoneMockup appName={appName} iconUrl={iconUrl} store={store} preview={preview}
        isEn={isEn} darkMode={previewDarkMode} locked />
      {store.supportEmail && <a href={"mailto:" + store.supportEmail}>{isEn ? "Contact support" : "تواصل مع الدعم"}</a>}
    </section>;
  }
  const latestSucceeded = builds.find(
    (b) => b.status === "succeeded" && b.apk_download_url,
  );

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
            {isEn
              ? "Self-Serve White-Label APK Factory"
              : "مصنع تطبيقات الأندرويد الذاتي"}
          </span>
          <h1 style={{ margin: 0, fontSize: "1.55rem", fontWeight: 800 }}>
            {isEn ? "Android Mobile App Studio" : "استوديو تطبيق الموبايل (APK)"}
          </h1>
          <p
            style={{
              margin: "0.3rem 0 0",
              color: "#64748b",
              fontSize: "0.9rem",
            }}
          >
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

      {limitReached(quota.current, quota.limit) && <QuotaPrompt canViewBilling={canViewBilling} resource="apk_builds" lang={lang} usage={quota} />}
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
            style={{
              background: "transparent",
              color: "inherit",
              padding: "0.2rem",
            }}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Main Split: Configuration Form + Real Customizer-Synced Phone Preview */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
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
            {isEn
              ? "App Identity & Build Settings"
              : "هوية التطبيق وإعدادات البناء"}
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
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    background: safeHex(store.primaryColor, "#0f172a"),
                    color: safeHex(store.primaryText, "#ffffff"),
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

                <div
                  style={{
                    flex: 1,
                    minWidth: "180px",
                    display: "grid",
                    gap: "0.45rem",
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleIconFileChange}
                    style={{ display: "none" }}
                    aria-label={
                      isEn
                        ? "Upload app icon from device"
                        : "رفع أيقونة التطبيق من الجهاز"
                    }
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      flexWrap: "wrap",
                    }}
                  >
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <span style={{ color: "#64748b", fontWeight: 600 }}>
                {isEn ? "Android Package ID" : "معرّف الحزمة (Package ID)"}
              </span>
              <code dir="ltr" style={{ fontWeight: 700, color: "#0f172a" }}>
                {store.packageId}
              </code>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
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

        {/* Live Customizer-Synced Android Preview + Latest QR */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "18px",
            border: "1px solid #e2e8f0",
            padding: "1.25rem",
            display: "grid",
            gap: "0.95rem",
            justifyItems: "center",
          }}
        >
          {PreviewControlsBar}
          <AndroidPhoneMockup
            appName={appName}
            iconUrl={iconUrl}
            store={store}
            preview={preview}
            isEn={isEn}
            darkMode={previewDarkMode}
          />
          {latestSucceeded?.apk_download_url && (
            <QrCodeCard url={latestSucceeded.apk_download_url} isEn={isEn} />
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
              <p
                style={{
                  margin: "0.2rem 0 0",
                  fontSize: "0.78rem",
                  color: "#0284c7",
                }}
              >
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
                  <div
                    style={{
                      display: "grid",
                      gap: "0.3rem",
                      minWidth: "200px",
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong style={{ fontSize: "0.95rem" }}>
                        {b.app_name}
                      </strong>
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
                    <div
                      style={{
                        fontSize: "0.76rem",
                        color: "#64748b",
                        display: "flex",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span dir="ltr">{b.package_id}</span>
                      <span>{date(b.created_at, lang)}</span>
                    </div>
                    {b.status === "failed" && (
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "#b91c1c",
                          marginTop: "0.2rem",
                        }}
                      >
                        {isEn ? "The build failed. Please try again or contact support." : "تعذر إكمال البناء. حاول مرة أخرى أو تواصل مع الدعم."}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {b.apk_download_url && b.status === "succeeded" && (
                      <a
                        href={b.apk_download_url}
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
