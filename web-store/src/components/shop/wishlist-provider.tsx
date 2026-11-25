"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, LogIn, X } from "lucide-react";
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
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncKey = `${storeId}:${isSignedIn ? "1" : "0"}:${initialProductIds.join(",")}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    setIds(new Set(initialProductIds));
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showGuestToast = useCallback(() => {
    setGuestPromptOpen(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setGuestPromptOpen(false);
    }, 5200);
  }, []);

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

  const loginHref = `/login?next=${encodeURIComponent(pathname || "/")}`;

  return (
    <WishlistContext.Provider value={value}>
      {children}
      {guestPromptOpen && (
        <div
          className="wishlist-guest-toast"
          role="status"
          aria-live="polite"
          dir={isEn ? "ltr" : "rtl"}
        >
          <span className="wishlist-guest-toast-icon" aria-hidden="true">
            <Heart size={16} />
          </span>
          <span className="wishlist-guest-toast-copy">
            {isEn
              ? "Sign in to save items to your cloud wishlist across web & app."
              : "سجّل الدخول لحفظ المنتجات في قائمة مفضلتك السحابية عبر الموقع والتطبيق."}
          </span>
          <Link
            href={loginHref}
            className="wishlist-guest-toast-cta"
            onClick={() => setGuestPromptOpen(false)}
          >
            <LogIn size={14} />
            <span>{isEn ? "Sign In" : "تسجيل الدخول"}</span>
          </Link>
          <button
            type="button"
            className="icon-ghost-btn wishlist-guest-toast-close"
            aria-label={isEn ? "Dismiss" : "إغلاق"}
            onClick={() => setGuestPromptOpen(false)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
