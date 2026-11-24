import { serverDb } from "@/lib/db";
import { settings } from "@/lib/shop";

type RegisterBody = {
  token?: unknown;
  platform?: unknown;
  locale?: unknown;
  guest_session_id?: unknown;
  phone?: unknown;
};

export async function POST(req: Request) {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const platform =
    typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "web";
  const locale =
    typeof body.locale === "string" && body.locale.trim().toLowerCase() === "en"
      ? "en"
      : "ar";
  const guestSessionId =
    typeof body.guest_session_id === "string"
      ? body.guest_session_id.trim().slice(0, 80)
      : null;
  const phone =
    typeof body.phone === "string" ? body.phone.trim().slice(0, 24) : null;

  if (token.length < 16 || (platform !== "android" && platform !== "web")) {
    return Response.json({ error: "Invalid push token." }, { status: 400 });
  }

  const [db, store] = await Promise.all([serverDb(), settings()]);
  const { data, error } = await db.rpc("register_push_subscription", {
    p_store_id: store.storeId,
    p_platform: platform,
    p_token: token,
    p_locale: locale,
    p_guest_session_id: guestSessionId,
    p_phone: phone,
  });

  if (error) {
    return Response.json(
      { error: "Could not save push subscription." },
      { status: 500 },
    );
  }

  return Response.json(
    { ok: true, id: data },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
