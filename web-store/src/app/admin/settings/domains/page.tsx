import { requireAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { DomainSettings } from "../domain-settings";

export default async function DomainsPage() {
  const [{ storeId, activeStore }, lang] = await Promise.all([requireAdmin("manage_domains"), getServerLang()]);
  return <><h1>{lang === "en" ? "Store domains" : "نطاقات المتجر"}</h1>
    <DomainSettings storeId={storeId} slug={activeStore.slug} en={lang === "en"} /></>;
}
