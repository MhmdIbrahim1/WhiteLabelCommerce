"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Zap } from "lucide-react";
import { useSaleClock } from "./use-sale-clock";
import { money } from "@/lib/brand";
import type { Lang } from "@/lib/i18n";
import {
  formatFlashCountdown,
  getFlashRemainingMs,
  formatSavings,
  productPricePresentation,
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
      <bdi className="flash-countdown-digits" dir="ltr">
        {display}
      </bdi>
    </span>
  );
}

export function ProductDiscountBadge({ product, lang = "ar", initialNow }: {
  product: FlashSalePriceInput; lang?: Lang; initialNow: number;
}) {
  const now = useSaleClock([product], initialNow);
  const { flash, savings } = productPricePresentation(product, now);
  if (savings === null) return null;
  return <span className={flash ? "discount discount--flash" : "discount"}>
    {flash && <Zap size={12} aria-hidden="true" />}
    <bdi dir="ltr">{formatSavings(savings, lang)}</bdi>
  </span>;
}

export function ProductPriceDisplay({ product, currency, lang = "ar", variant = "card", initialNow }: {
  product: FlashSalePriceInput; currency: string; lang?: Lang; variant?: "card" | "detail"; initialNow: number;
}) {
  const now = useSaleClock([product], initialNow);
  const { flash, current, compareAt, savings } = productPricePresentation(product, now);
  return <div className={`price-block price-block--${variant}${flash ? " is-flash" : ""}`}>
    <div className="price">
      <strong className="price-badge"><bdi dir="ltr">{money(current, currency, lang)}</bdi></strong>
      {compareAt !== null && <del><bdi dir="ltr">{money(compareAt, currency, lang)}</bdi></del>}
      {variant === "detail" && savings !== null && <span className="detail-flash-save-pill">
        {flash && <Zap size={12} aria-hidden="true" />}<bdi dir="ltr">{formatSavings(savings, lang)}</bdi>
      </span>}
    </div>
    {flash && <FlashSaleCountdownPill endsAt={product.flash_sale_ends_at} lang={lang}
      size={variant === "detail" ? "md" : "sm"} showLabel={variant === "detail"} />}
  </div>;
}
