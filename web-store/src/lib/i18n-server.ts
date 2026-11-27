import { cookies, headers } from "next/headers";
import { cache } from "react";
import { isLang, LANG_COOKIE, type Lang } from "./i18n";
import { STUDIO_LOCALE_HEADER } from "./tenant-shared";

export const getStudioPreviewLang = cache(async () => {
  const lang = (await headers()).get(STUDIO_LOCALE_HEADER);
  return isLang(lang) ? lang : null;
});

export async function getServerLang(defaultLang: Lang = "ar"): Promise<Lang> {
  try {
    const preview = await getStudioPreviewLang();
    if (preview) return preview;
    const store = await cookies();
    const raw = store.get(LANG_COOKIE)?.value;
    if (isLang(raw)) return raw;
  } catch {
    // Fallback during static generation when cookies() is unavailable
  }
  return defaultLang;
}
