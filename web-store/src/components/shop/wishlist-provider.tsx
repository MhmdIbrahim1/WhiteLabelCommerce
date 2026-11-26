"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { showToast } from "@/components/floating-toast";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { toggleWishlistAction } from "@/app/(shop)/wishlist/actions";

type WishlistContextValue = {
  isSignedIn: boolean;
  count: number;
  isWishlisted: (productId: string) => boolean;
  isPending: (productId: string) => boolean;
  toggle: (productId: string) => Promise<boolean>;
};

const WishlistContext = createContext<WishlistContextValue>({
  isSignedIn: false,
  count: 0,
  isWishlisted: () => false,
  isPending: () => false,
  toggle: async () => false,
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
    async (productId: string): Promise<boolean> => {
      if (!isSignedIn) {
        showGuestToast();
        return false;
      }
      if (pendingIds.has(productId)) {
        return ids.has(productId);
      }

      const wasSaved = ids.has(productId);
      // Optimistic update
      setIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(productId);
        else next.add(productId);
        return next;
      });
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(productId);
        return next;
      });

      try {
        const res = await toggleWishlistAction(productId);
        if (!res.ok) {
          // Revert optimistic change
          setIds((prev) => {
            const next = new Set(prev);
            if (wasSaved) next.add(productId);
            else next.delete(productId);
            return next;
          });
          if (res.requiresAuth) {
            showGuestToast();
          }
          return wasSaved;
        }
        const serverSaved = Boolean(res.in_wishlist);
        setIds((prev) => {
          const next = new Set(prev);
          if (serverSaved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        return serverSaved;
      } catch {
        setIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        return wasSaved;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [ids, isSignedIn, pendingIds, showGuestToast],
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
