import { serverDb } from "@/lib/db";
import { adminUser } from "@/lib/access";
import { settings } from "@/lib/shop";
import { UUID_RE } from "@/lib/paymob";

export type InboxNotificationRow = {
  id: string;
  user_id: string | null;
  target_role: "customer" | "admin";
  category: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  deep_link: string;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
};

const SELECT_FIELDS =
  "id,user_id,target_role,category,title_ar,title_en,body_ar,body_en,deep_link,is_read,read_at,created_at";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "admin" ? "admin" : "customer";
  const [db, store] = await Promise.all([serverDb(), settings()]);
  const [{ data: authData }, admin] = await Promise.all([
    db.auth.getUser(),
    adminUser(db),
  ]);
  const user = authData.user;

  if (scope === "admin") {
    if (!admin) {
      return Response.json({ items: [], unreadCount: 0 }, { status: 401 });
    }
    const { data, error } = await db
      .from("notifications")
      .select(SELECT_FIELDS)
      .eq("store_id", store.storeId)
      .eq("target_role", "admin")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return Response.json({ items: [], unreadCount: 0 }, { status: 200 });
    }
    const items = ((data ?? []) as unknown as InboxNotificationRow[]).map((n) => ({
      ...n,
      is_read: Boolean(n.is_read || n.read_at),
    }));
    return Response.json(
      { items, unreadCount: items.filter((n) => !n.is_read).length },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  let q = db
    .from("notifications")
    .select(SELECT_FIELDS)
    .eq("store_id", store.storeId)
    .eq("target_role", "customer")
    .order("created_at", { ascending: false })
    .limit(30);

  if (user) {
    q = q.or(`user_id.eq.${user.id},user_id.is.null`);
  } else {
    q = q.is("user_id", null).eq("category", "promo_campaign");
  }

  const { data, error } = await q;
  if (error) {
    return Response.json({ items: [], unreadCount: 0 }, { status: 200 });
  }
  const items = ((data ?? []) as unknown as InboxNotificationRow[]).map((n) => ({
    ...n,
    is_read: Boolean(n.is_read || n.read_at),
  }));
  return Response.json(
    {
      items,
      unreadCount: items.filter((n) => !n.is_read).length,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(req: Request) {
  let body: {
    id?: unknown;
    ids?: unknown;
    mark_all?: unknown;
    markAll?: unknown;
    scope?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const [db, store] = await Promise.all([serverDb(), settings()]);
  const markAllRequested = body.mark_all === true || body.markAll === true;

  if (markAllRequested) {
    const { data, error } = await db.rpc("mark_notifications_read", {
      p_store_id: store.storeId,
      p_notification_ids: null,
      p_mark_all: true,
    });
    if (error) {
      return Response.json(
        { error: "Failed to mark notifications read." },
        { status: 500 },
      );
    }
    return Response.json(
      { ok: true, updatedCount: Number(data ?? 0) },
      { status: 200 },
    );
  }

  const rawIds: string[] = [];
  if (typeof body.id === "string" && UUID_RE.test(body.id.trim())) {
    rawIds.push(body.id.trim());
  }
  if (Array.isArray(body.ids)) {
    for (const item of body.ids) {
      if (typeof item === "string" && UUID_RE.test(item.trim())) {
        rawIds.push(item.trim());
      }
    }
  }
  const uniqueIds = Array.from(new Set(rawIds));
  if (uniqueIds.length === 0) {
    return Response.json({ error: "Invalid notification id." }, { status: 400 });
  }

  const { data, error } = await db.rpc("mark_notifications_read", {
    p_store_id: store.storeId,
    p_notification_ids: uniqueIds,
    p_mark_all: false,
  });

  if (error) {
    return Response.json(
      { error: "Failed to mark notification read." },
      { status: 500 },
    );
  }

  return Response.json(
    { ok: true, updatedCount: Number(data ?? 0) },
    { status: 200 },
  );
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "admin" ? "admin" : "customer";
  const clearAll = searchParams.get("clearAll") === "true";
  const id = searchParams.get("id")?.trim() ?? "";

  if (!clearAll && !UUID_RE.test(id)) {
    return Response.json(
      { error: "Provide a valid id or clearAll=true." },
      { status: 400 },
    );
  }

  const [db, store] = await Promise.all([serverDb(), settings()]);
  const [{ data: authData }, admin] = await Promise.all([
    db.auth.getUser(),
    adminUser(db),
  ]);
  const user = authData.user;

  if (!user) {
    return Response.json({ ok: true, deletedCount: 0 }, { status: 200 });
  }

  const isAdminScope = scope === "admin" && Boolean(admin);

  if (clearAll) {
    let q = db
      .from("notifications")
      .delete()
      .eq("store_id", store.storeId);

    if (isAdminScope) {
      q = q.eq("target_role", "admin");
    } else {
      q = q.eq("user_id", user.id);
    }

    const { data, error } = await q.select("id");
    if (error) {
      return Response.json(
        { error: "Failed to clear notifications." },
        { status: 500 },
      );
    }
    return Response.json(
      { ok: true, deletedCount: (data ?? []).length },
      { status: 200 },
    );
  }

  let q = db
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("store_id", store.storeId);

  if (!isAdminScope) {
    q = q.eq("user_id", user.id);
  }

  const { data, error } = await q.select("id");
  if (error) {
    return Response.json(
      { error: "Failed to delete notification." },
      { status: 500 },
    );
  }

  return Response.json(
    { ok: true, deletedCount: (data ?? []).length },
    { status: 200 },
  );
}
