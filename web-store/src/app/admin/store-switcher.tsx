"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Store,
  PlusCircle,
  ExternalLink,
  ChevronsUpDown,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { localizedText } from "@/lib/i18n";
import type { ManagedStoreSummary } from "@/lib/tenant-shared";
import { switchAdminStore } from "./mutations";

export function AdminStoreSwitcher({
  activeStore,
  liveHref,
  managedStores,
  isSuperAdmin,
}: {
  activeStore: ManagedStoreSummary;
  liveHref: string;
  managedStores: ManagedStoreSummary[];
  isSuperAdmin: boolean;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canSwitch = managedStores.length > 1 || isSuperAdmin;
  const activeName = localizedText(lang, activeStore.name_ar, activeStore.name_en);

  const planLabel = (plan: string) => {
    if (plan === "enterprise") return isEn ? "Enterprise" : "مؤسسي";
    if (plan === "growth") return isEn ? "Growth" : "نمو";
    return isEn ? "Starter" : "مبتدئ";
  };

  const statusColor =
    activeStore.status === "suspended"
      ? "#dc2626"
      : activeStore.status === "trial"
        ? "#d97706"
        : "#16a34a";

  return (
    <div
      data-tour="store-switcher"
      style={{
        display: "grid",
        gap: "0.55rem",
        paddingBottom: "0.85rem",
        marginBottom: "0.5rem",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div className="brand" style={{ marginBottom: 0 }}>
        <span className="mark">
          <Store size={18} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b
            dir="auto"
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.95rem",
            }}
          >
            {activeName}
          </b>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.72rem",
              opacity: 0.84,
              minWidth: 0,
              flexWrap: "nowrap",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "999px",
                background: statusColor,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              {planLabel(activeStore.plan)}
            </span>
            <span
              dir="ltr"
              title={`/${activeStore.slug}`}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              /{activeStore.slug}
            </span>
          </div>
        </div>
      </div>

      {canSwitch && (
        <label
          style={{
            display: "grid",
            gap: "0.25rem",
            fontSize: "0.74rem",
            fontWeight: 600,
            opacity: 0.9,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
          >
            <ChevronsUpDown size={13} />
            {isEn ? "Active Store" : "المتجر النشط"}
          </span>
          <select
            aria-label={isEn ? "Switch active store" : "تبديل المتجر النشط"}
            value={activeStore.store_id}
            disabled={pending}
            onChange={(e) => {
              const nextId = e.target.value;
              if (!nextId || nextId === activeStore.store_id) return;
              startTransition(async () => {
                await switchAdminStore(nextId);
                router.refresh();
              });
            }}
            style={{
              fontSize: "0.82rem",
              padding: "0.42rem 0.55rem",
              borderRadius: "8px",
            }}
          >
            {managedStores.map((st) => {
              const label = localizedText(lang, st.name_ar, st.name_en);
              const suspendedSuffix =
                st.status === "suspended"
                  ? isEn
                    ? " (Suspended)"
                    : " (موقوف)"
                  : "";
              return (
                <option key={st.store_id} value={st.store_id}>
                  {label} · /{st.slug}
                  {suspendedSuffix}
                </option>
              );
            })}
          </select>
        </label>
      )}

      <div
        style={{
          display: "flex",
          gap: "0.4rem",
          flexWrap: "wrap",
        }}
      >
        <Link
          href={liveHref}
          target="_blank"
          rel="noreferrer"
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.3rem",
            fontSize: "0.76rem",
            padding: "0.42rem 0.55rem",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.28)",
            background: "rgba(255, 255, 255, 0.12)",
            color: "#ffffff",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <ExternalLink size={13} />
          <span>{isEn ? "View Store" : "معاينة المتجر"}</span>
        </Link>
        {canSwitch && (
          <Link
            href="/create-store"
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
              fontSize: "0.76rem",
              padding: "0.42rem 0.55rem",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              background: "rgba(255, 255, 255, 0.22)",
              color: "#ffffff",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <PlusCircle size={13} />
            <span>{isEn ? "Create Store" : "متجر جديد"}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
