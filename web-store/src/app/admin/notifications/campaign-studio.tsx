"use client";

import { ToastFeedback } from "@/components/floating-toast";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Send,
  Smartphone,
  Globe,
  Eye,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Link2,
  Trash2,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { localizedText } from "@/lib/i18n";
import {
  deleteAdminNotifications,
  sendPromoCampaign,
  triggerRecoveryScan,
  type CampaignSendResult,
} from "@/app/admin/mutations";

type HistoryRow = {
  id: string;
  target_role: "customer" | "admin";
  category: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  deep_link: string;
  is_read: boolean;
  read_at?: string | null;
  sent_push: boolean;
  created_at: string;
};

type StudioProps = {
  storeName: string;
  stats: {
    androidSubscribers: number;
    webSubscribers: number;
    pendingRestock: number;
    totalSent: number;
    readRate: number;
  };
  products: { id: string; name: string; name_en?: string | null }[];
  categories: { id: string; name: string; name_en?: string | null }[];
  history: HistoryRow[];
};

const COPY = {
  ar: {
    heading: "استوديو الإشعارات والحملات الذكية",
    subtitle:
      "أرسل حملات ترويجية مستهدفة لتطبيق أندرويد والويب، وتابع التنبيهات التلقائية ومعدلات القراءة لحظياً.",
    kpiAndroid: "مشتركو أندرويد (FCM)",
    kpiWeb: "مشتركو الويب (Push)",
    kpiReadRate: "معدل القراءة",
    kpiRestock: "بانتظار توفر المخزون",
    composerTitle: "إنشاء وإرسال حملة جديدة",
    audienceLabel: "الجمهور المستهدف",
    audAll: "جميع المشتركين والزوار",
    audRegistered: "العملاء المسجّلون فقط",
    audBuyers: "العملاء الذين قاموا بالشراء سابقاً",
    titleAr: "عنوان الإشعار (بالعربية)",
    titleEn: "عنوان الإشعار (بالإنجليزية)",
    bodyAr: "نص الإشعار (بالعربية)",
    bodyEn: "نص الإشعار (بالإنجليزية)",
    titleArPh: "مثال: عرض نهاية الأسبوع — خصم 20%",
    titleEnPh: "e.g. Weekend Flash Drop — 20% Off",
    bodyArPh: "استخدم كود خصم المتجر اليوم قبل نفاد الكمية.",
    bodyEnPh: "Use our weekend promo code before stock runs out.",
    deepLinkType: "الوجهة عند الضغط (الرابط العميق)",
    dlHome: "الصفحة الرئيسية",
    dlProducts: "كل المنتجات",
    dlProduct: "منتج محدد",
    dlCategory: "فئة محددة",
    dlCart: "سلة التسوق",
    dlOrders: "صفحة الطلبات",
    dlCustom: "مسار مخصص",
    selectProduct: "اختر المنتج",
    selectCategory: "اختر الفئة",
    customPathLabel: "المسار الداخلي",
    bypassQuiet: "تجاوز ساعات الهدوء (23:00 – 09:00 بتوقيت القاهرة) للعروض العاجلة",
    sendBtn: "إرسال الحملة الآن",
    sendingBtn: "جارٍ الإرسال…",
    previewTitle: "معاينة فورية للإشعار",
    previewLangAr: "معاينة بالعربية",
    previewLangEn: "معاينة بالإنجليزية",
    previewNow: "الآن",
    previewTap: "الوجهة:",
    automationTitle: "الأتمتة الذكية واستعادة السلات",
    automationDesc:
      "يعمل المحرك تلقائياً لتحديثات الطلبات، الدفع، انخفاض المخزون، وعودة المنتجات. يمكنك أيضاً تشغيل فحص استعادة السلات المتروكة (> ساعة) والطلبات غير المدفوعة (> 20 دقيقة) يدوياً.",
    runRecoveryBtn: "تشغيل فحص الاستعادة الآن",
    runningRecovery: "جارٍ الفحص…",
    recoveryResult: (carts: number, unpaid: number) =>
      `اكتمل الفحص: تم تنبيه ${carts} سلة متروكة و${unpaid} طلب غير مدفوع.`,
    sentSuccess: (recipients: number, pushed: number, quiet: boolean) =>
      quiet
        ? `تم حفظ الحملة في صندوق الإشعارات (${recipients}) وتأجيل الدفع الصوتي بسبب ساعات الهدوء.`
        : `تم إرسال الحملة بنجاح إلى ${recipients} مستهدف (دفع فوري: ${pushed}).`,
    errMissing: "يرجى إدخال العنوان والنص باللغتين العربية والإنجليزية.",
    errEmptyAudience: "لا يوجد عملاء مطابقون للشريحة المختارة حالياً.",
    errGeneric: "تعذر إرسال الحملة. حاول مرة أخرى.",
    historyTitle: "سجل الحملات والتنبيهات التلقائية",
    colSelectAll: "تحديد كل الإشعارات",
    colSelectRow: "تحديد الإشعار",
    colCategory: "التصنيف",
    colContent: "العنوان والمحتوى",
    colLink: "الوجهة",
    colChannel: "قناة التوصيل",
    colReadState: "حالة القراءة",
    colTime: "التوقيت",
    colActions: "إجراء",
    deleteBtn: "حذف",
    deleteSelectedBtn: (n: number) => `حذف المحدد (${n})`,
    clearReadBtn: "مسح المقروء",
    clearAllBtn: "مسح الكل",
    confirmClearRead: "حذف جميع الإشعارات المقروءة؟",
    confirmClearAll: "حذف جميع الإشعارات نهائياً؟",
    confirmBtn: "تأكيد الحذف",
    cancelBtn: "إلغاء",
    deletingBtn: "جارٍ الحذف…",
    deletedMsg: (n: number) =>
      n === 0
        ? "لا توجد إشعارات مطابقة للحذف."
        : `تم حذف ${n} إشعار بنجاح وتحديث الصناديق لحظياً.`,
    deleteErr: "تعذر حذف الإشعارات. حاول مرة أخرى.",
    emptyHistory: "لم تُسجّل أي إشعارات بعد.",
    readBadge: "مقروء",
    unreadBadge: "غير مقروء",
    pushSentBadge: "Push مرسل",
    inAppOnlyBadge: "داخل التطبيق",
    catLabels: {
      order_update: "تحديث طلب",
      payment_recovery: "استعادة دفع",
      abandoned_cart: "سلة متروكة",
      back_in_stock: "توفر مخزون",
      promo_campaign: "حملة ترويجية",
      admin_alert: "تنبيه إدارة",
    } as Record<string, string>,
  },
  en: {
    heading: "Smart Notifications & Campaign Studio",
    subtitle:
      "Send targeted bilingual push campaigns to Android & Web subscribers and monitor automated alerts and read rates.",
    kpiAndroid: "Android Subscribers (FCM)",
    kpiWeb: "Web Subscribers (Push)",
    kpiReadRate: "Read Rate",
    kpiRestock: "Pending Restock Alerts",
    composerTitle: "Compose & Send New Campaign",
    audienceLabel: "Target Audience",
    audAll: "All Subscribers & Guests",
    audRegistered: "Registered Customers Only",
    audBuyers: "Active Buyers (Past Orders)",
    titleAr: "Notification Title (Arabic)",
    titleEn: "Notification Title (English)",
    bodyAr: "Notification Body (Arabic)",
    bodyEn: "Notification Body (English)",
    titleArPh: "Arabic headline...",
    titleEnPh: "e.g. Weekend Flash Drop — 20% Off",
    bodyArPh: "Arabic message body...",
    bodyEnPh: "Shop our weekend picks before stock runs out.",
    deepLinkType: "Tap Destination (Deep Link)",
    dlHome: "Home Page",
    dlProducts: "All Products",
    dlProduct: "Specific Product",
    dlCategory: "Specific Category",
    dlCart: "Shopping Cart",
    dlOrders: "Orders Page",
    dlCustom: "Custom Path",
    selectProduct: "Select Product",
    selectCategory: "Select Category",
    customPathLabel: "Internal Route",
    bypassQuiet: "Bypass Cairo Quiet Hours (23:00 – 09:00) for urgent drops",
    sendBtn: "Send Campaign Now",
    sendingBtn: "Sending…",
    previewTitle: "Live Notification Preview",
    previewLangAr: "Arabic Preview",
    previewLangEn: "English Preview",
    previewNow: "Now",
    previewTap: "Opens:",
    automationTitle: "Smart Automations & Recovery Scanner",
    automationDesc:
      "Order lifecycle, payment outcomes, low-stock alerts, and back-in-stock alerts run automatically. Trigger an on-demand scan for abandoned carts (> 1h) and unpaid online orders (> 20m) below.",
    runRecoveryBtn: "Run Recovery Scan Now",
    runningRecovery: "Scanning…",
    recoveryResult: (carts: number, unpaid: number) =>
      `Scan complete: ${carts} abandoned cart(s) and ${unpaid} unpaid order(s) notified.`,
    sentSuccess: (recipients: number, pushed: number, quiet: boolean) =>
      quiet
        ? `Campaign saved to inbox (${recipients} target(s)); push paused during quiet hours.`
        : `Campaign sent to ${recipients} target(s) (push delivered: ${pushed}).`,
    errMissing: "Please fill in both Arabic and English titles and message bodies.",
    errEmptyAudience: "No customers match the selected audience segment yet.",
    errGeneric: "Failed to dispatch campaign. Please try again.",
    historyTitle: "Campaigns & Automated Alerts Log",
    colSelectAll: "Select all notifications",
    colSelectRow: "Select notification",
    colCategory: "Category",
    colContent: "Title & Message",
    colLink: "Deep Link",
    colChannel: "Channel",
    colReadState: "Read State",
    colTime: "Timestamp",
    colActions: "Action",
    deleteBtn: "Delete",
    deleteSelectedBtn: (n: number) => `Delete Selected (${n})`,
    clearReadBtn: "Clear Read",
    clearAllBtn: "Clear All",
    confirmClearRead: "Delete all read notifications?",
    confirmClearAll: "Permanently delete all notifications?",
    confirmBtn: "Confirm Delete",
    cancelBtn: "Cancel",
    deletingBtn: "Deleting…",
    deletedMsg: (n: number) =>
      n === 0
        ? "No matching notifications to delete."
        : `Deleted ${n} notification(s) and synced live inboxes.`,
    deleteErr: "Could not delete notifications. Please try again.",
    emptyHistory: "No notifications recorded yet.",
    readBadge: "Read",
    unreadBadge: "Unread",
    pushSentBadge: "Push Sent",
    inAppOnlyBadge: "In-App",
    catLabels: {
      order_update: "Order Update",
      payment_recovery: "Payment Recovery",
      abandoned_cart: "Abandoned Cart",
      back_in_stock: "Back in Stock",
      promo_campaign: "Promo Campaign",
      admin_alert: "Admin Alert",
    } as Record<string, string>,
  },
};

