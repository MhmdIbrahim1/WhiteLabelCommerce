"use client";

import { Truck, PartyPopper } from "lucide-react";
import { money } from "@/lib/brand";
import { useLanguage } from "@/components/language-provider";

export function CartIncentiveBar({
  enabled,
  threshold,
  subtotal,
  currency,
}: {
  enabled: boolean;
  threshold: number;
  subtotal: number;
  currency: string;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";

  if (!enabled || !Number.isFinite(threshold) || threshold <= 0) {
    return null;
  }

  const remaining = Math.max(0, threshold - subtotal);
  const unlocked = remaining <= 0;
  const pct = Math.min(100, Math.max(0, Math.round((subtotal / threshold) * 100)));

  return (
    <div
      className={`cart-incentive-bar ${unlocked ? "is-unlocked" : ""}`}
      role="status"
      aria-live="polite"
      data-unlocked={unlocked ? "true" : "false"}
    >
      <div className="cart-incentive-head">
        <span className="cart-incentive-icon" aria-hidden="true">
          {unlocked ? <PartyPopper size={18} /> : <Truck size={18} />}
        </span>
        <p className="cart-incentive-text">
          {unlocked
            ? isEn
              ? "Congrats! You unlocked Free Shipping"
              : "مبروك! حصلت على شحن مجاني على طلبك"
            : isEn
              ? `Add ${money(remaining, currency, "en")} more to unlock Free Shipping`
              : `أضف منتجات بقيمة ${money(remaining, currency, "ar")} إضافية للحصول على شحن مجاني`}
        </p>
        <span className="cart-incentive-pct" dir="ltr">
          {pct}%
        </span>
      </div>
      <div className="cart-incentive-track" aria-hidden="true">
        <div
          className="cart-incentive-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
