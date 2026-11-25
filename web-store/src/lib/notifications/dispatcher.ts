import { createSign } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";

export type NotificationCategory =
  | "order_update"
  | "payment_recovery"
  | "abandoned_cart"
  | "back_in_stock"
  | "promo_campaign"
  | "admin_alert";

export type NotificationTargetRole = "customer" | "admin";

export type DispatchNotificationInput = {
  storeId: string;
  userId?: string | null;
  targetRole?: NotificationTargetRole;
  category: NotificationCategory;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  deepLink?: string;
  data?: Record<string, string | number | boolean | null>;
  dedupeKey?: string | null;
  phone?: string | null;
  explicitTokens?: { token: string; platform: "android" | "web"; locale: "ar" | "en" }[];
  bypassQuietHours?: boolean;
};

export type DispatchResult = {
  notificationId: string | null;
  deduped: boolean;
  pushAttempted: number;
  pushDelivered: number;
  suppressedByQuietHours: boolean;
};

type PushSubRow = {
  id: string;
  token: string;
  platform: "android" | "web";
  locale: "ar" | "en";
  user_id: string | null;
};

type PrefRow = {
  user_id: string;
  order_updates: boolean;
  promotions: boolean;
  restock_alerts: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

const NON_URGENT_CATEGORIES = new Set<NotificationCategory>([
  "promo_campaign",
  "abandoned_cart",
]);

let cachedAccessToken: { token: string; expiresAt: number } | null = null;
let warnedMissingFirebase = false;

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getFirebaseCredentials(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!projectId || !clientEmail || !rawPrivateKey) {
    if (!warnedMissingFirebase) {
      warnedMissingFirebase = true;
      console.warn(
        "[notifications] Firebase Admin env vars not configured; storing in-app notifications only.",
      );
    }
    return null;
  }
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

async function getFcmAccessToken(): Promise<{
  projectId: string;
  accessToken: string;
} | null> {
  const creds = getFirebaseCredentials();
  if (!creds) return null;

  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return { projectId: creds.projectId, accessToken: cachedAccessToken.token };
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64Url(
    JSON.stringify({
      iss: creds.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claimSet}`);
  const signature = base64Url(signer.sign(creds.privateKey));
  const assertion = `${header}.${claimSet}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("[notifications] OAuth2 token exchange failed", {
      status: res.status,
    });
    return null;
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3500) * 1000,
  };
  return { projectId: creds.projectId, accessToken: data.access_token };
}

function parseMinutes(hhmm: string, fallback: number): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Checks whether the current local time in Africa/Cairo falls within quiet hours
 * (defaults to 23:00 -> 09:00, supporting overnight wrap-around ranges).
 */
export function isWithinCairoQuietHours(
  startHHMM = "23:00",
  endHHMM = "09:00",
  now: Date = new Date(),
): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const currentMin = (hour % 24) * 60 + minute;
  const startMin = parseMinutes(startHHMM, 23 * 60);
  const endMin = parseMinutes(endHHMM, 9 * 60);

  if (startMin === endMin) return false;
  if (startMin > endMin) {
    // Overnight window, e.g. 23:00 -> 09:00
    return currentMin >= startMin || currentMin < endMin;
  }
  return currentMin >= startMin && currentMin < endMin;
}

function categoryAllowedByPrefs(
  category: NotificationCategory,
  pref: PrefRow | null,
): boolean {
  if (!pref) return true;
  if (category === "order_update" || category === "payment_recovery") {
    return pref.order_updates;
  }
  if (category === "promo_campaign" || category === "abandoned_cart") {
    return pref.promotions;
  }
  if (category === "back_in_stock") {
    return pref.restock_alerts;
  }
  return true;
}

function androidChannelFor(category: NotificationCategory): string {
  return category === "promo_campaign" || category === "abandoned_cart"
    ? "promotions_channel"
    : "orders_channel";
}

function stringifyDataPayload(
  deepLink: string,
  category: NotificationCategory,
  notificationId: string,
  extra?: Record<string, string | number | boolean | null>,
): Record<string, string> {
  const out: Record<string, string> = {
    notification_id: notificationId,
    category,
    deep_link: deepLink,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== null && v !== undefined) {
        out[k] = String(v);
      }
    }
  }
  return out;
}