export function CampaignStudio({
  storeName,
  stats,
  products,
  categories,
  history,
}: StudioProps) {
  const { lang } = useLanguage();
  const c = COPY[lang];
  const router = useRouter();

  const [audience, setAudience] = useState("all");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [linkMode, setLinkMode] = useState("home");
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? "");
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id ?? "");
  const [customPath, setCustomPath] = useState("/products");
  const [bypassQuiet, setBypassQuiet] = useState(false);
  const [previewLang, setPreviewLang] = useState<"ar" | "en">(lang);

  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmMode, setConfirmMode] = useState<"read" | "all" | null>(null);
  const [logFeedback, setLogFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const [isPending, startTransition] = useTransition();
  const [isScanning, startScanTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [scanMsg, setScanMsg] = useState("");

  const rows = history.filter((row) => !removedIds.has(row.id));
  const activeSelectedIds = selectedIds.filter((id) =>
    rows.some((row) => row.id === id),
  );

  const resolvedDeepLink = (() => {
    switch (linkMode) {
      case "products":
        return "/products";
      case "product":
        return selectedProduct ? `/products/${selectedProduct}` : "/products";
      case "category":
        return selectedCategory
          ? `/products?category=${encodeURIComponent(selectedCategory)}`
          : "/products";
      case "cart":
        return "/cart";
      case "orders":
        return "/orders";
      case "custom":
        return customPath.startsWith("/") ? customPath : "/";
      default:
        return "/";
    }
  })();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (!titleAr.trim() || !titleEn.trim() || !bodyAr.trim() || !bodyEn.trim()) {
      setFeedback({ kind: "err", text: c.errMissing });
      return;
    }

    const fd = new FormData();
    fd.set("audience", audience);
    fd.set("title_ar", titleAr.trim());
    fd.set("title_en", titleEn.trim());
    fd.set("body_ar", bodyAr.trim());
    fd.set("body_en", bodyEn.trim());
    fd.set("deep_link", resolvedDeepLink);
    fd.set("bypass_quiet_hours", bypassQuiet ? "true" : "false");

    startTransition(async () => {
      const res: CampaignSendResult = await sendPromoCampaign(fd);
      if (res.ok) {
        setFeedback({
          kind: "ok",
          text: c.sentSuccess(
            res.recipientsCount,
            res.pushDelivered,
            res.suppressedByQuietHours,
          ),
        });
        setTitleAr("");
        setTitleEn("");
        setBodyAr("");
        setBodyEn("");
        router.refresh();
      } else {
        setFeedback({
          kind: "err",
          text:
            res.error === "empty_audience"
              ? c.errEmptyAudience
              : res.error === "missing_fields"
                ? c.errMissing
                : c.errGeneric,
        });
      }
    });
  }

  function handleRecoveryScan() {
    setScanMsg("");
    startScanTransition(async () => {
      const res = await triggerRecoveryScan();
      setScanMsg(
        c.recoveryResult(res.abandonedCartsNotified, res.unpaidOrdersNotified),
      );
      router.refresh();
    });
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  const allSelected = rows.length > 0 && activeSelectedIds.length === rows.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
    }
  }

  function runDelete(mode: "single" | "selected" | "read" | "all", ids?: string[]) {
    setLogFeedback(null);
    setConfirmMode(null);
    startDeleteTransition(async () => {
      const res = await deleteAdminNotifications({ mode, ids });
      if (!res.ok) {
        setLogFeedback({ kind: "err", text: c.deleteErr });
        return;
      }
      const nextRemoved = new Set(removedIds);
      if (mode === "single" || mode === "selected") {
        for (const id of ids ?? []) nextRemoved.add(id);
      } else if (mode === "read") {
        for (const r of rows) {
          if (r.is_read) nextRemoved.add(r.id);
        }
      } else if (mode === "all") {
        for (const r of rows) nextRemoved.add(r.id);
      }
      setRemovedIds(nextRemoved);
      setSelectedIds((prev) => prev.filter((id) => !nextRemoved.has(id)));
      setLogFeedback({ kind: "ok", text: c.deletedMsg(res.deletedCount) });
      router.refresh();
    });
  }

  const readCount = rows.filter((r) => r.is_read).length;
  const liveReadRate =
    rows.length > 0 ? Math.round((readCount / rows.length) * 100) : 0;

  const previewHeadline =
    previewLang === "en"
      ? titleEn.trim() || c.titleEnPh
      : titleAr.trim() || c.titleArPh;
  const previewBody =
    previewLang === "en"
      ? bodyEn.trim() || c.bodyEnPh
      : bodyAr.trim() || c.bodyArPh;

  return (
    <div className="notif-studio min-w-0 max-w-full">
      <div className="notif-studio-head">
        <div>
          <h1>{c.heading}</h1>
          <p>{c.subtitle}</p>
        </div>
      </div>

      {/* KPI Metrics */}
      <section className="metrics" aria-label={c.heading}>
        <article className="card metric">
          <span className="metric-icon">
            <Smartphone size={20} />
          </span>
          <p>{c.kpiAndroid}</p>
          <strong>{stats.androidSubscribers}</strong>
        </article>
        <article className="card metric">
          <span className="metric-icon">
            <Globe size={20} />
          </span>
          <p>{c.kpiWeb}</p>
          <strong>{stats.webSubscribers}</strong>
        </article>
        <article className="card metric">
          <span className="metric-icon">
            <Eye size={20} />
          </span>
          <p>{c.kpiReadRate}</p>
          <strong>{liveReadRate}%</strong>
        </article>
        <article className="card metric">
          <span className="metric-icon">
            <BellRing size={20} />
          </span>
          <p>{c.kpiRestock}</p>
          <strong>{stats.pendingRestock}</strong>
        </article>
      </section>

      {/* Composer + Live Preview Grid */}
      <div className="notif-studio-grid">
        <section className="card">
          <div className="row">
            <h2 className="with-icon">
              <Sparkles size={18} /> {c.composerTitle}
            </h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="notif-two-col">
              <label>
                {c.audienceLabel}
                <select
                  name="audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  <option value="all">{c.audAll}</option>
                  <option value="registered">{c.audRegistered}</option>
                  <option value="buyers">{c.audBuyers}</option>
                </select>
              </label>

              <label>
                {c.deepLinkType}
                <select
                  value={linkMode}
                  onChange={(e) => setLinkMode(e.target.value)}
                >
                  <option value="home">{c.dlHome}</option>
                  <option value="products">{c.dlProducts}</option>
                  <option value="product">{c.dlProduct}</option>
                  <option value="category">{c.dlCategory}</option>
                  <option value="cart">{c.dlCart}</option>
                  <option value="orders">{c.dlOrders}</option>
                  <option value="custom">{c.dlCustom}</option>
                </select>
              </label>
            </div>

            {linkMode === "product" && (
              <label>
                {c.selectProduct}
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {localizedText(lang, p.name, p.name_en)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {linkMode === "category" && (
              <label>
                {c.selectCategory}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {localizedText(lang, cat.name, cat.name_en)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {linkMode === "custom" && (
              <label>
                {c.customPathLabel}
                <input
                  dir="ltr"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/products"
                />
              </label>
            )}

            <div className="notif-two-col">
              <label>
                {c.titleAr}
                <input
                  name="title_ar"
                  dir="rtl"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  placeholder={c.titleArPh}
                  required
                />
              </label>
              <label>
                {c.titleEn}
                <input
                  name="title_en"
                  dir="ltr"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder={c.titleEnPh}
                  required
                />
              </label>
            </div>

            <div className="notif-two-col">
              <label>
                {c.bodyAr}
                <textarea
                  name="body_ar"
                  dir="rtl"
                  rows={3}
                  value={bodyAr}
                  onChange={(e) => setBodyAr(e.target.value)}
                  placeholder={c.bodyArPh}
                  required
                />
              </label>
              <label>
                {c.bodyEn}
                <textarea
                  name="body_en"
                  dir="ltr"
                  rows={3}
                  value={bodyEn}
                  onChange={(e) => setBodyEn(e.target.value)}
                  placeholder={c.bodyEnPh}
                  required
                />
              </label>
            </div>

            <label className="notif-check-row">
              <input
                type="checkbox"
                checked={bypassQuiet}
                onChange={(e) => setBypassQuiet(e.target.checked)}
              />
              <span>{c.bypassQuiet}</span>
            </label>

            {feedback && <ToastFeedback message={feedback.text} kind={feedback.kind === "ok" ? "success" : "error"} />}

            <button type="submit" disabled={isPending}>
              <Send size={16} />
              <span>{isPending ? c.sendingBtn : c.sendBtn}</span>
            </button>
          </form>
        </section>

        {/* Live Preview + Automations Column */}
        <div className="notif-side-col">
          <section className="card">
            <div className="row">
              <h2 className="with-icon">
                <Smartphone size={18} /> {c.previewTitle}
              </h2>
              <div className="notif-preview-tabs">
                <button
                  type="button"
                  className={previewLang === "ar" ? "is-active" : ""}
                  onClick={() => setPreviewLang("ar")}
                >
                  {c.previewLangAr}
                </button>
                <button
                  type="button"
                  className={previewLang === "en" ? "is-active" : ""}
                  onClick={() => setPreviewLang("en")}
                >
                  {c.previewLangEn}
                </button>
              </div>
            </div>

            <div
              className="notif-device-mock"
              dir={previewLang === "ar" ? "rtl" : "ltr"}
            >
              <div className="notif-mock-head">
                <span className="notif-mock-app">
                  <BellRing size={13} /> {storeName}
                </span>
                <small>{c.previewNow}</small>
              </div>
              <strong>{previewHeadline}</strong>
              <p>{previewBody}</p>
              <div className="notif-mock-link">
                <Link2 size={12} />
                <span>{c.previewTap}</span>
                <code dir="ltr">{resolvedDeepLink}</code>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="with-icon">
              <Clock size={18} /> {c.automationTitle}
            </h2>
            <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
              {c.automationDesc}
            </p>
            <div style={{ marginTop: "1rem", display: "grid", gap: "0.6rem" }}>
              <button
                type="button"
                disabled={isScanning}
                onClick={handleRecoveryScan}
              >
                <RefreshCw size={15} className={isScanning ? "notif-spin" : ""} />
                <span>{isScanning ? c.runningRecovery : c.runRecoveryBtn}</span>
              </button>
              {scanMsg && (
                <small className="notif-scan-msg" role="status">
                  {scanMsg}
                </small>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Sent History & Automated Trigger Logs with Single/Bulk/Clear Delete Controls */}
      <section className="card min-w-0 max-w-full overflow-hidden">
        <div className="notif-log-toolbar">
          <div className="notif-log-heading">
            <h2 className="with-icon">
              <BellRing size={18} /> {c.historyTitle}
            </h2>
            <span className="badge">{rows.length}</span>
          </div>

          {rows.length > 0 && (
            <div className="notif-log-actions">
              {activeSelectedIds.length > 0 && (
                <button
                  type="button"
                  className="notif-danger-btn"
                  disabled={isDeleting}
                  onClick={() => runDelete("selected", activeSelectedIds)}
                >
                  <Trash2 size={15} />
                  <span>
                    {isDeleting
                      ? c.deletingBtn
                      : c.deleteSelectedBtn(activeSelectedIds.length)}
                  </span>
                </button>
              )}

              <button
                type="button"
                className="notif-ghost-btn"
                disabled={isDeleting || readCount === 0}
                onClick={() => setConfirmMode("read")}
              >
                <Trash2 size={15} />
                <span>{c.clearReadBtn}</span>
              </button>

              <button
                type="button"
                className="notif-danger-outline-btn"
                disabled={isDeleting}
                onClick={() => setConfirmMode("all")}
              >
                <Trash2 size={15} />
                <span>{c.clearAllBtn}</span>
              </button>
            </div>
          )}
        </div>

        {confirmMode && (
          <div className="notif-confirm-bar" role="alert">
            <span>
              {confirmMode === "all" ? c.confirmClearAll : c.confirmClearRead}
            </span>
            <div className="notif-confirm-actions">
              <button
                type="button"
                className="notif-danger-btn"
                disabled={isDeleting}
                onClick={() => runDelete(confirmMode)}
              >
                <Trash2 size={14} />
                <span>{isDeleting ? c.deletingBtn : c.confirmBtn}</span>
              </button>
              <button
                type="button"
                className="notif-ghost-btn"
                disabled={isDeleting}
                onClick={() => setConfirmMode(null)}
              >
                {c.cancelBtn}
              </button>
            </div>
          </div>
        )}

        {logFeedback && (
          <div
            className={`notif-feedback ${logFeedback.kind === "ok" ? "is-ok" : "is-err"}`}
            style={{ marginTop: "0.75rem" }}
            role="status"
          >
            {logFeedback.kind === "ok" ? (
              <CheckCircle2 size={17} />
            ) : (
              <AlertCircle size={17} />
            )}
            <span>{logFeedback.text}</span>
          </div>
        )}

        {rows.length === 0 ? (
          <p style={{ marginTop: "1rem" }}>{c.emptyHistory}</p>
        ) : (
          <div className="scroll w-full max-w-full overflow-x-auto">
            <table className="notif-log-table">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>
                    <input
                      type="checkbox"
                      className="notif-table-check"
                      aria-label={c.colSelectAll}
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="whitespace-nowrap">{c.colCategory}</th>
                  <th>{c.colContent}</th>
                  <th className="whitespace-nowrap">{c.colLink}</th>
                  <th className="whitespace-nowrap">{c.colChannel}</th>
                  <th className="whitespace-nowrap">{c.colReadState}</th>
                  <th className="whitespace-nowrap">{c.colTime}</th>
                  <th className="whitespace-nowrap">{c.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const checked = activeSelectedIds.includes(row.id);
                  return (
                    <tr key={row.id} className={checked ? "notif-row-selected" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          className="notif-table-check"
                          aria-label={`${c.colSelectRow}: ${lang === "en" ? row.title_en : row.title_ar}`}
                          checked={checked}
                          onChange={() => toggleRow(row.id)}
                        />
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="badge">
                          {c.catLabels[row.category] ?? row.category}
                        </span>
                      </td>
                      <td className="min-w-[240px] max-w-[340px] whitespace-normal break-words">
                        <strong className="block leading-snug">
                          {lang === "en" ? row.title_en : row.title_ar}
                        </strong>
                        <small className="block mt-0.5 leading-relaxed">
                          {lang === "en" ? row.body_en : row.body_ar}
                        </small>
                      </td>
                      <td className="max-w-[170px]">
                        <span
                          className="code block max-w-[170px] truncate"
                          dir="ltr"
                          title={row.deep_link}
                        >
                          {row.deep_link}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span
                          className={`badge ${row.sent_push ? "notif-badge-push" : "notif-badge-inapp"}`}
                        >
                          {row.sent_push ? c.pushSentBadge : c.inAppOnlyBadge}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span
                          className={`badge ${row.is_read ? "delivered" : "notif-badge-unread"}`}
                        >
                          {row.is_read ? c.readBadge : c.unreadBadge}
                        </span>
                      </td>
                      <td dir="ltr" className="whitespace-nowrap">
                        <small>
                          {new Date(row.created_at).toLocaleString(
                            lang === "en" ? "en-GB" : "ar-EG",
                          )}
                        </small>
                      </td>
                      <td className="whitespace-nowrap">
                        <button
                          type="button"
                          className="notif-row-del-btn"
                          title={c.deleteBtn}
                          aria-label={`${c.deleteBtn}: ${lang === "en" ? row.title_en : row.title_ar}`}
                          disabled={isDeleting}
                          onClick={() => runDelete("single", [row.id])}
                        >
                          <Trash2 size={15} />
                          <span>{c.deleteBtn}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
