"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronsUpDown, Store } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { localizedText } from "@/lib/i18n";
import type { ManagedStoreSummary } from "@/lib/tenant-shared";
import { switchAdminStore } from "./mutations";

export function AdminStoreSwitcher({ title, planName, activeStore, managedStores, isSuperAdmin }: {
  title: string; planName: string | null; activeStore: ManagedStoreSummary; managedStores: ManagedStoreSummary[]; isSuperAdmin: boolean;
}) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const router = useRouter();
  const [pending, start] = useTransition();
  const canSwitch = managedStores.length > 1 || isSuperAdmin;
  return <div className="ws-store-switcher" data-tour="store-switcher">
    <span className="ws-shop-icon"><Store size={18} /></span>
    <span className="ws-store-identity"><strong dir="auto">{title}</strong><small>{planName && <>{planName} · </>}<bdi dir="ltr">/{activeStore.slug}</bdi></small></span>
    {canSwitch && <><ChevronsUpDown size={14} /><select aria-label={en ? "Switch active store" : "تبديل المتجر النشط"}
      value={activeStore.store_id} disabled={pending} onChange={event => {
        const id = event.target.value;
        if (id && id !== activeStore.store_id) start(async () => { await switchAdminStore(id); router.refresh(); });
      }}>
      {managedStores.map(s => <option key={s.store_id} value={s.store_id}>{localizedText(lang, s.name_ar, s.name_en)} · /{s.slug}
        {s.status === "suspended" && (en ? " (Suspended)" : " (موقوف)")}</option>)}
    </select></>}
  </div>;
}
