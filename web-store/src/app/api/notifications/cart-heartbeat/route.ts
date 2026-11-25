import { serverDb } from "@/lib/db";
import { adminDb } from "@/lib/supabase/admin";
import { settings } from "@/lib/shop";

export async function POST(req: Request) {
  let body: {
    guest_session_id?: unknown;
    item_count?: unknown;
    subtotal?: unknown;
    locale?: unknown;
    push_token?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const guestId =
    typeof body.guest_session_id === "string"
      ? body.guest_session_id.trim().slice(0, 80)
      : "";
  const itemCount = Math.min(
    500,
    Math.max(0, Math.trunc(Number(body.item_count) || 0)),
  );
  const subtotal = Math.min(10_000_000, Math.max(0, Number(body.subtotal) || 0));
  const locale = body.locale === "en" ? "en" : "ar";
  const pushToken =
    typeof body.push_token === "string" &&
    body.push_token.trim().length >= 16 &&
    body.push_token.trim().length <= 512
      ? body.push_token.trim()
      : null;

  if (guestId.length < 24) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const [db, store] = await Promise.all([serverDb(), settings()]);
    const {
      data: { user },
    } = await db.auth.getUser();

    const srv = adminDb();
    const { data: existing } = await srv
      .from("cart_sessions")
      .select("id,user_id")
      .eq("store_id", store.storeId)
      .eq("guest_session_id", guestId)
      .maybeSingle<{ id: string; user_id: string | null }>();

    // Never allow an unauthenticated caller or another user to mutate or null out an authenticated session's user_id
    if (existing?.user_id && (!user || existing.user_id !== user.id)) {
      return Response.json({ ok: false }, { status: 403 });
    }

    await srv.from("cart_sessions").upsert(
      {
        store_id: store.storeId,
        user_id: user?.id ?? existing?.user_id ?? null,
        guest_session_id: guestId,
        push_token: pushToken,
        locale,
        item_count: itemCount,
        subtotal,
        abandoned_notified_at: itemCount === 0 ? null : undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,guest_session_id" },
    );

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return Response.json({ ok: false }, { status: 200 });
  }
}
