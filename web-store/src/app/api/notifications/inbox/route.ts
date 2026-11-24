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
  created_at: string;
};

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
      .select(
        "id,user_id,target_role,category,title_ar,title_en,body_ar,body_en,deep_link,is_read,created_at",
      )
      .eq("store_id", store.storeId)
      .eq("target_role", "admin")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return Response.json({ items: [], unreadCount: 0 }, { status: 200 });
    }
    const items = (data ?? []) as InboxNotificationRow[];
    return Response.json(
      { items, unreadCount: items.filter((n) => !n.is_read).length },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  let query = db
    .from("notifications")
    .select(
      "id,user_id,target_role,category,title_ar,title_en,body_ar,body_en,deep_link,is_read,created_at",
    )
    .eq("store_id", store.storeId)
    .eq("target_role", "customer")
    .order("created_at", { ascending: false })
    .limit(30);

  if (user) {
    query = query.or(`user_id.eq.${user.id},user_id.is.null`);
  } else {
    query = query.is("user_id", null).eq("category", "promo_campaign");
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ items: [], unreadCount: 0 }, { status: 200 });
  }
  const items = (data ?? []) as InboxNotificationRow[];
  return Response.json(
    {
      items,
      unreadCount: user ? items.filter((n) => !n.is_read).length : 0,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(req: Request) {
  let body: { id?: unknown; mark_all?: unknown; scope?: unknown };
  try {
    body = (await req.json()) as {
      id?: unknown;
      mark_all?: unknown;
      scope?: unknown;
    };
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const [db, store] = await Promise.all([serverDb(), settings()]);
  const [{ data: authData }, admin] = await Promise.all([
    db.auth.getUser(),
    adminUser(db),
  ]);
  const user = authData.user;
  if (!user) {
    return Response.json({ ok: true }, { status: 200 });
  }

  const isAdminScope = body.scope === "admin" && Boolean(admin);

  if (body.mark_all === true) {
    let q = db
      .from("notifications")
      .update({ is_read: true })
      .eq("store_id", store.storeId)
      .eq("is_read", false);
    if (isAdminScope) {
      q = q.eq("target_role", "admin");
    } else {
      q = q.eq("user_id", user.id);
    }
    await q;
    return Response.json({ ok: true }, { status: 200 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid notification id." }, { status: 400 });
  }

  let q = db
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("store_id", store.storeId);
  if (!isAdminScope) {
    q = q.eq("user_id", user.id);
  }
  await q;

  return Response.json({ ok: true }, { status: 200 });
}
