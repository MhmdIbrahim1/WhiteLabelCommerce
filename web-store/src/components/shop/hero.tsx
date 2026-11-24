"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Truck,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import {
  defaultHeroBannerCms,
  type HeroBannerCmsConfig,
  type HeroLayout,
} from "@/lib/ui-config";
import { useLanguage } from "@/components/language-provider";

function CtaLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  const isExternal =
    href.startsWith("http://") || href.startsWith("https://");
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href || "/products"} className={className}>
      {children}
    </Link>
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
