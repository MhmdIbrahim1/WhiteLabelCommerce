import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, type Lang } from "./i18n";

export async function getServerLang(defaultLang: Lang = "ar"): Promise<Lang> {
  try {
    const store = await cookies();
    const raw = store.get(LANG_COOKIE)?.value;
    if (isLang(raw)) return raw;
  } catch {
    // Fallback during static generation when cookies() is unavailable
  }
  return defaultLang;
}
