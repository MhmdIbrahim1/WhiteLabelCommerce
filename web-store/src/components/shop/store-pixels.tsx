"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { CheckCircle2, Radio, X } from "lucide-react";
import { setActivePixelConfig, trackPageView } from "@/lib/analytics";
import {
  validateGa4Id,
  validateMetaPixelId,
  validateTiktokPixelId,
} from "@/lib/marketing";
import { useLanguage } from "@/components/language-provider";

function PixelRouteTracker({
  storeId,
  metaId,
  tiktokId,
  ga4Id,
  onTestParam,
}: {
  storeId: string;
  metaId: string;
  tiktokId: string;
  ga4Id: string;
  onTestParam: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";
  const lastTrackedKey = useRef<string | null>(null);

  // Synchronously scope active tenant pixels & fire exactly one PageView per (storeId, pathname, search)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const activeConfig = { storeId, metaId, tiktokId, ga4Id };
    setActivePixelConfig(activeConfig);

    if (!(window.__wlcInitializedPixels instanceof Set)) {
      window.__wlcInitializedPixels = new Set<string>();
    }
    const initialized = window.__wlcInitializedPixels;

    if (metaId && typeof window.fbq === "function") {
      const key = `meta:${metaId}`;
      if (!initialized.has(key)) {
        window.fbq("init", metaId);
        initialized.add(key);
      }
    }

    if (tiktokId && window.ttq && typeof window.ttq.load === "function") {
      const key = `tiktok:${tiktokId}`;
      if (!initialized.has(key)) {
        window.ttq.load(tiktokId);
        initialized.add(key);
      }
    }

    if (ga4Id && typeof window.gtag === "function") {
      const key = `ga4:${ga4Id}`;
      if (!initialized.has(key)) {
        window.gtag("config", ga4Id, { send_page_view: false });
        initialized.add(key);
      }
    }

    const fullPath = searchString ? `${pathname}?${searchString}` : pathname;
    const trackingKey = `${storeId}|${metaId}|${tiktokId}|${ga4Id}|${fullPath}`;

    if (lastTrackedKey.current !== trackingKey) {
      lastTrackedKey.current = trackingKey;
      trackPageView(fullPath, activeConfig);
    }

    if (searchParams?.get("wlc_pixel_test") === "1") {
      onTestParam();
    }
  }, [storeId, metaId, tiktokId, ga4Id, pathname, searchString, searchParams, onTestParam]);

  return null;
}

