"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Zap } from "lucide-react";
import { money } from "@/lib/brand";
import type { Lang } from "@/lib/i18n";
import {
  formatFlashCountdown,
  getFlashRemainingMs,
  getFlashSavingsPercent,
  getRegularSavingsPercent,
  isFlashSaleActive,
  resolveEffectivePrice,
  type FlashSalePriceInput,
} from "@/lib/flash-sale";

export function FlashSaleCountdownPill({
  endsAt,
  startsAt,
  lang = "ar",
  size = "sm",
  showLabel = false,
  onExpire,
}: {
  endsAt: string | null | undefined;
  startsAt?: string | null;
  lang?: Lang;
  size?: "sm" | "md";
  showLabel?: boolean;
  onExpire?: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const expiredNotified = useRef(false);

  useEffect(() => {
    expiredNotified.current = false;
    if (!endsAt) return;

    let intervalId: number | null = null;
    const tick = () => {
      const now = Date.now();
      if (startsAt) {
        const startMs = Date.parse(startsAt);
        if (Number.isFinite(startMs) && now < startMs) {
          setRemainingMs(0);
          if (intervalId !== null) window.clearInterval(intervalId);
          return;
        }
      }
      const left = getFlashRemainingMs(endsAt, now);
      setRemainingMs(left);
      if (left <= 0) {
        if (!expiredNotified.current) {
          expiredNotified.current = true;
          onExpire?.();
        }
        if (intervalId !== null) window.clearInterval(intervalId);
      }
    };

    const kickoff = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 1000);
    }, 0);

    return () => {
      window.clearTimeout(kickoff);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [endsAt, startsAt, onExpire]);

  if (!endsAt) return null;
  if (remainingMs !== null && remainingMs <= 0) return null;

  const isEn = lang === "en";
  const display =
    remainingMs === null
      ? "--:--:--"
      : formatFlashCountdown(remainingMs, lang);

  return (
    <span
      className={`flash-countdown-pill flash-countdown-pill--${size}`}
      aria-label={
        isEn
          ? `Flash deal ends in ${display}`
          : `ينتهي العرض المؤقت خلال ${display}`
      }
    >
      <Clock size={size === "md" ? 13 : 11} aria-hidden="true" />
      {showLabel && (
        <span className="flash-countdown-label">
          {isEn ? "Ends in" : "ينتهي خلال"}
        </span>
      )}
      <span className="flash-countdown-digits" dir="ltr">
        {display}
      </span>
    </span>
  );
}

/**
 * Displays discount badge on product card media:
 * - Active Flash Sale -> compact `⚡ -XX%` badge (auto-hides on expiry)
 * - Otherwise regular `old_price` discount badge if applicable
 */
export function ProductDiscountBadge({
  product,
  lang = "ar",
}: {
  product: FlashSalePriceInput;
  lang?: Lang;
}) {
  const [expiredForKey, setExpiredForKey] = useState<string | null>(null);
  const flashKey = `${product.flash_sale_price ?? ""}|${product.flash_sale_ends_at ?? ""}`;

  useEffect(() => {
    if (!product.flash_sale_ends_at) return;
    const left = getFlashRemainingMs(product.flash_sale_ends_at);
    if (left > 2_147_000_000) return;
    const timer = window.setTimeout(
      () => setExpiredForKey(flashKey),
      Math.max(0, left),
    );
    return () => window.clearTimeout(timer);
  }, [product.flash_sale_ends_at, flashKey]);

  const expired = expiredForKey === flashKey;

  const flashPct = !expired ? getFlashSavingsPercent(product) : null;
  if (flashPct !== null) {
    return (
      <span className="discount discount--flash">
        <Zap size={11} aria-hidden="true" />
        <span dir="ltr">
          -{flashPct}
          {lang === "en" ? "%" : "٪"}
        </span>
      </span>
    );
  }

  const regularPct = getRegularSavingsPercent(product);
  if (regularPct !== null) {
    return (
      <span className="discount">
        -{regularPct}
        {lang === "en" ? "%" : "٪"}
      </span>
    );
  }

  return null;
}

/**
 * Live Flash-aware Price Block for Product Cards and Product Detail Pages.
 * Automatically reverts to regular price and hides the countdown if the deal expires on the client.
 */
export function ProductPriceDisplay({
  product,
  currency,
  lang = "ar",
  variant = "card",
}: {
  product: FlashSalePriceInput;
  currency: string;
  lang?: Lang;
  variant?: "card" | "detail";
}) {
  const [expired, setExpired] = useState(false);

  const activeFlash = !expired && isFlashSaleActive(product);
  const effectivePrice = activeFlash
    ? resolveEffectivePrice(product)
    : Number(product.price);
  const strikePrice = activeFlash
    ? Number(product.price)
    : product.old_price !== null &&
        product.old_price !== undefined &&
        product.old_price > product.price
      ? Number(product.old_price)
      : null;
  const flashPct = activeFlash ? getFlashSavingsPercent(product) : null;

  return (
    <div
      className={`price-block price-block--${variant} ${activeFlash ? "is-flash" : ""}`}
    >
      <div className="price">
        <strong
          className={`price-badge ${activeFlash ? "price-badge--flash" : ""}`}
        >
          {money(effectivePrice, currency, lang)}
        </strong>
        {strikePrice !== null && (
          <del>{money(strikePrice, currency, lang)}</del>
        )}
        {variant === "detail" && activeFlash && flashPct !== null && (
          <span className="detail-flash-save-pill">
            <Zap size={12} aria-hidden="true" />
            <span dir="ltr">
              -{flashPct}
              {lang === "en" ? "%" : "٪"}
            </span>
          </span>
        )}
      </div>
      {activeFlash && product.flash_sale_ends_at && (
        <div className="price-countdown-row">
          <FlashSaleCountdownPill
            endsAt={product.flash_sale_ends_at}
            startsAt={product.flash_sale_starts_at}
            lang={lang}
            size={variant === "detail" ? "md" : "sm"}
            showLabel={variant === "detail"}
            onExpire={() => setExpired(true)}
          />
        </div>
      )}
    </div>
  );
}
