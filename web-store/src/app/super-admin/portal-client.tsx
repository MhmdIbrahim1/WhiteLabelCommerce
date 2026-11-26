"use client";

import { showToast, ToastFeedback } from "@/components/floating-toast";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  ShieldCheck,
  Store,
  PlusCircle,
  Search,
  ExternalLink,
  SlidersHorizontal,
  Power,
  Edit3,
  X,
  ShoppingBag,
  TrendingUp,
  Activity,
  LayoutDashboard,
  CheckCircle2,
  Smartphone,
  Lock,
  UserPlus,
  Copy,
  Check,
  Clock,
} from "lucide-react";
import { date, money } from "@/lib/brand";
import { localizedText } from "@/lib/i18n";
import {
  storefrontPath,
  type MobileAppAccess,
  type StorePlan,
  type StoreStatus,
} from "@/lib/tenant-shared";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import {
  assignStoreOwnerAction,
  openStoreInAdminAction,
  updateStorePlanAndStatusAction,
  type SuperAdminStoreOverview,
} from "./actions";

const PLAN_PRESETS: { plan: StorePlan; maxProducts: number; ar: string; en: string }[] = [
  { plan: "starter", maxProducts: 50, ar: "مبتدئ (50 منتج)", en: "Starter (50 products)" },
  { plan: "growth", maxProducts: 500, ar: "نمو (500 منتج)", en: "Growth (500 products)" },
  { plan: "enterprise", maxProducts: 10000, ar: "مؤسسي (10,000 منتج)", en: "Enterprise (10,000 products)" },
];

