"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/db";
import { designFields, readStoreDesign, type DesignSettingsRow } from "@/lib/store-design-settings";
import { parseStudioDraft, prepareStudioPublish } from "@/lib/storefront-studio";
import { storefrontDesign } from "@/lib/storefront-theme";

export async function publishStudio(expectedSlug: string, previous: unknown, changes: unknown) {
  const { db, storeId, activeStore } = await requireAdmin("manage_settings");
  if (activeStore.slug !== expectedSlug) return { ok: false, error: "store_changed" } as const;
  const before = parseStudioDraft(previous);
  const draft = parseStudioDraft(changes);
  if (!before || !draft) return { ok: false, error: "invalid" } as const;

  // xmin is the table row's PostgreSQL transaction version. A concurrent CMS write
  // makes the conditional PATCH miss; reread its JSONB before trying the scoped merge again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await db.from("store_settings").select(designFields + ",xmin")
      .eq("store_id", storeId).single<DesignSettingsRow & { xmin: string }>();
    if (error || !row?.xmin) return { ok: false, error: "failed" } as const;
    const current = storefrontDesign(readStoreDesign(row));
    const next = prepareStudioPublish(row.ui_config, current, before, draft);
    if (next.status === "conflict") return { ok: false, error: "conflict" } as const;
    if (next.status === "write") {
      const result = await db.from("store_settings").update({ ui_config: next.config })
        .eq("store_id", storeId).eq("xmin", row.xmin).select("store_id").maybeSingle();
      if (result.error) return { ok: false, error: "failed" } as const;
      if (!result.data) continue;
    }
    revalidatePath("/s/" + activeStore.slug);
    revalidatePath("/store/" + activeStore.slug);
    // Aliases, subdomains and custom domains all rewrite to this route-group layout.
    revalidatePath("/(shop)", "layout");
    revalidatePath("/admin/customizer");
    const published = next.status === "write" ? storefrontDesign(readStoreDesign({ ...row, ui_config: next.config })) : current;
    return { ok: true, draft: published } as const;
  }
  return { ok: false, error: "conflict" } as const;
}
