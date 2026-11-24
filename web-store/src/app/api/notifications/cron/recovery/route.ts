import { serverDb } from "@/lib/db";
import { adminUser } from "@/lib/access";
import { settings } from "@/lib/shop";
import { runRecoveryAutomations } from "@/lib/notifications/events";

async function authorizeCron(req: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get("authorization") ?? "";
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  const db = await serverDb();
  const admin = await adminUser(db);
  return Boolean(admin);
}

async function handleRecovery(req: Request) {
  const allowed = await authorizeCron(req);
  if (!allowed) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await settings();
  const summary = await runRecoveryAutomations(store.storeId);
  return Response.json(
    { ok: true, ...summary },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  return handleRecovery(req);
}

export async function POST(req: Request) {
  return handleRecovery(req);
}