export function SuperAdminPortal({
  initialStores,
  adminEmail,
}: {
  initialStores: SuperAdminStoreOverview[];
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
  const [modalPlan, setModalPlan] = useState<StorePlan>("starter");
  const [modalMaxProducts, setModalMaxProducts] = useState<string>("50");
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
      if (planFilter !== "all" && s.plan !== planFilter) return false;
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
    setModalPlan(st.plan);
    setModalMaxProducts(String(st.max_products));
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
    const parsedMax = Number(modalMaxProducts);
    if (!Number.isFinite(parsedMax) || parsedMax < 0) return;

    startTransition(async () => {
      const res = await updateStorePlanAndStatusAction({
        storeId: targetId,
        plan: modalPlan,
        maxProducts: Math.trunc(parsedMax),
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
            ? "Could not update store plan and limits."
            : "تعذر تحديث باقة وحدود المتجر.",
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
          ? "Store plan, limits & Mobile App access updated successfully."
          : "تم تحديث الباقة والحدود وصلاحية تطبيق الموبايل بنجاح.",
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

  const planLabel = (plan: StorePlan) => {
    if (plan === "enterprise") return isEn ? "Enterprise" : "مؤسسي";
    if (plan === "growth") return isEn ? "Growth" : "نمو";
    return isEn ? "Starter" : "مبتدئ";
  };

  const statusLabel = (status: StoreStatus) => {
    if (status === "suspended") return isEn ? "Suspended" : "موقوف";
    if (status === "trial") return isEn ? "Trial" : "تجريبي";
    return isEn ? "Active" : "نشط";
  };

  const statusBadgeStyle = (status: StoreStatus) => {
    if (status === "suspended") {
      return { background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" };
    }
    if (status === "trial") {
      return { background: "#fffbeb", color: "#b45309", borderColor: "#fde68a" };
    }
    return { background: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" };
  };

  return (
    <main className="min-h-dvh bg-slate-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <ShieldCheck size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 m-0">
                {isEn ? "Platform Super-Admin Portal" : "بوابة إدارة المنصة (Super Admin)"}
              </h1>
              <p className="text-xs text-slate-500 m-0 truncate" dir="ltr">
                {adminEmail}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <LanguageToggle className="lang-toggle-pill" />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 no-underline"
            >
              <Store size={15} />
              <span>{isEn ? "Main Storefront" : "المتجر الرئيسي"}</span>
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 no-underline"
            >
              <LayoutDashboard size={15} />
              <span>{isEn ? "Store Admin" : "لوحة المتجر"}</span>
            </Link>
            <Link
              href="/create-store"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold hover:bg-slate-800 no-underline"
              style={{ color: "#ffffff" }}
            >
              <PlusCircle size={15} />
              <span>{isEn ? "New Merchant Store" : "إنشاء متجر جديد"}</span>
            </Link>
          </div>
        </header>

        {feedback && <ToastFeedback message={feedback.text} kind={feedback.kind === "ok" ? "success" : "error"} />}

        {/* Platform KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span>{isEn ? "Total Stores" : "إجمالي المتاجر"}</span>
              <Store size={17} />
            </div>
            <div className="text-3xl font-extrabold text-slate-900">
              {kpis.total}
            </div>
            <p className="text-xs text-slate-500 mt-1 m-0">
              {isEn ? "Multi-tenant SaaS instances" : "متاجر مستقلة على المنصة"}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span>{isEn ? "Store Health" : "حالة المتاجر"}</span>
              <Activity size={17} />
            </div>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-2xl font-extrabold text-emerald-700">
                {kpis.active}
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                {isEn ? "Active" : "نشط"}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-sm font-bold text-amber-700">
                {kpis.trial} {isEn ? "Trial" : "تجريبي"}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-sm font-bold text-rose-700">
                {kpis.suspended} {isEn ? "Suspended" : "موقوف"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2 m-0">
              {isEn ? "Real-time tenant availability" : "توزيع الحالة التشغيلية للمتاجر"}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span>{isEn ? "Total Platform Orders" : "إجمالي طلبات المنصة"}</span>
              <ShoppingBag size={17} />
            </div>
            <div className="text-3xl font-extrabold text-slate-900">
              {kpis.totalOrders}
            </div>
            <p className="text-xs text-slate-500 mt-1 m-0">
              {isEn ? "Across all merchant storefronts" : "عبر جميع المتاجر المسجلة"}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-2">
              <span>{isEn ? "Total Platform GMV" : "إجمالي المبيعات (GMV)"}</span>
              <TrendingUp size={17} />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {money(kpis.totalGmv, "EGP", lang)}
            </div>
            <p className="text-xs text-slate-500 mt-1 m-0">
              {isEn ? "Non-cancelled order volume" : "حجم المبيعات للطلبات غير الملغاة"}
            </p>
          </article>
        </section>

        {/* Tenants Directory */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 m-0">
              {isEn
                ? `Tenants Directory (${filtered.length})`
                : `دليل المتاجر (${filtered.length})`}
            </h2>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search
                  size={15}
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400"
                  style={{ [isEn ? "left" : "right"]: "0.7rem" }}
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    isEn
                      ? "Search name, slug, or owner..."
                      : "ابحث بالاسم أو الرابط أو البريد..."
                  }
                  style={{
                    paddingInlineStart: "2.1rem",
                    fontSize: "0.86rem",
                  }}
                />
              </div>

              <select
                aria-label={isEn ? "Filter by plan" : "تصفية بالباقة"}
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                style={{ width: "auto", fontSize: "0.86rem" }}
              >
                <option value="all">{isEn ? "All Plans" : "كل الباقات"}</option>
                <option value="starter">{isEn ? "Starter" : "مبتدئ"}</option>
                <option value="growth">{isEn ? "Growth" : "نمو"}</option>
                <option value="enterprise">{isEn ? "Enterprise" : "مؤسسي"}</option>
              </select>

              <select
                aria-label={isEn ? "Filter by status" : "تصفية بالحالة"}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: "auto", fontSize: "0.86rem" }}
              >
                <option value="all">{isEn ? "All Statuses" : "كل الحالات"}</option>
                <option value="active">{isEn ? "Active" : "نشط"}</option>
                <option value="trial">{isEn ? "Trial" : "تجريبي"}</option>
                <option value="suspended">{isEn ? "Suspended" : "موقوف"}</option>
              </select>
            </div>
          </div>

          <div className="w-full max-w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-3 px-3 text-start font-semibold">
                    {isEn ? "Store" : "المتجر"}
                  </th>
                  <th className="py-3 px-3 text-start font-semibold">
                    {isEn ? "Owner" : "المالك"}
                  </th>
                  <th className="py-3 px-3 text-start font-semibold">
                    {isEn ? "Plan & Status" : "الباقة والحالة"}
                  </th>
                  <th className="py-3 px-3 text-start font-semibold">
                    {isEn ? "Products Quota" : "المنتجات"}
                  </th>
                  <th className="py-3 px-3 text-start font-semibold">
                    {isEn ? "Orders / GMV" : "الطلبات / المبيعات"}
                  </th>
                  <th className="py-3 px-3 text-start font-semibold">
                    {isEn ? "Actions" : "إجراءات"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((st) => {
                  const title = localizedText(lang, st.name_ar, st.name_en);
                  const liveHref = storefrontPath(st.slug);
                  const pct =
                    st.max_products > 0
                      ? Math.min(
                          100,
                          Math.round((st.products_count / st.max_products) * 100),
                        )
                      : 100;
                  return (
                    <tr
                      key={st.store_id}
                      className="border-b border-slate-100 hover:bg-slate-50/70"
                    >
                      <td className="py-3.5 px-3 align-top">
                        <div className="font-bold text-slate-900">{title}</div>
                        <div
                          dir="ltr"
                          className="text-xs font-mono text-slate-500 mt-0.5"
                        >
                          {liveHref}
                        </div>
                        {st.custom_domain && (
                          <div dir="ltr" className="text-xs text-cyan-700 mt-0.5">
                            {st.custom_domain}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 align-top">
                        <div dir="ltr" className="text-xs text-slate-700 font-medium">
                          {st.owner_email || "—"}
                        </div>
                        {st.pending_owner_email && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            <Clock size={11} />
                            <span>
                              {isEn ? "Pending:" : "تسليم معلق:"}{" "}
                              <span dir="ltr">{st.pending_owner_email}</span>
                            </span>
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {date(st.created_at, lang)}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">
                            {planLabel(st.plan)}
                          </span>
                          <span
                            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold"
                            style={statusBadgeStyle(st.status)}
                          >
                            {statusLabel(st.status)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                              st.mobile_app_unlocked
                                ? "border-sky-200 bg-sky-50 text-sky-800"
                                : "border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            {st.mobile_app_unlocked ? (
                              <Smartphone size={11} />
                            ) : (
                              <Lock size={11} />
                            )}
                            <span>
                              {st.mobile_app_unlocked
                                ? isEn
                                  ? "App On"
                                  : "تطبيق مفعّل"
                                : isEn
                                  ? "Web Only"
                                  : "ويب فقط"}
                            </span>
                          </span>
                        </div>
                        {st.subscription_expires_at && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            {isEn ? "Expires:" : "ينتهي:"}{" "}
                            {date(st.subscription_expires_at, lang)}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 align-top min-w-[130px]">
                        <div className="text-xs font-bold text-slate-800">
                          {st.products_count} / {st.max_products}
                        </div>
                        <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pct >= 90 ? "bg-rose-500" : "bg-cyan-600"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-3 align-top">
                        <div className="font-bold text-slate-900">
                          {money(st.gmv, st.currency || "EGP", lang)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {st.orders_count}{" "}
                          {isEn ? "orders" : "طلب"}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => openEditModal(st)}
                            style={{
                              background: "#f1f5f9",
                              color: "#0f172a",
                              padding: "0.35rem 0.6rem",
                              fontSize: "0.76rem",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                            }}
                          >
                            <Edit3 size={13} />
                            <span>{isEn ? "Plan & Limits" : "الباقة والحدود"}</span>
                          </button>

                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleToggleStatus(st)}
                            style={{
                              background:
                                st.status === "suspended" ? "#ecfdf5" : "#fef2f2",
                              color:
                                st.status === "suspended" ? "#047857" : "#b91c1c",
                              padding: "0.35rem 0.6rem",
                              fontSize: "0.76rem",
                              borderRadius: "8px",
                              border:
                                st.status === "suspended"
                                  ? "1px solid #a7f3d0"
                                  : "1px solid #fecaca",
                            }}
                          >
                            <Power size={13} />
                            <span>
                              {st.status === "suspended"
                                ? isEn
                                  ? "Activate"
                                  : "تفعيل"
                                : isEn
                                  ? "Suspend"
                                  : "إيقاف"}
                            </span>
                          </button>

                          <Link
                            href={liveHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 no-underline"
                          >
                            <ExternalLink size={13} />
                            <span>{isEn ? "Live" : "معاينة"}</span>
                          </Link>

                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await openStoreInAdminAction(st.store_id);
                              })
                            }
                            style={{
                              background: "#0f172a",
                              color: "#ffffff",
                              padding: "0.35rem 0.6rem",
                              fontSize: "0.76rem",
                              borderRadius: "8px",
                            }}
                          >
                            <SlidersHorizontal size={13} />
                            <span>{isEn ? "Manage" : "إدارة"}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 text-center text-sm text-slate-500"
                    >
                      {isEn
                        ? "No stores match your current filters."
                        : "لا توجد متاجر مطابقة لخيارات البحث الحالية."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Edit Plan, Mobile App & Merchant Handover Modal */}
      {editingStore && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs overflow-y-auto"
          onClick={() => setEditingStore(null)}
        >
          <div
            className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900 m-0">
                  {isEn
                    ? "Manage Plan, App & Owner"
                    : "إدارة الباقة والتطبيق وتسليم المالك"}
                </h2>
                <p className="text-xs text-slate-500 m-0">
                  {localizedText(lang, editingStore.name_ar, editingStore.name_en)}{" "}
                  (<span dir="ltr">{storefrontPath(editingStore.slug)}</span>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStore(null)}
                style={{
                  background: "transparent",
                  color: "#475569",
                  padding: "0.3rem",
                }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4" style={{ marginTop: 0 }}>
              <div className="space-y-2">
                <span className="block text-xs font-bold text-slate-700">
                  {isEn ? "Subscription Tier" : "باقة الاشتراك"}
                </span>
                <div className="grid gap-2">
                  {PLAN_PRESETS.map((tier) => {
                    const active = modalPlan === tier.plan;
                    return (
                      <button
                        key={tier.plan}
                        type="button"
                        onClick={() => {
                          setModalPlan(tier.plan);
                          setModalMaxProducts(String(tier.maxProducts));
                        }}
                        style={{
                          width: "100%",
                          justifyContent: "space-between",
                          background: active ? "#f0f9ff" : "#ffffff",
                          color: "#0f172a",
                          border: active
                            ? "2px solid #0284c7"
                            : "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "0.65rem 0.85rem",
                          fontSize: "0.86rem",
                        }}
                      >
                        <span>{isEn ? tier.en : tier.ar}</span>
                        {active && <CheckCircle2 size={16} className="text-sky-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3-Way Android App Builder Override */}
              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Smartphone size={14} />
                  <span>
                    {isEn
                      ? "Android App Builder Access"
                      : "صلاحية مصنع تطبيق الأندرويد"}
                  </span>
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        value: "plan",
                        ar: "حسب الباقة",
                        en: "Follow Plan",
                      },
                      {
                        value: "enabled",
                        ar: "تفعيل إجباري",
                        en: "Force Enabled",
                      },
                      {
                        value: "disabled",
                        ar: "إيقاف إجباري",
                        en: "Force Disabled",
                      },
                    ] as const
                  ).map((opt) => {
                    const active = modalMobileAccess === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setModalMobileAccess(opt.value)}
                        style={{
                          width: "100%",
                          justifyContent: "center",
                          background: active ? "#0f172a" : "#f8fafc",
                          color: active ? "#ffffff" : "#334155",
                          border: active
                            ? "1px solid #0f172a"
                            : "1px solid #cbd5e1",
                          borderRadius: "9px",
                          padding: "0.52rem 0.45rem",
                          fontSize: "0.78rem",
                          fontWeight: 650,
                        }}
                      >
                        {isEn ? opt.en : opt.ar}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 m-0">
                  {isEn
                    ? "Follow Plan unlocks APK Builder on Growth & Enterprise plans and locks Starter."
                    : "خيار «حسب الباقة» يفعّل بناء التطبيق لباقات النمو والمؤسسي ويقفله لباقة المبتدئ."}
                </p>
              </div>

              <label>
                <span>{isEn ? "Max Products Limit" : "الحد الأقصى للمنتجات"}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={modalMaxProducts}
                  onChange={(e) => setModalMaxProducts(e.target.value)}
                />
              </label>

              <label>
                <span>
                  {isEn
                    ? "Subscription Expiry Date (optional)"
                    : "تاريخ انتهاء الاشتراك (اختياري)"}
                </span>
                <input
                  type="date"
                  dir="ltr"
                  disabled={modalClearExpiry}
                  value={modalExpiresAt}
                  onChange={(e) => setModalExpiresAt(e.target.value)}
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontWeight: 500,
                }}
              >
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={modalClearExpiry}
                  onChange={(e) => setModalClearExpiry(e.target.checked)}
                />
                <span>
                  {isEn ? "No expiration date (unlimited)" : "بدون تاريخ انتهاء"}
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStore(null)}
                  style={{
                    background: "#f1f5f9",
                    color: "#334155",
                  }}
                >
                  {isEn ? "Cancel" : "إلغاء"}
                </button>
                <button type="submit" disabled={pending}>
                  {isEn ? "Save Changes" : "حفظ التغييرات"}
                </button>
              </div>
            </form>

            {/* Assign Store Owner / Merchant Handover */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <UserPlus size={15} />
                  <span>
                    {isEn
                      ? "Assign Store Owner (Merchant Handover)"
                      : "تعيين مالك المتجر (تسليم للتاجر)"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyLoginLink}
                  style={{
                    background: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                    padding: "0.28rem 0.6rem",
                    borderRadius: "8px",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                  }}
                >
                  {copiedLoginLink ? <Check size={13} /> : <Copy size={13} />}
                  <span>
                    {copiedLoginLink
                      ? isEn
                        ? "Copied /login"
                        : "تم النسخ"
                      : isEn
                        ? "Copy Login Link"
                        : "نسخ رابط الدخول"}
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 m-0">
                {isEn
                  ? "Enter the merchant's email. Existing accounts gain immediate owner access; new emails automatically claim this store on signup."
                  : "أدخل بريد التاجر الإلكتروني. إذا كان مسجلاً يحصل على ملكية المتجر فوراً، وإلا تُنقل الملكية تلقائياً فور إنشائه الحساب."}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  dir="ltr"
                  value={handoverEmail}
                  onChange={(e) => setHandoverEmail(e.target.value)}
                  placeholder="merchant@brand.com"
                  style={{ flex: 1, fontSize: "0.84rem", background: "#ffffff" }}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleAssignOwner}
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    padding: "0.52rem 0.85rem",
                    borderRadius: "9px",
                    fontSize: "0.8rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isEn ? "Assign Owner" : "تسليم المتجر"}
                </button>
              </div>
              {handoverResult && (
                <div
                  role="status"
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    handoverResult.kind === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : handoverResult.kind === "pending"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {handoverResult.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
