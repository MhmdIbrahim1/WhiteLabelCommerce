"use client";

import { useEffect, useState } from "react";
import { nextSaleBoundary, type FlashSalePriceInput } from "@/lib/flash-sale";

// Prices only change at the start/end of a sale. The countdown owns its one-second timer.
export function useSaleClock(products: readonly Pick<FlashSalePriceInput, "flash_sale_starts_at" | "flash_sale_ends_at">[], initialNow?: number) {
  const [now, setNow] = useState(() => initialNow ?? Date.now());
  const boundary = nextSaleBoundary(products, now);
  useEffect(() => {
    if (!Number.isFinite(boundary)) return;
    const sync = () => setNow(Date.now());
    const timer = window.setTimeout(sync, Math.min(2_147_000_000, Math.max(0, boundary - Date.now())));
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [boundary, now]);
  return now;
}
