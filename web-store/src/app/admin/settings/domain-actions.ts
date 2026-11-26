"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/db";
import { quotaFailure, type QuotaFailure } from "@/lib/billing";
import { adminDb } from "@/lib/supabase/admin";
import { customDomain, platformRootDomain } from "@/lib/host-routing";
import { verifyDomainTxt, type DnsError } from "@/lib/domain-dns";

export type DomainState = "pending_dns" | "verified" | "active" | "error";
export type DomainRow = {
  id: string; domain: string; status: DomainState; verification_token: string;
  last_error: DnsError | null; is_primary: boolean;
};
export type DomainResult = "" | DnsError | "added" | "verified" | "activated" | "removed" |
  "primary_saved" | "invalid" | "taken" | "changed" | "unavailable" | QuotaFailure;

export async function manageDomain(expectedStore: string, _previous: DomainResult, form: FormData): Promise<DomainResult> {
  const { db, storeId, user } = await requireAdmin("manage_domains");
  if (storeId !== expectedStore) return "changed";
  const action = form.get("action");
  const id = String(form.get("id") || "");
  let result: DomainResult;
  if (action === "add") {
    const domain = customDomain(String(form.get("domain") || "").trim(), platformRootDomain());
    if (!domain) return "invalid";
    const { error } = await db.from("store_domains").insert({ store_id: storeId, domain });
    if (error) return quotaFailure(error) ?? (error.code === "23505" ? "taken" : "unavailable");
    result = "added";
  } else {
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return "invalid";
    if (action === "remove") {
      const { data, error } = await db.from("store_domains").delete().eq("id", id).eq("store_id", storeId)
        .select("id").maybeSingle();
      if (error || !data) return error ? "unavailable" : "changed";
      result = "removed";
    } else if (action === "primary") {
      const { error } = await db.rpc("set_store_domain_primary", {
        p_store_id: storeId, p_domain_id: id, p_primary: form.get("primary") === "true",
      });
      if (error) return "changed";
      result = "primary_saved";
    } else if (action === "verify" || action === "activate") {
      const { data: row, error } = await db.from("store_domains")
        .select("domain,status,verification_token,updated_at").eq("store_id", storeId).eq("id", id)
        .maybeSingle<Pick<DomainRow, "domain" | "status" | "verification_token"> & { updated_at: string }>();
      if (error || !row) return error ? "unavailable" : "changed";
      if (!customDomain(row.domain, platformRootDomain())) return "invalid";
      if (action === "activate" ? row.status !== "verified" : !["pending_dns", "error"].includes(row.status)) return "changed";

      const failure = await verifyDomainTxt(row.domain, row.verification_token);
      const status = failure ? "error" : action === "activate" ? "active" : "verified";
      // The authorized row is the entire write scope. DNS results cannot cross a remove/re-add or concurrent transition.
      const { data: updated, error: saveError } = await adminDb().rpc("record_store_domain_dns", {
        p_store: storeId, p_actor: user.id, p_id: id, p_token: row.verification_token,
        p_expected_status: row.status, p_updated_at: row.updated_at, p_status: status, p_error: failure,
      });
      if (saveError || !updated) return saveError ? "unavailable" : "changed";
      result = failure ?? (status === "active" ? "activated" : "verified");
    } else return "invalid";
  }
  revalidatePath("/admin", "layout");
  return result;
}
