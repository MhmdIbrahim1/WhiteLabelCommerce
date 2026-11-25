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
  Truck,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import {
  defaultHeroBannerCms,
  type HeroBannerCmsConfig,
  type HeroLayout,
  type PromoBannerCampaign,
} from "@/lib/ui-config";
import { useLanguage } from "@/components/language-provider";
import { safeRelativePath } from "@/lib/security";

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
  className,
  onPreviewNavigate,
  children,
}: {
  href: string;
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
      href={resolved}
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
  onPreviewNavigate,
}: {
  campaigns: PromoBannerCampaign[];
  autoSlideMs: number;
  overlayOpacity: number;
  isEn: boolean;
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
      router.push(resolved);
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
              {slide.image_url && (
                <div className="promo-carousel-bg" aria-hidden="true">
                  <Image
                    src={slide.image_url}
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

export function Hero({
  name,
  banners,
  slider,
  layout = "split",
  autoSlideMs = 5000,
  cms = defaultHeroBannerCms(),
}: {
  name: string;
  banners: string[];
  slider: boolean;
  layout?: HeroLayout;
  autoSlideMs?: number;
  cms?: HeroBannerCmsConfig;
}) {
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  const [index, setIndex] = useState(0);

  const customImage = cms.hero_image_url?.trim() || null;
  const total = customImage ? 1 : banners.length;
  const activeIndex = total > 0 ? index % total : 0;
  const image =
    customImage || banners[activeIndex] || "/store-collection.jpg";
  const secondaryImage =
    banners[(activeIndex + 1) % Math.max(banners.length, 1)] ||
    customImage ||
    "/store-collection.jpg";

  useEffect(() => {
    if (customImage || !slider || total <= 1 || autoSlideMs <= 0) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % total);
    }, autoSlideMs);
    return () => clearInterval(timer);
  }, [customImage, slider, total, autoSlideMs]);

  // Master visibility switch: render nothing (zero spacer gap)
  if (!cms.hero_visible) {
    return null;
  }

  // Multi-campaign animated banner carousel when active campaigns are configured
  const activePromoBanners = (cms.promo_banners ?? []).filter((b) => b.active);
  if (activePromoBanners.length > 0) {
    return (
      <PromoBannerCarousel
        campaigns={activePromoBanners}
        autoSlideMs={autoSlideMs}
        overlayOpacity={cms.hero_overlay_opacity}
        isEn={isEn}
      />
    );
  }

  const pickLang = (ar: string, en: string) =>
    isEn ? en.trim() || ar.trim() : ar.trim() || en.trim();

  const defaultBadge =
    layout === "full-bleed"
      ? t("heroEyebrowNew")
      : layout === "bento"
        ? t("heroEyebrowSeason")
        : t("heroEyebrowRefined");
  const badgeText = pickLang(cms.hero_badge_ar, cms.hero_badge_en) || defaultBadge;

  const customTitle = pickLang(cms.hero_title_ar, cms.hero_title_en);
  const subtitleText = isEn
    ? cms.hero_subtitle_en.trim()
    : cms.hero_subtitle_ar.trim();

  const defaultCtaText =
    layout === "full-bleed"
      ? t("heroShopCollection")
      : layout === "bento"
        ? t("heroShopNow")
        : t("heroShopProducts");
  const ctaText =
    pickLang(cms.hero_cta_text_ar, cms.hero_cta_text_en) || defaultCtaText;
  const ctaHref = cms.hero_cta_link || "/products";

  const overlayAlpha = Math.min(80, Math.max(0, cms.hero_overlay_opacity)) / 100;
  const overlayStyle = {
    background: `linear-gradient(180deg, rgba(10, 15, 28, ${(overlayAlpha * 0.65).toFixed(2)}) 0%, rgba(10, 15, 28, ${overlayAlpha.toFixed(2)}) 100%)`,
  };

  if (layout === "full-bleed") {
    return (
      <section className="shop-hero shop-hero--full-bleed shop-animate">
        <div className="hero-bg-media" aria-hidden="true">
          <Image src={image} unoptimized fill loading="eager" alt={name} />
          <div
            className="hero-overlay hero-overlay--editorial"
            style={overlayStyle}
          />
        </div>
        <div className="hero-copy hero-copy--bottom">
          {cms.hero_badge_visible && badgeText && (
            <span className="hero-eyebrow">
              <Sparkles size={13} /> {badgeText}
            </span>
          )}
          <h1>
            {customTitle ? (
              customTitle
            ) : (
              <>
                {t("heroDiscover")}
                <br />
                {name}
              </>
            )}
          </h1>
          {subtitleText && <p className="hero-subtitle">{subtitleText}</p>}
          {cms.hero_cta_visible && (
            <div className="hero-actions">
              <CtaLink className="cta hero-cta-pill" href={ctaHref}>
                {ctaText} <ArrowIcon size={16} />
              </CtaLink>
              <Link className="hero-ghost-link" href="/#latest">
                {t("navLatest")}
              </Link>
            </div>
          )}
          {!customImage && slider && total > 1 && (
            <div className="slide-controls">
              {banners.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className="slide-dot"
                  aria-pressed={i === activeIndex}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (layout === "bento") {
    return (
      <section className="shop-hero-bento shop-animate">
        <div className="shop-hero bento-main">
          <div className="hero-bg-media" aria-hidden="true">
            <Image src={image} unoptimized fill loading="eager" alt={name} />
            <div
              className="hero-overlay hero-overlay--scrim"
              style={overlayStyle}
            />
          </div>
          <div className="hero-copy hero-copy--bottom">
            {cms.hero_badge_visible && badgeText && (
              <span className="hero-eyebrow">
                <Sparkles size={13} /> {badgeText}
              </span>
            )}
            <h1>
              {customTitle ? (
                customTitle
              ) : (
                <>
                  {t("heroDiscover")}
                  <br />
                  {name}
                </>
              )}
            </h1>
            {subtitleText && <p className="hero-subtitle">{subtitleText}</p>}
            <div className="hero-actions">
              {cms.hero_cta_visible && (
                <CtaLink className="cta hero-cta-pill" href={ctaHref}>
                  {ctaText} <ArrowIcon size={16} />
                </CtaLink>
              )}
              {!customImage && slider && total > 1 && (
                <div className="slide-controls">
                  {banners.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className="slide-dot"
                      aria-pressed={i === activeIndex}
                      aria-label={`Slide ${i + 1}`}
                      onClick={() => setIndex(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bento-side">
          <Link href="/products" className="bento-tile bento-tile--media">
            <Image
              src={secondaryImage}
              unoptimized
              fill
              loading="eager"
              alt={t("navLatest")}
            />
            <div className="bento-scrim" aria-hidden="true" />
            <div className="bento-caption">
              <div>
                <span className="bento-kicker">{t("navLatest")}</span>
                <strong>{t("heroWeeklyPicks")}</strong>
              </div>
              <span className="bento-arrow" aria-hidden="true">
                <ArrowIcon size={17} />
              </span>
            </div>
          </Link>

          <div className="bento-trust-strip" aria-label={t("kickerTrust")}>
            <div className="trust-chip">
              <span className="trust-icon">
                <Truck size={16} />
              </span>
              <div>
                <strong>{t("trustShipShort")}</strong>
                <small>{t("trustShipShortSub")}</small>
              </div>
            </div>
            <div className="trust-chip">
              <span className="trust-icon">
                <ShieldCheck size={16} />
              </span>
              <div>
                <strong>{t("trustCodShort")}</strong>
                <small>{t("trustCodShortSub")}</small>
              </div>
            </div>
            <div className="trust-chip">
              <span className="trust-icon">
                <Clock3 size={16} />
              </span>
              <div>
                <strong>{t("trustTrackShort")}</strong>
                <small>{t("trustTrackShortSub")}</small>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="shop-hero shop-hero--split shop-animate">
      <div className="hero-copy">
        {cms.hero_badge_visible && badgeText && (
          <span className="hero-eyebrow">
            <Sparkles size={13} /> {badgeText}
          </span>
        )}
        <h1>
          {customTitle ? (
            customTitle
          ) : (
            <>
              {t("heroDiscover")}
              <br />
              {name}
            </>
          )}
        </h1>
        {subtitleText && <p className="hero-subtitle">{subtitleText}</p>}
        {cms.hero_cta_visible && (
          <div className="hero-actions">
            <CtaLink className="cta hero-cta-pill" href={ctaHref}>
              {ctaText} <ArrowIcon size={16} />
            </CtaLink>
          </div>
        )}
        {!customImage && slider && total > 1 && (
          <div className="slide-controls">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                className="slide-dot"
                aria-pressed={i === activeIndex}
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="hero-image">
        <Image src={image} unoptimized fill loading="eager" alt={name} />
        {customImage && (
          <div
            className="hero-overlay"
            aria-hidden="true"
            style={overlayStyle}
          />
        )}
      </div>
    </section>
  );
}
