"use client";

import { useEffect } from "react";
import { trackViewContent } from "@/lib/analytics";

export function ProductViewTracker({
  id,
  name,
  price,
  currency = "EGP",
}: {
  id: string;
  name: string;
  price: number;
  currency?: string;
}) {
  useEffect(() => {
    trackViewContent({ id, name, price, currency });
  }, [id, name, price, currency]);

  return null;
}
