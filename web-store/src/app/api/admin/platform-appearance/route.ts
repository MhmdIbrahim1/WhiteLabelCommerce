import { revalidatePath, revalidateTag } from "next/cache";
import { superAdminUser } from "@/lib/access";
import { serverDb } from "@/lib/db";
import { matchesRequestOrigin } from "@/lib/password-policy";
import { parsePlatformTheme } from "@/lib/platform-theme";
import { themeCacheTag } from "@/lib/platform-theme-data";

export async function POST(request: Request) {
  if (!matchesRequestOrigin(request)) return Response.json({ error: "origin" }, { status: 403 });
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "sign_in" }, { status: 401 });
  if (!(await superAdminUser(db, user))) return Response.json({ error: "forbidden" }, { status: 403 });

  const theme = parsePlatformTheme(await request.json().catch(() => null));
  if (!theme) return Response.json({ error: "invalid_theme" }, { status: 400 });
  const { data: revision, error } = await db.rpc("save_platform_theme", {
    p_expected_revision: theme.revision, p_preset: theme.preset, p_accent_color: theme.accent_color,
    p_radius_scale: theme.radius_scale, p_font_pair: theme.font_pair,
    p_hero_title_ar: theme.hero_title_ar, p_hero_title_en: theme.hero_title_en,
    p_hero_subtitle_ar: theme.hero_subtitle_ar, p_hero_subtitle_en: theme.hero_subtitle_en,
    p_motion_enabled: theme.motion_enabled, p_sticky_cta_enabled: theme.sticky_cta_enabled,
  });
  if (error) {
    if (error.code === "PT409") return Response.json({ error: "conflict" }, { status: 409 });
    if (error.code === "42501") return Response.json({ error: "forbidden" }, { status: 403 });
    return Response.json({ error: "save_failed" }, { status: 500 });
  }

  revalidateTag(themeCacheTag, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/platform-landing");
  revalidatePath("/super-admin", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/platform-access/[screen]", "page");
  revalidatePath("/create-store");
  revalidatePath("/invite/[token]", "page");
  return Response.json({ ...theme, revision });
}
