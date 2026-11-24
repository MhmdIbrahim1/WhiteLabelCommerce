"use client";

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
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { localizedText } from "@/lib/i18n";
import {
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
    colCategory: "التصنيف",
    colContent: "العنوان والمحتوى",
    colLink: "الوجهة",
    colStatus: "الحالة",
    colTime: "التوقيت",
    emptyHistory: "لم تُسجّل أي إشعارات بعد.",
    readBadge: "مقروء",
    unreadBadge: "غير مقروء",
    pushSentBadge: "دفع فوري",
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
    historyTitle: "Sent Campaigns & Automated Trigger Logs",
    colCategory: "Category",
    colContent: "Title & Message",
    colLink: "Deep Link",
    colStatus: "Delivery",
    colTime: "Timestamp",
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

  const [isPending, startTransition] = useTransition();
  const [isScanning, startScanTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [scanMsg, setScanMsg] = useState("");

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

  const previewHeadline =
    previewLang === "en"
      ? titleEn.trim() || c.titleEnPh
      : titleAr.trim() || c.titleArPh;
  const previewBody =
    previewLang === "en"
      ? bodyEn.trim() || c.bodyEnPh
      : bodyAr.trim() || c.bodyArPh;

  return (
    <div className="notif-studio">
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
          <strong>{stats.readRate}%</strong>
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

            {feedback && (
              <div
                className={`notif-feedback ${feedback.kind === "ok" ? "is-ok" : "is-err"}`}
                role="status"
              >
                {feedback.kind === "ok" ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <AlertCircle size={17} />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

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

      {/* Sent History & Automated Trigger Logs */}
      <section className="card">
        <div className="row">
          <h2 className="with-icon">
            <BellRing size={18} /> {c.historyTitle}
          </h2>
          <span className="badge">{stats.totalSent}</span>
        </div>

        {history.length === 0 ? (
          <p style={{ marginTop: "1rem" }}>{c.emptyHistory}</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>{c.colCategory}</th>
                  <th>{c.colContent}</th>
                  <th>{c.colLink}</th>
                  <th>{c.colStatus}</th>
                  <th>{c.colTime}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="badge">
                        {c.catLabels[row.category] ?? row.category}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "normal", minWidth: "240px" }}>
                      <strong>
                        {lang === "en" ? row.title_en : row.title_ar}
                      </strong>
                      <br />
                      <small>
                        {lang === "en" ? row.body_en : row.body_ar}
                      </small>
                    </td>
                    <td>
                      <span className="code">{row.deep_link}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        <span
                          className={`badge ${row.is_read ? "delivered" : ""}`}
                        >
                          {row.is_read ? c.readBadge : c.unreadBadge}
                        </span>
                        <span
                          className={`badge ${row.sent_push ? "delivered" : ""}`}
                        >
                          {row.sent_push ? c.pushSentBadge : c.inAppOnlyBadge}
                        </span>
                      </div>
                    </td>
                    <td dir="ltr">
                      <small>
                        {new Date(row.created_at).toLocaleString(
                          lang === "en" ? "en-GB" : "ar-EG",
                        )}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
