import { headers } from "next/headers";
import { requireAdmin } from "@/lib/db";
import { getResourceAllowance } from "@/lib/billing-data";
import { normalizeHost, isLocalHost, subdomainOrigin } from "@/lib/host-routing";
import { PLATFORM_ORIGIN_HEADER } from "@/lib/tenant-shared";
import { DomainCard } from "./domain-card";
import type { DomainRow } from "./domain-actions";

export async function DomainSettings({ storeId, slug, en }: { storeId: string; slug: string; en: boolean }) {
  const [{ db, permissions }, hdrs] = await Promise.all([requireAdmin("manage_domains"), headers()]);
  const platform = hdrs.get(PLATFORM_ORIGIN_HEADER);
  if (!platform) throw new Error("Missing platform origin");
  const target = normalizeHost(process.env.PLATFORM_DOMAIN_TARGET || null);
  const [{ data, error }, billing] = await Promise.all([db.from("store_domains")
    .select("id,domain,status,verification_token,is_primary,last_error")
    .eq("store_id", storeId).order("domain").returns<DomainRow[]>(), getResourceAllowance(storeId, "custom_domains")]);
  return <DomainCard canViewBilling={Boolean(permissions.manage_billing)} key={storeId} storeId={storeId} en={en} subdomain={subdomainOrigin(slug, platform)}
    target={target && target.authority === target.hostname && !isLocalHost(target.hostname) ? target.hostname : null}
    rows={data ?? []} unavailable={Boolean(error)} canAdd={billing.cap} />;
}