export function StorePixels({
  storeId,
  metaPixelId,
  tiktokPixelId,
  ga4MeasurementId,
}: {
  storeId: string;
  metaPixelId?: string | null;
  tiktokPixelId?: string | null;
  ga4MeasurementId?: string | null;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";

  const metaCheck = validateMetaPixelId(metaPixelId);
  const tiktokCheck = validateTiktokPixelId(tiktokPixelId);
  const ga4Check = validateGa4Id(ga4MeasurementId);

  const metaId = metaCheck.valid ? metaCheck.value : "";
  const tiktokId = tiktokCheck.valid ? tiktokCheck.value : "";
  const ga4Id = ga4Check.valid ? ga4Check.value : "";

  const [testBannerOpen, setTestBannerOpen] = useState(false);

  // Immediately update active pixel context whenever tenant props change
  useEffect(() => {
    setActivePixelConfig({ storeId, metaId, tiktokId, ga4Id });
  }, [storeId, metaId, tiktokId, ga4Id]);

  const activeCount = [metaId, tiktokId, ga4Id].filter(Boolean).length;

  return (
    <>
      <div
        id="wlc-pixels-root"
        data-store-id={storeId}
        data-meta-pixel={metaId}
        data-tiktok-pixel={tiktokId}
        data-ga4-id={ga4Id}
        hidden
      />

      {/* Meta (Facebook) Pixel — initializes SDK only; PageView is dispatched once via PixelRouteTracker */}
      {metaId && (
        <Script
          id={`wlc-meta-pixel-${metaId}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');window.__wlcInitializedPixels=window.__wlcInitializedPixels||new Set();if(!window.__wlcInitializedPixels.has('meta:${metaId}')){fbq('init','${metaId}');window.__wlcInitializedPixels.add('meta:${metaId}');}`,
          }}
        />
      )}

      {/* TikTok Pixel — initializes SDK only; PageView is dispatched once via PixelRouteTracker */}
      {tiktokId && (
        <Script
          id={`wlc-tiktok-pixel-${tiktokId}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};window.__wlcInitializedPixels=window.__wlcInitializedPixels||new Set();if(!window.__wlcInitializedPixels.has('tiktok:${tiktokId}')){ttq.load('${tiktokId}');window.__wlcInitializedPixels.add('tiktok:${tiktokId}');}}(window,document,'ttq');`,
          }}
        />
      )}

      {/* Google Analytics 4 (GA4) — initializes SDK only; PageView is dispatched once via PixelRouteTracker */}
      {ga4Id && (
        <>
          <Script
            id={`wlc-ga4-src-${ga4Id}`}
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`}
          />
          <Script
            id={`wlc-ga4-init-${ga4Id}`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=window.gtag||gtag;gtag('js',new Date());window.__wlcInitializedPixels=window.__wlcInitializedPixels||new Set();if(!window.__wlcInitializedPixels.has('ga4:${ga4Id}')){gtag('config','${ga4Id}',{send_page_view:false});window.__wlcInitializedPixels.add('ga4:${ga4Id}');}`,
            }}
          />
        </>
      )}

      <Suspense fallback={null}>
        <PixelRouteTracker
          storeId={storeId}
          metaId={metaId}
          tiktokId={tiktokId}
          ga4Id={ga4Id}
          onTestParam={() => setTestBannerOpen(true)}
        />
      </Suspense>

      {/* Pixel Test Verification Toast (only shown when ?wlc_pixel_test=1) */}
      {testBannerOpen && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: "1rem",
            insetInlineEnd: "1rem",
            zIndex: 130,
            maxWidth: "min(360px, calc(100vw - 2rem))",
            padding: "0.85rem 1rem",
            borderRadius: "14px",
            background: "#0f172a",
            color: "#f8fafc",
            border: "1px solid rgba(148,163,184,0.35)",
            boxShadow: "0 18px 40px rgba(15,23,42,0.35)",
            display: "grid",
            gap: "0.45rem",
            fontSize: "0.82rem",
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
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontWeight: 750,
                color: "#34d399",
              }}
            >
              <Radio size={15} />
              {isEn ? "Pixel Test Event Fired" : "تم إرسال حدث اختبار البكسل"}
            </span>
            <button
              type="button"
              aria-label={isEn ? "Close" : "إغلاق"}
              onClick={() => setTestBannerOpen(false)}
              style={{
                background: "transparent",
                color: "#cbd5e1",
                border: 0,
                padding: "0.15rem",
              }}
            >
              <X size={15} />
            </button>
          </div>
          {activeCount === 0 ? (
            <p style={{ margin: 0, color: "#cbd5e1" }}>
              {isEn
                ? "No active ad pixels configured for this store yet."
                : "لا توجد بكسلات إعلانات مفعّلة لهذا المتجر حالياً."}
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.25rem", color: "#e2e8f0" }}>
              {metaId && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <CheckCircle2 size={13} color="#34d399" /> Meta Pixel:{" "}
                  <code dir="ltr">{metaId}</code>
                </span>
              )}
              {tiktokId && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <CheckCircle2 size={13} color="#34d399" /> TikTok Pixel:{" "}
                  <code dir="ltr">{tiktokId}</code>
                </span>
              )}
              {ga4Id && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <CheckCircle2 size={13} color="#34d399" /> GA4:{" "}
                  <code dir="ltr">{ga4Id}</code>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
