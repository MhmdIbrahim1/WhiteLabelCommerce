import { SubmitButton } from "@/components/submit-button";
import { StatusDot, WorkspaceHeading } from "@/components/workspace-data";
import { checked, requireAdmin } from "@/lib/db";
import {
  savePaymentSettings,
  saveSettings,
  saveWalletIncentiveSettings,
} from "../mutations";
import { TemplateGallery } from "./template-gallery";
import { DomainSettings } from "./domain-settings";
import { isTemplate } from "@/lib/theme-templates";
import { getServerLang } from "@/lib/i18n-server";
import { Notice } from "../ui";
import { OnboardingStepMarker } from "../onboarding-store";

type StoreSettingsRow = {
  store_id: string;
  store_name: string;
  currency: string;
  shipping_fee: number;
  default_max_order_qty: number | null;
  whatsapp_number: string;
  theme_template: string;
  banners: string[];
  cod_enabled: boolean;
  paymob_enabled: boolean;
  paymob_card_enabled: boolean;
  paymob_wallet_enabled: boolean;
  cart_incentive_enabled?: boolean | null;
  free_shipping_threshold?: number | null;
  cashback_enabled?: boolean | null;
  cashback_percentage?: number | null;
  return_window_days?: number | null;
};

type PaymentSecretRow = {
  paymob_api_key: string | null;
  paymob_hmac_secret: string | null;
  paymob_card_integration_id: string | null;
  paymob_wallet_integration_id: string | null;
  paymob_iframe_id: string | null;
};

