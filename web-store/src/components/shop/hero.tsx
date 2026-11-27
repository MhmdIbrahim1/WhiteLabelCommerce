"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import {
  defaultHeroBannerCms,
  type HeroBannerCmsConfig,
  type HeroLayout,
} from "@/lib/ui-config";
import { storefrontPresets, type StorefrontPreset } from "@/lib/storefront-presets";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { StoreCopy } from "./store-copy";
import { useStudioPreview } from "./studio-preview-context";
import { useLanguage } from "@/components/language-provider";
import { safeRelativePath } from "@/lib/security";
import { storeHref } from "@/lib/tenant-shared";

export function normalizePromoHref(rawHref: string | null | undefined): string {
  const clean = (rawHref ?? "").trim();
  if (!clean) return "/products";
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    try {
      const parsed = new URL(clean);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch {
      return "/products";
    }
    return "/products";
  }
  if (clean.startsWith("/product/")) {
    const rest = clean.slice("/product/".length).trim();
    return rest ? safeRelativePath(`/products/${rest}`, "/products") : "/products";
  }
  if (clean.startsWith("/category/")) {
    const rest = clean.slice("/category/".length).trim();
    return rest ? `/products?category=${encodeURIComponent(rest)}` : "/products";
  }
  if (clean === "/offers") return "/products";
  return safeRelativePath(clean, "/products");
}

function CtaLink({
  href,
  basePath = "",
  className,
  children,
}: {
  href: string;
  basePath?: string;
  className: string;
  children: React.ReactNode;
}) {
  const resolved = normalizePromoHref(href);
  const isExternal =
    resolved.startsWith("http://") || resolved.startsWith("https://");
  if (isExternal) {
    return (
      <a
        href={resolved}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={storeHref(basePath, resolved)}
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}


type HeroProps = {
  name: string;
  preset: StorefrontPreset;
  artwork: string;
  previewArt?: Record<StorefrontPreset, string>;
  banners: string[];
  slider: boolean;
  layout: HeroLayout;
  autoSlideMs: number;
  motion: boolean;
  cms: HeroBannerCmsConfig;
  basePath: string;
  collectionHref?: string;
};

export function Hero(props: HeroProps) {
  const { name, banners, slider, autoSlideMs, basePath, collectionHref } = props;
  const preview = useStudioPreview();
  const preset = preview?.theme.preset ?? props.preset;
  const artwork = props.previewArt?.[preset] ?? props.artwork;
  const layout = preview?.home.heroLayout ?? props.layout;
  const motion = preview?.theme.motionEnabled ?? props.motion;
  const cms = preview?.home ?? props.cms;
  const { lang, t } = useLanguage();
  const en = lang === "en";
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reduce, setReduce] = useState(true);
  const touch = useRef<number | null>(null);
  const campaigns = cms.promo_banners.filter(campaign => campaign.active);
  const count = campaigns.length || (cms.hero_image_url || !slider ? 1 : Math.max(1, banners.length));
  const active = index % count;
  const campaign = campaigns[active];
  const pick = (ar: string, english: string) => (en ? english || ar : ar || english).trim();
  const editorial = storefrontPresets[preset][lang];
  const title = (campaign && pick(campaign.title_ar, campaign.title_en)) || pick(cms.hero_title_ar, cms.hero_title_en) || editorial.title;
  const subtitle = en ? cms.hero_subtitle_en : cms.hero_subtitle_ar;
  const defaults = defaultHeroBannerCms();
  const body = campaign ? pick(campaign.subtitle_ar, campaign.subtitle_en)
    : subtitle === (en ? defaults.hero_subtitle_en : defaults.hero_subtitle_ar) ? editorial.body : subtitle;
  const badge = campaign ? pick(campaign.badge_ar, campaign.badge_en) : pick(cms.hero_badge_ar, cms.hero_badge_en);
  const label = (campaign && pick(campaign.cta_text_ar, campaign.cta_text_en)) || pick(cms.hero_cta_text_ar, cms.hero_cta_text_en) || editorial.cta;
  const target = campaign?.cta_link || cms.hero_cta_link;
  const src = storefrontImageSrc(campaign?.image_url || cms.hero_image_url || banners[active % (banners.length || 1)], 1920) || artwork;
  const allowAutoplay = motion && !reduce && autoSlideMs > 0 && count > 1;
  const forward = () => setIndex(i => (i + 1) % count);
  const back = () => setIndex(i => (i + count - 1) % count);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!allowAutoplay || paused || interacting) return;
    const timer = window.setInterval(() => setIndex(i => (i + 1) % count), Math.max(2000, autoSlideMs));
    return () => window.clearInterval(timer);
  }, [allowAutoplay, paused, interacting, autoSlideMs, count]);
  if (!cms.hero_visible) return null;

  const Arrow = en ? ArrowRight : ArrowLeft;
  return <section className="sf-hero" data-layout={layout} aria-label={name}
    onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
    onFocusCapture={event => { if (!(event.target as Element).closest("[data-rotation]")) setPaused(true); }}
    onTouchStart={event => { touch.current = event.touches[0].clientX; }}
    onTouchEnd={event => {
      const distance = touch.current === null ? 0 : event.changedTouches[0].clientX - touch.current;
      touch.current = null;
      if (Math.abs(distance) > 48) { setPaused(true); if ((distance < 0) === en) forward(); else back(); }
    }}>
    <div className="sf-hero-copy" aria-live={allowAutoplay && !paused ? "off" : "polite"}>
      {cms.hero_badge_visible && badge && <span className="sf-hero-caption" style={{ borderColor: campaign?.gradient_end }}><StoreCopy text={badge} lang={lang}/></span>}
      <h1><StoreCopy text={title} lang={lang}/></h1>
      {body && <p><StoreCopy text={body} lang={lang}/></p>}
      {cms.hero_cta_visible && <div className="sf-hero-links">
        <CtaLink href={target} basePath={basePath} className="sf-primary"><StoreCopy text={label} lang={lang}/><Arrow size={17} /></CtaLink>
        {collectionHref && <Link className="sf-text-link" href={collectionHref}>{t("navLatest")}</Link>}
      </div>}
    </div>
    <div className="sf-hero-art">
      <Image key={src} src={src} alt="" fill loading="eager" sizes="(max-width: 700px) 100vw, 60vw" unoptimized />
      {layout === "full-bleed" && <span className="sf-hero-shade" style={{ opacity: cms.hero_overlay_opacity / 100 }} />}
    </div>
    {count > 1 && <div className="sf-slide-controls" role="group" aria-label={en ? "Promotions" : "العروض"}>
      <button type="button" onClick={back} aria-label={en ? "Previous slide" : "العرض السابق"}>{en ? <ChevronLeft/> : <ChevronRight/>}</button>
      <bdi dir="ltr">{(active + 1).toLocaleString(lang)} / {count.toLocaleString(lang)}</bdi>
      <button type="button" onClick={forward} aria-label={en ? "Next slide" : "العرض التالي"}>{en ? <ChevronRight/> : <ChevronLeft/>}</button>
      {allowAutoplay && <button type="button" data-rotation="" onClick={() => setPaused(value => !value)}
        aria-label={paused ? (en ? "Play slides" : "تشغيل العرض") : (en ? "Pause slides" : "إيقاف العرض مؤقتاً")}>
        {paused ? <Play/> : <Pause/>}
      </button>}
    </div>}
  </section>;
}
