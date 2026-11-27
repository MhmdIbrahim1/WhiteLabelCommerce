import { requireAdmin, checked } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { localizedText } from "@/lib/i18n";
import type { TeamSnapshot } from "@/lib/team";
import { TeamPanel } from "./team-panel";
import { WorkspaceHeading } from "@/components/workspace-data";
import "./team.css";

export default async function TeamPage() {
  const [{ db, storeId, activeStore, user, owner, permissions }, lang] =
    await Promise.all([requireAdmin("manage_staff"), getServerLang()]);
  const team: TeamSnapshot = checked(await db.rpc("get_store_team", { p_store: storeId }));
  return <div className="ws-page team-page" dir={lang === "en" ? "ltr" : "rtl"}>
    <WorkspaceHeading title={lang === "en" ? "Store team" : "فريق المتجر"} description={localizedText(lang, activeStore.name_ar, activeStore.name_en)} />
    <TeamPanel key={storeId} storeId={storeId} team={team} actor={{ id: user.id, owner, permissions }} lang={lang} />
  </div>;
}
