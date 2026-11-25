import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverDb } from "@/lib/db";
import { ADMIN_STORE_COOKIE, getManagedStores } from "@/lib/tenant";
import { runRecoveryAutomations } from "@/lib/notifications/events";

function isValidCronSecret(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  const hashA = createHash("sha256").update(authHeader, "utf8").digest();
  const hashB = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

// Scheduled cron invocation (scans all active stores; requires constant-time CRON_SECRET)
export async function GET(req: Request) {
  if (!isValidCronSecret(req)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const summary = await runRecoveryAutomations();
  return Response.json(
    { ok: true, scope: "all_active_stores", ...summary },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

// Cron or manual merchant admin trigger (manual triggers require POST and scope to activeAdminStoreId)
export async function POST(req: Request) {
  if (isValidCronSecret(req)) {
    const summary = await runRecoveryAutomations();
    return Response.json(
      { ok: true, scope: "all_active_stores", ...summary },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const [db, jar] = await Promise.all([serverDb(), cookies()]);
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const managedStores = await getManagedStores(db);
  if (managedStores.length === 0) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cookieStoreId = jar.get(ADMIN_STORE_COOKIE)?.value?.trim() || "";
  const activeAdminStoreId =
    managedStores.find((m) => m.store_id === cookieStoreId)?.store_id ??
    managedStores[0].store_id;

  const summary = await runRecoveryAutomations(activeAdminStoreId);
  return Response.json(
    { ok: true, storeId: activeAdminStoreId, ...summary },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
