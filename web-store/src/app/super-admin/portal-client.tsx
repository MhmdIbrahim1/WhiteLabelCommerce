"use client";

import { showToast, ToastFeedback } from "@/components/floating-toast";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, LayoutDashboard, Plus, Power, Search, SlidersHorizontal, UserPlus } from "lucide-react";
import { WorkspaceDrawer } from "@/components/workspace-drawer";
import { DataCell, StatusDot, UsageBar, WorkspaceEmpty, WorkspaceHeading, WorkspaceTable } from "@/components/workspace-data";
import { date, money } from "@/lib/brand";
import { localizedText } from "@/lib/i18n";
import { limitLabel, type Plan } from "@/lib/billing";
import {
  storefrontPath,
  type MobileAppAccess,
  type StoreStatus,
} from "@/lib/tenant-shared";
import { useLanguage } from "@/components/language-provider";
import {
  assignStoreOwnerAction,
  openStoreInAdminAction,
  updateStorePlanAndStatusAction,
  type SuperAdminStoreOverview,
} from "./actions";


export function SuperAdminPortal({
  initialStores,
  plans,
  adminEmail,
}: {
  initialStores: SuperAdminStoreOverview[];
  plans: Pick<Plan, "code" | "name_ar" | "name_en">[];
  adminEmail: string;
}) {
  const { lang } = useLanguage();
  const isEn = lang === "en";

  const [stores, setStores] = useState<SuperAdminStoreOverview[]>(initialStores);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [editingStore, setEditingStore] =
    useState<SuperAdminStoreOverview | null>(null);
  const [modalExpiresAt, setModalExpiresAt] = useState<string>("");
  const [modalClearExpiry, setModalClearExpiry] = useState<boolean>(false);
  const [modalMobileAccess, setModalMobileAccess] =
    useState<MobileAppAccess>("plan");
  const [handoverEmail, setHandoverEmail] = useState<string>("");
  const [handoverResult, setHandoverResult] = useState<{
    kind: "ok" | "pending" | "err";
    text: string;
  } | null>(null);
  const [copiedLoginLink, setCopiedLoginLink] = useState<boolean>(false);

  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const kpis = useMemo(() => {
    const total = stores.length;
    const active = stores.filter((s) => s.status === "active").length;
    const trial = stores.filter((s) => s.status === "trial").length;
    const suspended = stores.filter((s) => s.status === "suspended").length;
    const totalOrders = stores.reduce((sum, s) => sum + Number(s.orders_count || 0), 0);
    const totalGmv = stores.reduce((sum, s) => sum + Number(s.gmv || 0), 0);
    return { total, active, trial, suspended, totalOrders, totalGmv };
  }, [stores]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores.filter((s) => {
      if (planFilter !== "all" && s.billingPlan !== planFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.name_ar.toLowerCase().includes(q) ||
        s.name_en.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        s.owner_email.toLowerCase().includes(q)
      );
    });
  }, [stores, search, planFilter, statusFilter]);

  const openEditModal = (st: SuperAdminStoreOverview) => {
    setEditingStore(st);
    setModalExpiresAt(
      st.subscription_expires_at
        ? st.subscription_expires_at.slice(0, 10)
        : "",
    );
    setModalClearExpiry(false);
    setModalMobileAccess(st.mobile_app_access ?? "plan");
    setHandoverEmail(st.pending_owner_email || "");
    setHandoverResult(null);
    setCopiedLoginLink(false);
    setFeedback(null);
  };

  const handleAssignOwner = () => {
    if (!editingStore) return;
    const cleanEmail = handoverEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setHandoverResult({
        kind: "err",
        text: isEn
          ? "Please enter a valid merchant email address."
          : "يرجى إدخال بريد إلكتروني صحيح للتاجر.",
      });
      return;
    }

    const targetId = editingStore.store_id;
    startTransition(async () => {
      const res = await assignStoreOwnerAction({
        storeId: targetId,
        ownerEmail: cleanEmail,
      });
      if (!res.ok) {
        setHandoverResult({
          kind: "err",
          text: isEn
            ? "Could not assign store owner. Please try again."
            : "تعذر تعيين مالك المتجر. حاول مرة أخرى.",
        });
        return;
      }

      setStores((prev) =>
        prev.map((row) =>
          row.store_id === targetId
            ? {
                ...row,
                owner_email:
                  res.mode === "assigned_existing"
                    ? res.ownerEmail
                    : row.owner_email,
                owner_user_id: res.ownerUserId ?? row.owner_user_id,
                pending_owner_email: res.pendingOwnerEmail,
              }
            : row,
        ),
      );
      setEditingStore((prev) =>
        prev && prev.store_id === targetId
          ? {
              ...prev,
              owner_email:
                res.mode === "assigned_existing"
                  ? res.ownerEmail
                  : prev.owner_email,
              owner_user_id: res.ownerUserId ?? prev.owner_user_id,
              pending_owner_email: res.pendingOwnerEmail,
            }
          : prev,
      );

      const resolvedEmail =
        res.ownerEmail || res.pendingOwnerEmail || cleanEmail;
      if (res.mode === "assigned_existing") {
        setHandoverResult({
          kind: "ok",
          text: isEn
            ? `Linked immediately to ${resolvedEmail}. They can now sign in at /login and manage this store.`
            : `تم ربط المتجر فوراً بالحساب ${resolvedEmail}. يمكن للتاجر تسجيل الدخول الآن من /login لإدارة متجره.`,
        });
      } else {
        setHandoverResult({
          kind: "pending",
          text: isEn
            ? `Pending signup for ${resolvedEmail}. Ownership will be claimed automatically as soon as they register.`
            : `بانتظار تسجيل ${resolvedEmail}. سيتم نقل ملكية المتجر تلقائياً فور إنشائه الحساب.`,
        });
      }
    });
  };

  const handleCopyLoginLink = async () => {
    const loginUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/login`
        : "/login";
    try {
      await navigator.clipboard.writeText(loginUrl);
      showToast({ kind: "success", message: document.documentElement.lang.startsWith("en") ? "Copied to clipboard" : "تم النسخ" });
      setCopiedLoginLink(true);
      setTimeout(() => setCopiedLoginLink(false), 2000);
    } catch {
      /* ignore clipboard permission issues */
    }
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore) return;
    const targetId = editingStore.store_id;

    startTransition(async () => {
      const res = await updateStorePlanAndStatusAction({
        storeId: targetId,
        subscriptionExpiresAt: modalClearExpiry
          ? null
          : modalExpiresAt
            ? `${modalExpiresAt}T23:59:59Z`
            : null,
        clearExpiry: modalClearExpiry,
        mobileAppAccess: modalMobileAccess,
      });

      if (!res.ok) {
        setFeedback({
          kind: "err",
          text: isEn
            ? "Could not update the store settings."
            : "تعذر تحديث إعدادات المتجر.",
        });
        return;
      }

      setStores((prev) =>
        prev.map((row) =>
          row.store_id === targetId
            ? {
                ...row,
                plan: res.updated.plan,
                status: res.updated.status,
                max_products: res.updated.max_products,
                subscription_expires_at: res.updated.subscription_expires_at,
                mobile_app_access: res.updated.mobile_app_access,
                mobile_app_unlocked: res.updated.mobile_app_unlocked,
              }
            : row,
        ),
      );
      setEditingStore(null);
      setFeedback({
        kind: "ok",
        text: isEn
          ? "Store settings saved."
          : "تم حفظ إعدادات المتجر.",
      });
    });
  };

  const handleToggleStatus = (st: SuperAdminStoreOverview) => {
    const nextStatus: StoreStatus =
      st.status === "suspended" ? "active" : "suspended";
    startTransition(async () => {
      const res = await updateStorePlanAndStatusAction({
        storeId: st.store_id,
        status: nextStatus,
      });
      if (!res.ok) {
        setFeedback({
          kind: "err",
          text: isEn
            ? "Could not update store status."
            : "تعذر تغيير حالة المتجر.",
        });
        return;
      }
      setStores((prev) =>
        prev.map((row) =>
          row.store_id === st.store_id
            ? { ...row, status: res.updated.status }
            : row,
        ),
      );
      setFeedback({
        kind: "ok",
        text:
          nextStatus === "suspended"
            ? isEn
              ? `Store "/${st.slug}" suspended.`
              : `تم إيقاف المتجر "/${st.slug}" مؤقتاً.`
            : isEn
              ? `Store "/${st.slug}" activated.`
              : `تم تفعيل المتجر "/${st.slug}" بنجاح.`,
      });
    });
  };

  const planLabel = (code: Plan["code"]) => {
    const plan = plans.find(p => p.code === code)!;
    return localizedText(lang, plan.name_ar, plan.name_en);
  };

  const statusLabel = (status: StoreStatus) => {
    if (status === "suspended") return isEn ? "Suspended" : "موقوف";
    if (status === "trial") return isEn ? "Trial" : "تجريبي";
    return isEn ? "Active" : "نشط";
  };

  const copy = (english: string, arabic: string) => isEn ? english : arabic;
  const cols = isEn ? ["Store", "Subscription", "Product usage", "Sales", "Workspace"] : ["المتجر", "الاشتراك", "استخدام المنتجات", "المبيعات", "لوحة المتجر"];
  const current = editingStore && stores.find(s => s.store_id === editingStore.store_id);
  return <main className="ws-platform-page ws-page">
    <WorkspaceHeading title={copy("Platform controls", "إدارة المنصة")} description={<bdi dir="ltr">{adminEmail}</bdi>}>
      <Link className="ws-button" href="/super-admin/appearance"><SlidersHorizontal size={15}/>{copy("Appearance", "مظهر المنصة")}</Link>
      <Link className="ws-button" href="/admin"><LayoutDashboard size={15}/>{copy("Store admin", "لوحة المتجر")}</Link>
      <Link className="ws-button" href="/">{copy("Platform home", "الرئيسية")}</Link>
      <Link className="ws-primary" href="/create-store"><Plus size={15}/>{copy("Create store", "إنشاء متجر")}</Link>
    </WorkspaceHeading>
    {feedback && !editingStore && <ToastFeedback message={feedback.text} kind={feedback.kind === "ok" ? "success" : "error"} />}
    <dl className="ws-kpis"><div className="ws-north-star"><dt>{copy("Stores", "المتاجر")}</dt><dd><bdi dir="ltr">{kpis.total}</bdi></dd></div>
      <div><dt>{copy("Store availability", "حالة المتاجر")}</dt><dd className="ws-kpi-note ws-stack">
        <StatusDot status="active"><bdi dir="ltr">{kpis.active}</bdi> {statusLabel("active")}</StatusDot>
        <span><bdi dir="ltr">{kpis.trial}</bdi> {statusLabel("trial")} · <bdi dir="ltr">{kpis.suspended}</bdi> {statusLabel("suspended")}</span></dd></div>
      <div><dt>{copy("Orders", "الطلبات")}</dt><dd><bdi dir="ltr">{kpis.totalOrders}</bdi></dd></div>
      <div><dt>{copy("Gross merchandise value", "إجمالي قيمة المبيعات")}</dt><dd><bdi dir="ltr">{money(kpis.totalGmv, "EGP", lang)}</bdi></dd>
        <dd className="ws-kpi-note">{copy("Excludes cancelled orders", "باستثناء الطلبات الملغاة")}</dd></div>
    </dl>
    <section className="ws-sheet"><div className="ws-section-head"><h2>{copy("Store directory", "دليل المتاجر")}</h2>
      <small><bdi dir="ltr">{filtered.length}</bdi> {copy("stores", "متجر")}</small></div>
      <div className="ws-filters" role="search"><label className="ws-search"><Search size={15}/><span className="ws-sr">{copy("Search stores", "ابحث في المتاجر")}</span>
        <input id="directory-search" type="search" dir="auto" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={copy("Store name, slug or owner email", "اسم المتجر أو رابطه أو بريد المالك")} /></label>
        <label><span className="ws-sr">{copy("Plan", "الباقة")}</span><select value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
          <option value="all">{copy("All plans", "كل الباقات")}</option>{plans.map(p => <option key={p.code} value={p.code}>{planLabel(p.code)}</option>)}</select></label>
        <label><span className="ws-sr">{copy("Status", "الحالة")}</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{copy("All statuses", "كل الحالات")}</option>{(["active", "trial", "suspended"] as const).map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
      </div>
      {filtered.length ? <WorkspaceTable columns={cols} caption={copy("Merchant stores", "متاجر التجار")}>{filtered.map(st => {
        const title = localizedText(lang, st.name_ar, st.name_en);
        return <tr role="row" key={st.store_id}><DataCell><div className="ws-cell-stack"><button id={"store-" + st.store_id} className="ws-row-title"
          onClick={() => openEditModal(st)} aria-haspopup="dialog">{title}</button>
          <small><bdi dir="ltr">{st.custom_domain || storefrontPath(st.slug)}</bdi></small><small><bdi dir="ltr">{st.owner_email || "—"}</bdi></small></div></DataCell>
          <DataCell label={cols[1]}><div className="ws-cell-stack"><strong>{planLabel(st.billingPlan)}</strong><StatusDot status={st.status}>{statusLabel(st.status)}</StatusDot></div></DataCell>
          <DataCell label={cols[2]}><bdi dir="ltr">{st.active_products_count} / {limitLabel(st.productLimit, lang)}</bdi>
            <UsageBar cap={st.productLimit} used={st.active_products_count} label={copy("Active products", "المنتجات المنشورة")} lang={lang}/></DataCell>
          <DataCell label={cols[3]}><div className="ws-cell-stack"><bdi dir="ltr">{money(st.gmv, st.currency || "EGP", lang)}</bdi><small><bdi dir="ltr">{st.orders_count}</bdi> {copy("orders", "طلب")}</small></div></DataCell>
          <DataCell label={cols[4]}><div className="ws-actions"><button className="ws-button" disabled={pending} onClick={() => startTransition(async () => { await openStoreInAdminAction(st.store_id); })}>
            {copy("Manage", "إدارة")}</button><button className="ws-icon-button" type="button" aria-haspopup="dialog" onClick={() => openEditModal(st)}
            aria-label={copy("Store settings", "إعدادات المتجر") + " · " + title}><SlidersHorizontal size={16}/></button></div></DataCell>
        </tr>;
      })}</WorkspaceTable> : <WorkspaceEmpty title={stores.length ? copy("No matching stores", "لا توجد متاجر مطابقة") : copy("Create your first store", "أنشئ متجرك الأول")}
        action={stores.length ? <button className="ws-button" onClick={() => { setSearch(""); setPlanFilter("all"); setStatusFilter("all"); }}>{copy("Clear filters", "مسح التصفية")}</button> :
          <Link className="ws-primary" href="/create-store">{copy("Create store", "إنشاء متجر")}</Link>} />}
    </section>
    {current && <WorkspaceDrawer returnFocusId={"store-" + current.store_id} title={localizedText(lang, current.name_ar, current.name_en)}
      subtitle={<bdi dir="ltr">{storefrontPath(current.slug)}</bdi>} onDismiss={() => setEditingStore(null)}>
      <section className="ws-stack"><div className="ws-section-line"><StatusDot status={current.status}>{statusLabel(current.status)}</StatusDot>
        <Link className="ws-text-link" href={storefrontPath(current.slug)} target="_blank" rel="noreferrer">{copy("View storefront", "زيارة المتجر")}<ExternalLink size={14}/></Link></div>
        <dl className="ws-facts"><div><dt>{copy("Owner", "المالك")}</dt><dd><bdi dir="ltr">{current.owner_email || "—"}</bdi></dd></div>
          {current.pending_owner_email && <div><dt>{copy("Awaiting signup", "بانتظار التسجيل")}</dt><dd><bdi dir="ltr">{current.pending_owner_email}</bdi></dd></div>}
          <div><dt>{copy("Created", "تاريخ الإنشاء")}</dt><dd><bdi dir="ltr">{date(current.created_at, lang)}</bdi></dd></div>
          {current.custom_domain && <div><dt>{copy("Custom domain", "النطاق المخصص")}</dt><dd><bdi dir="ltr">{current.custom_domain}</bdi></dd></div>}
          <div><dt>{copy("Plan", "الباقة")}</dt><dd>{planLabel(current.billingPlan)}</dd></div>
          <div><dt>{copy("Android builds", "بناء تطبيق أندرويد")}</dt><dd>{current.mobile_app_unlocked ? copy("Enabled", "مفعّل") : copy("Disabled", "معطّل")}</dd></div></dl>
        <Link className="ws-text-link" href={"/admin/billing?tab=manage&store=" + current.store_id + "#subscriptions"}>{copy("Manage subscription and limits", "إدارة الاشتراك وحدود الاستخدام")}</Link></section>
      <section className="ws-stack"><h3>{copy("Store access", "إتاحة المتجر")}</h3>
        <form className="ws-form" onSubmit={handleSaveModal}>
          <label>{copy("Android app builder", "إنشاء تطبيق أندرويد")}<select value={modalMobileAccess} onChange={e => setModalMobileAccess(e.target.value as MobileAppAccess)}>
            <option value="plan">{copy("Use plan access", "حسب الباقة")}</option><option value="enabled">{copy("Enable for this store", "تفعيل لهذا المتجر")}</option>
            <option value="disabled">{copy("Disable for this store", "تعطيل لهذا المتجر")}</option></select></label>
          <label>{copy("Subscription expiry", "تاريخ انتهاء الاشتراك")}<input type="date" dir="ltr" disabled={modalClearExpiry} value={modalExpiresAt} onChange={e => setModalExpiresAt(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={modalClearExpiry} onChange={e => setModalClearExpiry(e.target.checked)}/>{copy("No expiry date", "اشتراك بلا تاريخ انتهاء")}</label>
          <button className="ws-primary" disabled={pending}>{copy("Save settings", "حفظ الإعدادات")}</button></form>
        <button type="button" className="ws-button" disabled={pending} onClick={() => handleToggleStatus(current)}><Power size={14}/>
          {current.status === "suspended" ? copy("Activate store", "تفعيل المتجر") : copy("Suspend store", "إيقاف المتجر مؤقتاً")}</button>
        {feedback && <p role="status" className={feedback.kind === "ok" ? "ws-feedback" : "ws-field-error"}>{feedback.text}</p>}
      </section>
      <section className="ws-stack"><h3>{copy("Assign store owner", "تعيين مالك المتجر")}</h3>
        <p>{copy("An existing account gains access immediately. A new owner receives access when they register with this email.", "يحصل صاحب الحساب المسجّل على الصلاحية فوراً. أما المالك الجديد فيحصل عليها عند التسجيل بهذا البريد.")}</p>
        <form className="ws-form" onSubmit={e => { e.preventDefault(); handleAssignOwner(); }}><label>{copy("Owner email", "بريد المالك الإلكتروني")}
          <input type="email" dir="ltr" value={handoverEmail} required onChange={e => setHandoverEmail(e.target.value)}/></label>
          <div className="ws-actions"><button className="ws-button" disabled={pending}><UserPlus size={14}/>{copy("Assign owner", "تعيين المالك")}</button>
            <button className="ws-button" type="button" onClick={handleCopyLoginLink}>{copiedLoginLink ? <Check size={14}/> : <Copy size={14}/>}
              {copiedLoginLink ? copy("Copied", "نُسخ الرابط") : copy("Copy sign-in link", "نسخ رابط الدخول")}</button></div></form>
        {handoverResult && <p role="status" className={handoverResult.kind === "err" ? "ws-field-error" : "ws-feedback"}>{handoverResult.text}</p>}
      </section>
    </WorkspaceDrawer>}
  </main>;
}