async function sendSingleFcmMessage(params: {
  projectId: string;
  accessToken: string;
  token: string;
  platform: "android" | "web";
  title: string;
  body: string;
  deepLink: string;
  category: NotificationCategory;
  data: Record<string, string>;
}): Promise<{ ok: boolean; invalidToken: boolean }> {
  const channelId = androidChannelFor(params.category);
  const message: Record<string, unknown> = {
    token: params.token,
    notification: {
      title: params.title,
      body: params.body,
    },
    data: {
      ...params.data,
      title: params.title,
      body: params.body,
      channel_id: channelId,
    },
  };

  if (params.platform === "android") {
    message.android = {
      priority: "HIGH",
      notification: {
        channel_id: channelId,
        sound: "default",
      },
    };
  } else {
    const notifId = params.data.notification_id;
    const webLink = notifId
      ? `${params.deepLink}${params.deepLink.includes("?") ? "&" : "?"}notif_id=${encodeURIComponent(notifId)}`
      : params.deepLink;
    message.webpush = {
      headers: { Urgency: "high" },
      notification: {
        title: params.title,
        body: params.body,
        icon: "/favicon.ico",
      },
      fcm_options: {
        link: webLink,
      },
    };
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(params.projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
      cache: "no-store",
    },
  );

  if (res.ok) {
    return { ok: true, invalidToken: false };
  }

  const errText = await res.text().catch(() => "");
  const invalidToken =
    res.status === 404 ||
    errText.includes("UNREGISTERED") ||
    errText.includes("registration-token-not-registered") ||
    (res.status === 400 && errText.includes("not a valid FCM registration token"));

  return { ok: false, invalidToken };
}

/**
 * Inserts a deduplicated bilingual notification into public.notifications and
 * dispatches localized FCM HTTP v1 / Web Push notifications to matching active tokens.
 */
