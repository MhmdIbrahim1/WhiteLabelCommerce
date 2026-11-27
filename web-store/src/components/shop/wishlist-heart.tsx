"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useWishlist } from "./wishlist-provider";

export function WishlistHeartButton({
  productId,
  variant = "card",
  onAfterToggle,
}: {
  productId: string;
  variant?: "card" | "pill";
  onAfterToggle?: (saved: boolean) => void;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const { isWishlisted, isPending, toggle } = useWishlist();
  const [popping, setPopping] = useState(false);

  const saved = isWishlisted(productId);
  const busy = isPending(productId);

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setPopping(true);
    setTimeout(() => setPopping(false), 380);
    const result = await toggle(productId);
    if (result.ok) onAfterToggle?.(result.in_wishlist);
  }

  const label = saved
    ? isEn
      ? "Remove from wishlist"
      : "إزالة من المفضلة"
    : isEn
      ? "Save to wishlist"
      : "إضافة إلى المفضلة";

  if (variant === "pill") {
    return (
      <button
        type="button"
        className={`wishlist-pill-btn ${saved ? "is-saved" : ""} ${popping ? "is-popping" : ""}`}
        aria-label={label}
        aria-pressed={saved}
        disabled={busy}
        onClick={(e) => void handleClick(e)}
      >
        <Heart
          size={17}
          fill={saved ? "#E11D48" : "none"}
          stroke={saved ? "#E11D48" : "currentColor"}
          strokeWidth={2}
        />
        <span>
          {saved
            ? isEn
              ? "Saved in Wishlist"
              : "في المفضلة"
            : isEn
              ? "Save to Wishlist"
              : "أضف للمفضلة"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`wishlist-heart-btn ${saved ? "is-saved" : ""} ${popping ? "is-popping" : ""}`}
      aria-label={label}
      aria-pressed={saved}
      disabled={busy}
      onClick={(e) => void handleClick(e)}
    >
      <Heart
        size={17}
        fill={saved ? "#E11D48" : "none"}
        stroke={saved ? "#E11D48" : "currentColor"}
        strokeWidth={2}
      />
    </button>
  );
}
