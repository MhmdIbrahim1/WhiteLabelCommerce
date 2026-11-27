"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
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
  type PromoBannerCampaign,
} from "@/lib/ui-config";
import { storefrontPresets, type StorefrontPreset } from "@/lib/storefront-presets";
import { storefrontImageSrc } from "@/lib/storefront-media";
import { StoreCopy } from "./store-copy";
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
  onPreviewNavigate,
  children,
}: {
  href: string;
  basePath?: string;
  className: string;
  onPreviewNavigate?: (href: string) => void;
  children: React.ReactNode;
}) {
  const resolved = normalizePromoHref(href);
  if (onPreviewNavigate) {
    return (
      <a
        href={resolved}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPreviewNavigate(resolved);
        }}
      >
        {children}
      </a>
    );
  }
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

export function PromoBannerCarousel({
  campaigns,
  autoSlideMs,
  overlayOpacity,
  isEn,
  basePath = "",
  onPreviewNavigate,
}: {
  campaigns: PromoBannerCampaign[];
  autoSlideMs: number;
  overlayOpacity: number;
  isEn: boolean;
  basePath?: string;
  onPreviewNavigate?: (href: string) => void;
}) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const pointerStartX = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  const total = campaigns.length;
  const safeIdx = total > 0 ? active % total : 0;

  useEffect(() => {
    if (paused || total <= 1 || autoSlideMs <= 0) return;
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % total);
    }, Math.max(2000, autoSlideMs));
    return () => clearInterval(id);
  }, [paused, total, autoSlideMs]);

  if (total === 0) return null;

  const goPrev = () => setActive((prev) => (prev - 1 + total) % total);
  const goNext = () => setActive((prev) => (prev + 1) % total);

  const pickLang = (ar: string, en: string) =>
    isEn ? en.trim() || ar.trim() : ar.trim() || en.trim();

  const overlayAlpha = Math.min(80, Math.max(0, overlayOpacity)) / 100;

  const handleSwipeEnd = (endX: number | null) => {
    const startX = pointerStartX.current;
    if (startX !== null && endX !== null && Math.abs(endX - startX) > 40) {
      draggedRef.current = true;
      if (endX < startX) {
        if (isEn) goNext();
        else goPrev();
      } else {
        if (isEn) goPrev();
        else goNext();
      }
      setTimeout(() => {
        draggedRef.current = false;
      }, 120);
    }
    pointerStartX.current = null;
  };

  const navigateSlide = (rawLink: string) => {
    if (draggedRef.current) return;
    const resolved = normalizePromoHref(rawLink);
    if (onPreviewNavigate) {
      onPreviewNavigate(resolved);
      return;
    }
    if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
      window.open(resolved, "_blank", "noopener,noreferrer");
    } else {
      router.push(storeHref(basePath, resolved));
    }
  };

  return (
    <section
      className="promo-carousel-shell shop-animate"
      aria-roledescription="carousel"
      aria-label={isEn ? "Featured promotions" : "العروض والحملات المميزة"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        pointerStartX.current = null;
      }}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        setPaused(true);
        pointerStartX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        handleSwipeEnd(e.clientX);
        setPaused(false);
      }}
      onTouchStart={(e) => {
        setPaused(true);
        pointerStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        handleSwipeEnd(e.changedTouches[0]?.clientX ?? null);
        setPaused(false);
      }}
    >
      <div className="promo-carousel-stage">
        {campaigns.map((slide, idx) => {
          const isActive = idx === safeIdx;
          const badge = pickLang(slide.badge_ar, slide.badge_en);
          const title = pickLang(slide.title_ar, slide.title_en);
          const subtitle = pickLang(slide.subtitle_ar, slide.subtitle_en);
          const cta =
            pickLang(slide.cta_text_ar, slide.cta_text_en) ||
            (isEn ? "Shop Now" : "تسوّق الآن");

          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className={`promo-carousel-slide ${isActive ? "is-active" : "is-inactive"}`}
              style={{
                background: `linear-gradient(135deg, ${slide.gradient_start}, ${slide.gradient_end})`,
              }}
              onClick={() => {
                if (isActive) navigateSlide(slide.cta_link);
              }}
            >
              {slide.image_url?.trim() && (
                <div className="promo-carousel-bg" aria-hidden="true">
                  <Image
                    src={slide.image_url.trim()}
                    unoptimized
                    fill
                    loading={idx === 0 ? "eager" : "lazy"}
                    alt={title}
                    draggable={false}
                  />
                  <div
                    className="promo-carousel-scrim"
                    style={{
                      background: `linear-gradient(180deg, rgba(10,15,28,${Math.max(0.22, overlayAlpha * 0.6).toFixed(2)}) 0%, rgba(10,15,28,${Math.max(overlayAlpha + 0.18, 0.56).toFixed(2)}) 100%)`,
                    }}
                  />
                  <div
                    className="promo-carousel-scrim-side"
                    style={{
                      background: isEn
                        ? "linear-gradient(90deg, rgba(10,15,28,0.68) 0%, rgba(10,15,28,0.22) 55%, rgba(10,15,28,0.04) 100%)"
                        : "linear-gradient(270deg, rgba(10,15,28,0.68) 0%, rgba(10,15,28,0.22) 55%, rgba(10,15,28,0.04) 100%)",
                    }}
                  />
                </div>
              )}

              <div className="promo-carousel-copy">
                {badge && (
                  <span
                    className="hero-eyebrow inline-flex w-fit self-start"
                    style={{ color: "#FFFFFF" }}
                  >
                    <Sparkles size={13} /> {badge}
                  </span>
                )}
                <h1 style={{ color: "#FFFFFF" }}>{title}</h1>
                {subtitle && (
                  <p
                    className="hero-subtitle"
                    style={{ color: "rgba(255, 255, 255, 0.92)" }}
                  >
                    {subtitle}
                  </p>
                )}
                <div className="hero-actions">
                  <CtaLink
                    className="cta hero-cta-pill"
                    href={slide.cta_link || "/products"}
                    basePath={basePath}
                    onPreviewNavigate={onPreviewNavigate}
                  >
                    {cta} <ArrowIcon size={16} />
                  </CtaLink>
                </div>
              </div>
            </div>
          );
        })}

        {total > 1 && (
          <>
            <button
              type="button"
              className="promo-carousel-arrow promo-carousel-arrow--start"
              aria-label={isEn ? "Previous slide" : "الشريحة السابقة"}
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
            >
              {isEn ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
            <button
              type="button"
              className="promo-carousel-arrow promo-carousel-arrow--end"
              aria-label={isEn ? "Next slide" : "الشريحة التالية"}
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
            >
              {isEn ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
            <div
              className="promo-carousel-dots"
              role="tablist"
              aria-label={isEn ? "Carousel slides" : "شرائح البانر"}
            >
              {campaigns.map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={idx === safeIdx}
                  aria-label={
                    isEn ? `Go to slide ${idx + 1}` : `الانتقال للشريحة ${idx + 1}`
                  }
                  className={`promo-carousel-pill ${idx === safeIdx ? "is-active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActive(idx);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

type HeroProps = {
  name: string;
  preset: StorefrontPreset;
  artwork: string;
  banners: string[];
  slider: boolean;
  layout: HeroLayout;
  autoSlideMs: number;
  motion: boolean;
  cms: HeroBannerCmsConfig;
  basePath: string;
  collectionHref?: string;
};

export function Hero({ name, preset, artwork, banners, slider, layout, autoSlideMs, motion, cms, basePath, collectionHref }: HeroProps) {
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
