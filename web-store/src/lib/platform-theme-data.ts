import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { defaultTheme, parsePlatformTheme } from "./platform-theme";

export const themeCacheTag = "platform-appearance";

export async function readPlatformTheme(db: SupabaseClient) {
  const { data, error } = await db.from("platform_theme_settings").select(
    "preset,accent_color,radius_scale,font_pair,hero_title_ar,hero_title_en,hero_subtitle_ar,hero_subtitle_en,sticky_cta_enabled,motion_enabled,revision",
  ).eq("id", 1).abortSignal(AbortSignal.timeout(4000)).single();
  const theme = !error && parsePlatformTheme(data);
  if (!theme) throw new Error("Platform appearance unavailable");
  return theme;
}

const readPublished = unstable_cache(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return readPlatformTheme(db);
}, ["platform-appearance-v1", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""], { tags: [themeCacheTag], revalidate: 300 });

// Cache successful snapshots. A cold outage gets the design default for this request only.
export const getPublishedTheme = cache(async () => {
  try { return await readPublished(); } catch { return defaultTheme; }
});
