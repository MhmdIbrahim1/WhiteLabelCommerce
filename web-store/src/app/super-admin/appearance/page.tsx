import { requireSuperAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { readPlatformTheme } from "@/lib/platform-theme-data";
import { AppearanceEditor } from "./appearance-editor";
import "@/components/platform-theme.css";
import "./appearance.css";

export default async function AppearancePage() {
  const { db } = await requireSuperAdmin();
  const [theme, lang] = await Promise.all([readPlatformTheme(db), getServerLang()]);
  return <AppearanceEditor initial={theme} lang={lang} />;
}
