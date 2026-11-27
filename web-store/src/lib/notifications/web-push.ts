"use client";

import { cartScope } from "@/lib/cart-session";
import { getGuestSessionId } from "@/components/shop/cart-store";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getFirebaseWebConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();

  if (!apiKey || !projectId || !messagingSenderId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || `${projectId}.firebasestorage.app`,
    messagingSenderId,
    appId,
  };
}

/**
 * Registers the service worker and obtains an FCM Web Push token (via Firebase Web SDK
 * when full config is present, falling back to PushManager subscription JSON if needed),
 * then persists it via POST /api/notifications/register.
 */
export async function syncWebPushSubscription(
  lang: "ar" | "en",
  storeId: string, userId: string, signal: AbortSignal,
): Promise<{ ok: boolean; reason?: "unavailable" | "failed" }> {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    Notification.permission !== "granted"
  ) {
    return { ok: false, reason: "unavailable" };
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  if (!vapidKey) {
    return { ok: false, reason: "unavailable" };
  }

  try {
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );
    await navigator.serviceWorker.ready;

    let token = "";
    const fbConfig = getFirebaseWebConfig();
    if (fbConfig) {
      try {
        const [{ getApps, initializeApp }, { getMessaging, getToken, isSupported }] =
          await Promise.all([
            import("firebase/app"),
            import("firebase/messaging"),
          ]);
        if (await isSupported()) {
          const app =
            getApps().length > 0 ? getApps()[0] : initializeApp(fbConfig);
          const messaging = getMessaging(app);
          const fcmToken = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration,
          });
          if (fcmToken && fcmToken.trim().length >= 16) {
            token = fcmToken.trim();
          }
        }
      } catch {
        // Fall back to standard PushManager subscription below
      }
    }

    if (!token && "pushManager" in registration) {
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));
      token = JSON.stringify(subscription.toJSON());
    }

    if (!token || token.length < 16) {
      return { ok: false, reason: "failed" };
    }

    if (signal.aborted) return { ok: false, reason: "unavailable" };
    const res = await fetch("/api/notifications/register", {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "web",
        token,
        locale: lang,
        guest_session_id: getGuestSessionId(cartScope(storeId, userId)),
      }),
    });

    return { ok: res.ok, reason: res.ok ? undefined : "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
