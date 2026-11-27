import { requireAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { DomainSettings } from "../domain-settings";
import { WorkspaceHeading } from "@/components/workspace-data";

export default async function DomainsPage() {
  const [{ storeId, activeStore }, lang] = await Promise.all([requireAdmin("manage_domains"), getServerLang()]);
  return <div className="ws-page ws-settings-page"><WorkspaceHeading title={lang === "en" ? "Store domains" : "نطاقات المتجر"}
    description={lang === "en" ? "Connect a domain and choose the address customers use to visit your store." : "اربط نطاقاً واختر العنوان الذي يستخدمه عملاؤك لزيارة المتجر."} />
    <DomainSettings storeId={storeId} slug={activeStore.slug} en={lang === "en"} expanded /></div>;
}