export default async function Settings({
  searchParams,
}: PageProps<"/admin/settings">) {
  const [{ db, storeId, activeStore, permissions }, lang, params] = await Promise.all([
    requireAdmin("manage_settings"),
    getServerLang(),
    searchParams,
  ]);
  const isEn = lang === "en";
  const s = checked(
    await db
      .from("store_settings")
      .select(
        "store_id,store_name,shipping_fee,default_max_order_qty,currency,whatsapp_number,banners,theme_template,cod_enabled,paymob_enabled,paymob_card_enabled,paymob_wallet_enabled,cart_incentive_enabled,free_shipping_threshold,cashback_enabled,cashback_percentage,return_window_days",
      )
      .eq("store_id", storeId)
      .single<StoreSettingsRow>(),
  );

  // Fetch secret presence flags ONLY — NEVER pass raw secrets into HTML inputs
  const { data: secretRow } = await db
    .from("store_payment_secrets")
    .select(
      "paymob_api_key,paymob_hmac_secret,paymob_card_integration_id,paymob_wallet_integration_id,paymob_iframe_id",
    )
    .eq("store_id", s.store_id)
    .maybeSingle<PaymentSecretRow>();

  const hasApiKey = Boolean(secretRow?.paymob_api_key?.trim());
  const hasHmacSecret = Boolean(secretRow?.paymob_hmac_secret?.trim());

  const label = (english: string, arabic: string) => isEn ? english : arabic;
  return <div className="ws-page ws-settings-page">
    <OnboardingStepMarker storeId={storeId} step="settingsDone" active={params.result === "ok"} />
    <WorkspaceHeading title={label("Store settings", "إعدادات المتجر")} description={label("Manage the details your customers see at checkout and in your storefront.", "اضبط تفاصيل المتجر التي يراها عملاؤك أثناء التسوّق وعند الدفع.")} />
    <Notice result={params.result} />
    <nav className="ws-settings-nav" aria-label={label("Settings sections", "أقسام الإعدادات")}>
      <a href="#general">{label("Store details", "بيانات المتجر")}</a><a href="#payments">{label("Payments", "الدفع")}</a>
      <a href="#rewards">{label("Shipping and rewards", "الشحن والمكافآت")}</a><a href="#templates">{label("Appearance", "المظهر")}</a>
      {permissions.manage_domains && <a href="#domains">{label("Domains", "النطاقات")}</a>}
    </nav>
    <section className="ws-box" id="general"><h2>{label("Store details", "بيانات المتجر")}</h2>
      <form className="fields" action={saveSettings}>
        <label>{label("Store name", "اسم المتجر")}<input name="store_name" dir="auto" defaultValue={s.store_name} required /></label>
        <label>{label("WhatsApp number", "رقم واتساب")}<input type="tel" dir="ltr" name="whatsapp_number" defaultValue={s.whatsapp_number} /></label>
        <label><span>{label("Delivery fee", "رسوم التوصيل")} (<bdi dir="ltr">{s.currency}</bdi>)</span>
          <input type="number" dir="ltr" name="shipping_fee" min="0" step=".01" defaultValue={s.shipping_fee} required /></label>
        <label>{label("Return window in days", "مهلة الإرجاع بالأيام")}<input type="number" dir="ltr" name="return_window_days" min="0" max="365" step="1"
          defaultValue={s.return_window_days ?? 14} required /><small>{label("Enter 0 for unlimited returns.", "أدخل صفراً لترك مهلة الإرجاع مفتوحة.")}</small></label>
        <label>{label("Quantity limit per product per order", "الحد الأقصى لكمية المنتج في الطلب")}<input type="number" dir="ltr" name="default_max_order_qty" min="1" max="2147483647" step="1"
          defaultValue={s.default_max_order_qty ?? ""} /><small>{label("Leave blank to use available stock.", "اترك الحقل فارغاً للسماح بالكمية المتاحة في المخزون.")}</small></label>
        <label className="wide">{label("Homepage banner images", "صور واجهة المتجر")}<textarea name="banners" dir="ltr" rows={3} defaultValue={s.banners.join("\n")} />
          <small>{label("Enter one HTTPS image address per line, in display order.", "أدخل رابط صورة آمن في كل سطر بحسب ترتيب العرض.")}</small></label>
        <div className="wide ws-rule"><SubmitButton className="ws-primary">{label("Save store details", "حفظ بيانات المتجر")}</SubmitButton></div>
      </form>
    </section>
    <section className="ws-box" id="payments"><h2>{label("Payment methods", "طرق الدفع")}</h2>
      <p>{label("Choose how customers can pay. Paymob accepts bank cards and Egyptian mobile wallets.", "اختر طرق الدفع المتاحة لعملائك. تدعم باي موب البطاقات البنكية والمحافظ الإلكترونية المصرية.")}</p>
      <form className="fields" action={savePaymentSettings}>
        {([
          ["cod_enabled", label("Cash on delivery", "الدفع عند الاستلام"), s.cod_enabled ?? true],
          ["paymob_enabled", label("Paymob online payments", "الدفع الإلكتروني عبر باي موب"), s.paymob_enabled ?? false],
          ["paymob_card_enabled", label("Bank cards", "البطاقات البنكية"), s.paymob_card_enabled ?? false],
          ["paymob_wallet_enabled", label("Egyptian mobile wallets", "المحافظ الإلكترونية المصرية"), s.paymob_wallet_enabled ?? false],
        ] as const).map(([name, title, enabled]) => <label className="check" key={name}><input type="checkbox" name={name} defaultChecked={enabled} />{title}</label>)}
        <div className="wide ws-rule"><h3>{label("Paymob credentials", "بيانات الربط مع باي موب")}</h3>
          <small>{label("Leave a saved key blank to keep using it.", "اترك حقل المفتاح المحفوظ فارغاً لمواصلة استخدامه.")}</small></div>
        {([
          ["paymob_api_key", label("API key", "مفتاح الواجهة البرمجية"), hasApiKey],
          ["paymob_hmac_secret", label("HMAC secret", "مفتاح توقيع HMAC"), hasHmacSecret],
        ] as const).map(([name, title, saved]) => <label key={name}><span className="ws-section-line">{title}
          {saved && <StatusDot status="verified">{label("Saved", "محفوظ")}</StatusDot>}</span>
          <input type="password" name={name} dir="ltr" autoComplete="new-password" defaultValue="" /></label>)}
        {([
          ["paymob_card_integration_id", label("Card integration ID", "معرّف ربط البطاقات")],
          ["paymob_wallet_integration_id", label("Wallet integration ID", "معرّف ربط المحافظ")],
          ["paymob_iframe_id", label("Payment iframe ID", "معرّف نافذة الدفع")],
        ] as const).map(([name, title]) => <label key={name}>{title}<input name={name} dir="ltr" defaultValue={secretRow?.[name] ?? ""} /></label>)}
        <div className="wide ws-rule"><SubmitButton className="ws-primary">{label("Save payment methods", "حفظ طرق الدفع")}</SubmitButton></div>
      </form>
    </section>
    <section className="ws-box" id="rewards"><h2>{label("Shipping and rewards", "الشحن والمكافآت")}</h2>
      <p>{label("Set the spend needed for free shipping and the cashback credited after delivery.", "حدّد المبلغ المطلوب للشحن المجاني ونسبة الرصيد الذي يُضاف إلى محفظة العميل بعد التسليم.")}</p>
      <form className="fields" action={saveWalletIncentiveSettings}>
        <label className="check"><input type="checkbox" name="cart_incentive_enabled" defaultChecked={s.cart_incentive_enabled ?? true} />{label("Show free-shipping progress in the cart", "عرض المبلغ المتبقي للشحن المجاني في السلة")}</label>
        <label className="check"><input type="checkbox" name="cashback_enabled" defaultChecked={s.cashback_enabled ?? true} />{label("Credit cashback automatically", "إضافة الرصيد تلقائياً إلى المحفظة")}</label>
        <label><span>{label("Free-shipping threshold", "الحد الأدنى للشحن المجاني")} (<bdi dir="ltr">{s.currency}</bdi>)</span>
          <input type="number" name="free_shipping_threshold" dir="ltr" min="0" step="1" defaultValue={s.free_shipping_threshold ?? 1000} required /></label>
        <label>{label("Cashback percentage", "نسبة الرصيد المسترد")}<input type="number" name="cashback_percentage" dir="ltr" min="0" max="50" step="0.5"
          defaultValue={s.cashback_percentage ?? 5} required /><small><bdi dir="ltr">0–50%</bdi></small></label>
        <div className="wide ws-rule"><SubmitButton className="ws-primary">{label("Save shipping and rewards", "حفظ الشحن والمكافآت")}</SubmitButton></div>
      </form>
    </section>
    <div id="templates"><TemplateGallery active={isTemplate(s.theme_template) ? s.theme_template : "modern-minimal"} /></div>
    {permissions.manage_domains && <div id="domains"><DomainSettings storeId={storeId} slug={activeStore.slug} en={isEn} /></div>}
  </div>;
}
