"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { browserDb } from "@/lib/supabase/browser";
import { clearCartSessionStorage } from "@/lib/cart-session";
import { endSessionAction, logout } from "@/app/login/actions";
import { showToast } from "./floating-toast";
import { useLanguage } from "./language-provider";

const sessionChangeKey = "wlc.auth.change";
export const cartSessionEnded = "wlc:cart-session-ended";

export function announceSessionChange() {
  try { localStorage.setItem(sessionChangeKey, crypto.randomUUID()); } catch { /* Storage is optional. */ }
}

type Identity = { userId: string | null; end: (form: FormData) => Promise<boolean> };
const SessionContext = createContext<Identity | null>(null);
export const useSessionUser = () => useContext(SessionContext)?.userId ?? null;

export function AuthSessionProvider({ initialUser, children }: { initialUser: string | null; children: ReactNode }) {
  const router = useRouter();
  const en = useLanguage().lang === "en";
  const [userId, setUserId] = useState(initialUser);
  const current = useRef(initialUser);
  const signingOut = useRef(false);
  const serverIdentity = useRef(initialUser);
  const update = useCallback((id: string | null, refresh: boolean) => {
    if (id === current.current) return;
    const previous = current.current;
    current.current = id;
    if (previous) {
      if (!signingOut.current) clearCartSessionStorage(previous);
      window.dispatchEvent(new CustomEvent(cartSessionEnded, { detail: previous }));
    }
    setUserId(id);
    if (refresh) router.refresh();
  }, [router]);

  useEffect(() => {
    if (serverIdentity.current !== initialUser && !signingOut.current) update(initialUser, false);
    serverIdentity.current = initialUser;
  }, [initialUser, update]);
  useEffect(() => {
    const { data } = browserDb().auth.onAuthStateChange((_event, session) => {
      if (!signingOut.current) update(session?.user.id ?? null, true);
    });
    const reload = (e: StorageEvent) => {
      if (e.key === sessionChangeKey && !signingOut.current) {
        update(null, false);
        window.location.reload();
      }
    };
    window.addEventListener("storage", reload);
    return () => { data.subscription.unsubscribe(); window.removeEventListener("storage", reload); };
  }, [update]);

  async function end(form: FormData) {
    if (signingOut.current) return false;
    signingOut.current = true;
    const previous = current.current;
    update(null, false);
    try {
      const result = await endSessionAction(form);
      if (!result.ok) throw new Error();
      if (previous) clearCartSessionStorage(previous);
      announceSessionChange();
      window.location.replace(result.redirectTo);
      return true;
    } catch {
      signingOut.current = false;
      update(previous, true);
      showToast({ kind: "error", message: en ? "Sign out failed. Please try again." : "تعذّر تسجيل الخروج. حاول مجدداً." });
      return false;
    }
  }
  return <SessionContext.Provider value={{ userId, end }}>{children}</SessionContext.Provider>;
}

export function LogoutForm({ children, registerNext, storeLoginNext }: { children: ReactNode; registerNext?: string; storeLoginNext?: string }) {
  const session = useContext(SessionContext);
  const [busy, setBusy] = useState(false);
  return <form className="session-logout" action={logout} onSubmit={event => {
    if (!session) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    void session.end(new FormData(event.currentTarget)).then(ok => { if (!ok) setBusy(false); });
  }}>
    {registerNext && <><input type="hidden" name="switchAccount" value="1" /><input type="hidden" name="next" value={registerNext} /></>}
    {storeLoginNext !== undefined && <><input type="hidden" name="storeLogin" value="1" /><input type="hidden" name="next" value={storeLoginNext} /></>}
    <button type="submit" disabled={busy}>{children}</button>
  </form>;
}
