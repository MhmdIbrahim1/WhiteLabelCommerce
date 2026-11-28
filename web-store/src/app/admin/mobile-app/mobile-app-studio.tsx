"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  RefreshCw,
  Rocket,
  X,
  QrCode,
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
import { productPricePresentation, serverNowMs } from "@/lib/flash-sale";
import { generateQrSvg } from "@/lib/qr-svg";
import { limitLabel, limitReached, quotaFailure } from "@/lib/billing";
import { DataCell, StatusDot, WorkspaceEmpty, WorkspaceHeading, WorkspaceTable } from "@/components/workspace-data";
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
        background: "#23262D",
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
                <strong style={{ fontSize: "0.92rem", lineHeight: isEn ? 1.25 : 1.36 }}>
                  {heroTitle}
                </strong>
                {heroSubtitle && (
                  <span
                    style={{
                      fontSize: "0.66rem",
                      opacity: 0.9,
                      lineHeight: isEn ? 1.35 : 1.78,
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
                const { flash: flashOn, current: effPrice, compareAt: strikePrice, savings } = productPricePresentation(p, serverNowMs());
                const flashPct = flashOn ? savings : null;

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
                          lineHeight: isEn ? 1.25 : 1.36,
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
                        <div style={{ display: "grid", lineHeight: isEn ? 1.3 : 1.78 }}>
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
                            <bdi dir="ltr">{money(effPrice, store.currency, lang)}</bdi>
                          </span>
                          {strikePrice && (
                            <del
                              style={{
                                fontSize: "0.56rem",
                                color: muted,
                              }}
                            >
                              <bdi dir="ltr">{money(strikePrice, store.currency, lang)}</bdi>
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
        border: "1px solid var(--line)",
        background: "var(--surface)",
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
          color: "var(--muted)",
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
  canCustomize,
  githubConfigured,
  initialBuilds,
  initialQuota,
}: {
  store: StudioStoreProps;
  preview: StorePreviewProps;
  unlocked: boolean;
  isSuperAdmin: boolean;
  canViewBilling: boolean;
  canCustomize: boolean;
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
          ? "Build queued. Follow its progress in build history."
          : "أُضيف التطبيق إلى قائمة البناء. تابع تقدّمه في سجل الإصدارات.",
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

  const copy = (english: string, arabic: string) => isEn ? english : arabic;
  const planLabel = localizedText(lang, store.planNameAr, store.planNameEn);
  const locked = !unlocked || builderDisabled;
  const latest = builds.find(b => b.status === "succeeded" && b.apk_download_url);
  const buildLabels = { queued: copy("Queued", "في الانتظار"), building: copy("Building", "قيد البناء"),
    succeeded: copy("Ready to download", "جاهز للتحميل"), failed: copy("Failed", "تعذّر البناء") };
  const cols = isEn ? ["Release", "Created", "Status", "Files"] : ["الإصدار", "تاريخ الإنشاء", "الحالة", "الملفات"];
  const previewCard = <section className="ws-box ws-studio-preview">
    <div className="ws-section-line"><h2>{copy("App preview", "معاينة التطبيق")}</h2>
      <div role="group" className="ws-preview-modes" aria-label={copy("Preview theme", "مظهر المعاينة")}>
        <button type="button" aria-pressed={!previewDarkMode} onClick={() => setPreviewDarkMode(false)}><Sun size={14}/>{copy("Light", "فاتح")}</button>
        <button type="button" aria-pressed={previewDarkMode} onClick={() => setPreviewDarkMode(true)}><Moon size={14}/>{copy("Dark", "داكن")}</button>
      </div></div>
    <AndroidPhoneMockup appName={appName} iconUrl={iconUrl} store={store} preview={preview} isEn={isEn} darkMode={previewDarkMode} locked={locked} />
    {canCustomize && <Link href="/admin/customizer" className="ws-text-link"><Palette size={14}/>{copy("Edit storefront design", "تعديل تصميم المتجر")}</Link>}
    {!locked && latest?.apk_download_url && <QrCodeCard url={latest.apk_download_url} isEn={isEn} />}
  </section>;
  return <div className="ws-page ws-studio" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <WorkspaceHeading title={copy("Android app studio", "استوديو تطبيق أندرويد")}
      description={copy("Choose the name and icon customers see when they install your store’s app.", "اختر الاسم والأيقونة اللذين يراهما عملاؤك عند تثبيت تطبيق متجرك.")}>
      <span className="ws-role">{planLabel}</span></WorkspaceHeading>
    {locked ? <><QuotaPrompt canViewBilling={canViewBilling} resource="apk_builds" lang={lang} disabled />{previewCard}
      {store.supportEmail && <a className="ws-text-link" href={"mailto:" + store.supportEmail}>{copy("Contact support", "تواصل مع الدعم")}</a>}</> : <>
      {limitReached(quota.current, quota.limit) && <QuotaPrompt canViewBilling={canViewBilling} resource="apk_builds" lang={lang} usage={quota} />}
      {!githubConfigured && <div role="status" className="ws-feedback ws-studio-warn">
        {isSuperAdmin ? <>{copy("Connect GitHub Actions to enable cloud builds.", "اربط GitHub Actions لتفعيل البناء السحابي.")}
          <small>{copy("Set ", "اضبط ")}<bdi dir="ltr">GITHUB_ACTIONS_TOKEN · GITHUB_REPO_OWNER · GITHUB_REPO_NAME</bdi>
            {copy(" in ", " في ")}<bdi dir="ltr">web-store/.env.local</bdi></small></> :
          copy("The build service is being set up. Check back shortly.", "يجري إعداد خدمة بناء التطبيق. حاول مجدداً بعد قليل.")}</div>}
      {banner && <div role="status" className={"ws-feedback ws-section-line" + (banner.kind === "err" ? " ws-error" : banner.kind === "warn" ? " ws-studio-warn" : "")}>
        {banner.text}<button type="button" className="ws-icon-button" onClick={() => setBanner(null)} aria-label={copy("Dismiss", "إغلاق")}><X size={15}/></button></div>}
      <div className="ws-studio-grid">
        <section className="ws-box ws-stack"><h2>{copy("App identity", "هوية التطبيق")}</h2>
          <form className="ws-form" onSubmit={handleTriggerBuild}>
            <label>{copy("App name", "اسم التطبيق على الهاتف")}<input id="app-name" type="text" dir="auto" required minLength={2} maxLength={60}
              value={appName} onChange={e => setAppName(e.target.value)} /></label>
            <div className="ws-stack ws-rule"><h3>{copy("App icon", "أيقونة التطبيق")}</h3>
              <div className="ws-icon-upload"><span className="ws-launcher-icon" style={{ background: store.primaryColor, color: store.primaryText }}>
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconUrl} alt="" width={60} height={60} />
                ) : appName.slice(0, 1).toUpperCase()}</span>
                <div className="ws-actions"><input ref={fileInputRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleIconFileChange} />
                  <button className="ws-button" type="button" disabled={uploadingIcon} onClick={() => fileInputRef.current?.click()}><Upload size={15}/>
                    {uploadingIcon ? copy("Uploading…", "جارٍ الرفع…") : copy("Upload icon", "رفع أيقونة")}</button>
                  {iconUrl && <button className="ws-button" type="button" disabled={uploadingIcon} onClick={() => void handleRemoveIcon()}><Trash2 size={14}/>{copy("Remove", "إزالة")}</button>}</div></div>
              <small>{copy("Use a square PNG, JPG or WebP up to 2 MB. A 512 × 512 image works well.", "اختر صورة مربعة بصيغة PNG أو JPG أو WebP بحجم أقصاه ٢ م.ب. المقاس المفضّل ٥١٢ × ٥١٢.")}</small>
              {iconFeedback && <p role="status" className={iconFeedback.kind === "err" ? "ws-field-error" : "ws-feedback"}>{iconFeedback.text}</p>}
              <button type="button" className="ws-button" aria-expanded={showUrlInput} onClick={() => setShowUrlInput(!showUrlInput)}><Link2 size={14}/>
                {showUrlInput ? copy("Hide image address", "إخفاء عنوان الصورة") : copy("Use an image address", "استخدام رابط صورة")}</button>
              {showUrlInput && <label>{copy("Icon URL", "رابط الأيقونة")}<input type="url" dir="ltr" value={iconUrl}
                onChange={e => { setIconUrl(e.target.value); setUploadedIconPath(null); setIconFeedback(null); }} /></label>}
            </div>
            <dl className="ws-facts ws-rule"><div><dt>{copy("Android package", "حزمة أندرويد")}</dt><dd><bdi dir="ltr">{store.packageId}</bdi></dd></div>
              <div><dt>{copy("Store ID", "معرّف المتجر")}</dt><dd><bdi dir="ltr">{store.storeId}</bdi></dd></div>
              <div><dt>{copy("Builds this month", "إصدارات هذا الشهر")}</dt><dd><bdi dir="ltr">{limitLabel(quota.current, lang)} / {limitLabel(quota.limit, lang)}</bdi></dd></div></dl>
            <button className="ws-primary" type="submit" disabled={submitting || hasActiveBuild}><Rocket size={16}/>
              {submitting ? copy("Starting build…", "جارٍ بدء البناء…") : hasActiveBuild ? copy("Build in progress", "البناء جارٍ") : copy("Build APK", "بناء ملف APK")}</button>
          </form>
        </section>{previewCard}
      </div>
      <section className="ws-sheet"><div className="ws-section-head"><div><h2>{copy("Build history", "سجل الإصدارات")}</h2>
        {hasActiveBuild && <p>{copy("Updates every 10 seconds while a build is running.", "تتحدّث الحالة كل عشر ثوانٍ أثناء البناء.")}</p>}</div>
        <button className="ws-button" type="button" disabled={refreshing} onClick={() => void fetchBuilds(true)}><RefreshCw size={14}/>
          {refreshing ? copy("Refreshing…", "جارٍ التحديث…") : copy("Refresh", "تحديث")}</button></div>
        {builds.length ? <WorkspaceTable columns={cols} caption={copy("Android releases", "إصدارات أندرويد")}>{builds.map(b => <tr role="row" key={b.id}>
          <DataCell><div className="ws-cell-stack"><strong dir="auto">{b.app_name}</strong><small><bdi dir="ltr">v{b.version_name} (#{b.version_code})</bdi></small>
            <small><bdi dir="ltr">{b.package_id}</bdi></small></div></DataCell>
          <DataCell label={cols[1]}><bdi dir="ltr">{date(b.created_at, lang)}</bdi></DataCell>
          <DataCell label={cols[2]}><StatusDot status={b.status}>{buildLabels[b.status]}</StatusDot>
            {b.status === "failed" && <small className="ws-block">{copy("Try another build or contact support.", "أعد البناء أو تواصل مع الدعم.")}</small>}</DataCell>
          <DataCell label={cols[3]}><div className="ws-actions">
            {b.apk_download_url && b.status === "succeeded" && <a className="ws-button" href={b.apk_download_url} target="_blank" rel="noreferrer"><Download size={14}/>{copy("Download APK", "تحميل APK")}</a>}
            {b.github_run_url && <a className="ws-text-link" href={b.github_run_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{copy("Build log", "تفاصيل البناء")}</a>}
            {!b.github_run_url && !(b.apk_download_url && b.status === "succeeded") && "—"}</div></DataCell>
        </tr>)}</WorkspaceTable> : <WorkspaceEmpty title={copy("Your first release starts here", "ابدأ بإصدار تطبيقك الأول")}
          action={<a className="ws-button" href="#app-name">{copy("Set up your app", "إعداد التطبيق")}</a>}>
          {copy("Once a build finishes, its installation file will be available here.", "بعد اكتمال البناء، ستجد ملف التثبيت هنا.")}</WorkspaceEmpty>}
      </section>
    </>}
  </div>;
}
