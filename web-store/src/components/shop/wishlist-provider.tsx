"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { showToast } from "@/components/floating-toast";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { toggleWishlistAction } from "@/app/(shop)/wishlist/actions";
import { persistWishlistChange, type WishlistToggleResult } from "@/lib/reviews-wishlist";

type WishlistContextValue = {
  isSignedIn: boolean;
  count: number;
  isWishlisted: (productId: string) => boolean;
  isPending: (productId: string) => boolean;
  toggle: (productId: string, operation?: "toggle" | "remove") => Promise<WishlistToggleResult>;
};

const WishlistContext = createContext<WishlistContextValue>({
  isSignedIn: false,
  count: 0,
  isWishlisted: () => false,
  isPending: () => false,
  toggle: async () => ({ ok: false, error: "auth_required" }),
});

export function WishlistProvider({
  storeId,
  initialProductIds,
  isSignedIn,
  children,
}: {
  storeId: string;
  initialProductIds: string[];
  isSignedIn: boolean;
  children: React.ReactNode;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const pathname = usePathname();
  const [ids, setIds] = useState<Set<string>>(() => new Set(initialProductIds));
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(new Set<string>());
  const syncKey = `${storeId}:${isSignedIn ? "1" : "0"}:${initialProductIds.join(",")}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    setIds(new Set(initialProductIds));
  }

  const showGuestToast = useCallback(() => {
    showToast({ kind: "info", message: isEn ? "Sign in to save items to your wishlist." : "سجّل الدخول لحفظ المنتجات في المفضلة.",
      action: { label: isEn ? "Sign In" : "تسجيل الدخول", href: "/login?next=" + encodeURIComponent(pathname || "/") } });
  }, [isEn, pathname]);

  const toggle = useCallback(
    async (productId: string, operation: "toggle" | "remove" = "toggle"): Promise<WishlistToggleResult> => {
      if (!isSignedIn) {
        showGuestToast();
        return { ok: false, requiresAuth: true, error: "auth_required" };
      }
      if (inFlight.current.has(productId)) return { ok: false, error: "pending" };

      const wasSaved = ids.has(productId);
      inFlight.current.add(productId);
      setPendingIds(new Set(inFlight.current));
      try {
        const display = (saved: boolean) => setIds(prev => {
          const next = new Set(prev);
          if (saved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        const result = await persistWishlistChange(wasSaved, operation === "remove" ? false : !wasSaved,
          display, () => toggleWishlistAction(productId, operation));
        if (!result.ok && result.requiresAuth) showGuestToast();
        return result;
      } finally {
        inFlight.current.delete(productId);
        setPendingIds(new Set(inFlight.current));
      }
    },
    [ids, isSignedIn, showGuestToast],
  );

  const value = useMemo<WishlistContextValue>(
    () => ({
      isSignedIn,
      count: ids.size,
      isWishlisted: (productId: string) => ids.has(productId),
      isPending: (productId: string) => pendingIds.has(productId),
      toggle,
    }),
    [ids, isSignedIn, pendingIds, toggle],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  return useContext(WishlistContext);
}