export async function dispatchNotification(
  input: DispatchNotificationInput,
): Promise<DispatchResult> {
  const db = adminDb();
  const targetRole = input.targetRole ?? "customer";
  const deepLink = input.deepLink || "/";

  // 1. Deduplication check
  if (input.dedupeKey) {
    const { data: existing } = await db
      .from("notifications")
      .select("id")
      .eq("dedupe_key", input.dedupeKey)
      .maybeSingle<{ id: string }>();
    if (existing) {
      return {
        notificationId: existing.id,
        deduped: true,
        pushAttempted: 0,
        pushDelivered: 0,
        suppressedByQuietHours: false,
      };
    }
  }

  // 2. Check user preferences & Cairo Quiet Hours for non-urgent notifications
  let pref: PrefRow | null = null;
  if (input.userId) {
    const { data } = await db
      .from("notification_preferences")
      .select(
        "user_id,order_updates,promotions,restock_alerts,quiet_hours_start,quiet_hours_end",
      )
      .eq("user_id", input.userId)
      .eq("store_id", input.storeId)
      .maybeSingle<PrefRow>();
    pref = data;
  }

  if (!categoryAllowedByPrefs(input.category, pref)) {
    return {
      notificationId: null,
      deduped: false,
      pushAttempted: 0,
      pushDelivered: 0,
      suppressedByQuietHours: false,
    };
  }

  const quietHoursActive =
    !input.bypassQuietHours &&
    NON_URGENT_CATEGORIES.has(input.category) &&
    isWithinCairoQuietHours(
      pref?.quiet_hours_start ?? "23:00",
      pref?.quiet_hours_end ?? "09:00",
    );

  // 3. Insert into public.notifications (triggers Supabase Realtime immediately)
  const insertRes = await db
    .from("notifications")
    .insert({
      store_id: input.storeId,
      user_id: input.userId ?? null,
      target_role: targetRole,
      category: input.category,
      title_ar: input.titleAr,
      title_en: input.titleEn,
      body_ar: input.bodyAr,
      body_en: input.bodyEn,
      deep_link: deepLink,
      data: input.data ?? {},
      dedupe_key: input.dedupeKey ?? null,
      is_read: false,
      sent_push: false,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertRes.error) {
    // Handle concurrent race on unique dedupe_key gracefully
    if (insertRes.error.code === "23505") {
      return {
        notificationId: null,
        deduped: true,
        pushAttempted: 0,
        pushDelivered: 0,
        suppressedByQuietHours: false,
      };
    }
    throw new Error(`notification_insert_failed: ${insertRes.error.message}`);
  }

  const notificationId = insertRes.data.id;

  if (quietHoursActive) {
    return {
      notificationId,
      deduped: false,
      pushAttempted: 0,
      pushDelivered: 0,
      suppressedByQuietHours: true,
    };
  }

  // 4. Resolve target push tokens
  const targets = new Map<
    string,
    { id?: string; token: string; platform: "android" | "web"; locale: "ar" | "en" }
  >();

  if (input.explicitTokens?.length) {
    for (const t of input.explicitTokens) {
      if (t.token) targets.set(t.token, t);
    }
  }

  if (input.userId) {
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("id,token,platform,locale,user_id")
      .eq("store_id", input.storeId)
      .eq("user_id", input.userId)
      .eq("is_active", true);
    for (const s of (subs ?? []) as PushSubRow[]) {
      targets.set(s.token, {
        id: s.id,
        token: s.token,
        platform: s.platform,
        locale: s.locale,
      });
    }
  }

  if (targets.size === 0) {
    return {
      notificationId,
      deduped: false,
      pushAttempted: 0,
      pushDelivered: 0,
      suppressedByQuietHours: false,
    };
  }

  // 5. Send via FCM HTTP v1 (auto-deactivating invalid tokens)
  const fcmAuth = await getFcmAccessToken();
  if (!fcmAuth) {
    return {
      notificationId,
      deduped: false,
      pushAttempted: 0,
      pushDelivered: 0,
      suppressedByQuietHours: false,
    };
  }

  const dataPayload = stringifyDataPayload(
    deepLink,
    input.category,
    notificationId,
    input.data,
  );

  let pushAttempted = 0;
  let pushDelivered = 0;
  const invalidTokens: string[] = [];

  for (const target of targets.values()) {
    pushAttempted += 1;
    const isEn = target.locale === "en";
    const outcome = await sendSingleFcmMessage({
      projectId: fcmAuth.projectId,
      accessToken: fcmAuth.accessToken,
      token: target.token,
      platform: target.platform,
      title: isEn ? input.titleEn : input.titleAr,
      body: isEn ? input.bodyEn : input.bodyAr,
      deepLink,
      category: input.category,
      data: dataPayload,
    });
    if (outcome.ok) {
      pushDelivered += 1;
    } else if (outcome.invalidToken) {
      invalidTokens.push(target.token);
    }
  }

  if (invalidTokens.length > 0) {
    await db
      .from("push_subscriptions")
      .update({ is_active: false })
      .eq("store_id", input.storeId)
      .in("token", invalidTokens);
  }

  if (pushDelivered > 0) {
    await db
      .from("notifications")
      .update({ sent_push: true })
      .eq("id", notificationId);
  }

  return {
    notificationId,
    deduped: false,
    pushAttempted,
    pushDelivered,
    suppressedByQuietHours: false,
  };
}

/**
 * Helper to alert all store admins for a specific store_id.
 */
export async function notifyStoreAdmins(params: {
  storeId: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  deepLink: string;
  dedupeKey?: string;
  data?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const db = adminDb();
  const [memberRes, profileRes] = await Promise.all([
    db
      .from("store_members")
      .select("user_id")
      .eq("store_id", params.storeId)
      .in("role", ["owner", "admin"]),
    db
      .from("profiles")
      .select("id")
      .eq("store_id", params.storeId)
      .eq("role", "admin"),
  ]);

  const adminIds = Array.from(
    new Set([
      ...((memberRes.data ?? []) as { user_id: string }[]).map((m) => m.user_id),
      ...((profileRes.data ?? []) as { id: string }[]).map((a) => a.id),
    ]),
  );
  if (adminIds.length === 0) {
    await dispatchNotification({
      storeId: params.storeId,
      userId: null,
      targetRole: "admin",
      category: "admin_alert",
      titleAr: params.titleAr,
      titleEn: params.titleEn,
      bodyAr: params.bodyAr,
      bodyEn: params.bodyEn,
      deepLink: params.deepLink,
      dedupeKey: params.dedupeKey,
      data: params.data,
      bypassQuietHours: true,
    });
    return;
  }

  await Promise.all(
    adminIds.map((adminId) =>
      dispatchNotification({
        storeId: params.storeId,
        userId: adminId,
        targetRole: "admin",
        category: "admin_alert",
        titleAr: params.titleAr,
        titleEn: params.titleEn,
        bodyAr: params.bodyAr,
        bodyEn: params.bodyEn,
        deepLink: params.deepLink,
        dedupeKey: params.dedupeKey ? `${params.dedupeKey}:${adminId}` : undefined,
        data: params.data,
        bypassQuietHours: true,
      }),
    ),
  );
}
