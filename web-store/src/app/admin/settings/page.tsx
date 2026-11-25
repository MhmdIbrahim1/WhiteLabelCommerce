import { ShieldCheck, Wallet } from "lucide-react";
import { checked, requireAdmin } from "@/lib/db";
import {
  savePaymentSettings,
  saveSettings,
  saveWalletIncentiveSettings,
} from "../mutations";
import { TemplateGallery } from "./template-gallery";
import { isTemplate } from "@/lib/theme-templates";
import { getServerLang } from "@/lib/i18n-server";
import { Notice } from "../ui";

type StoreSettingsRow = {
  store_id: string;
  store_name: string;
  currency: string;
  shipping_fee: number;
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
  const [{ db }, lang, params] = await Promise.all([
    requireAdmin(),
    getServerLang(),
    searchParams,
  ]);
  const isEn = lang === "en";
  const s = checked(
    await db
      .from("store_settings")
      .select(
        "store_id,store_name,shipping_fee,currency,whatsapp_number,banners,theme_template,cod_enabled,paymob_enabled,paymob_card_enabled,paymob_wallet_enabled,cart_incentive_enabled,free_shipping_threshold,cashback_enabled,cashback_percentage",
      )
      .eq("id", true)
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

  return (
    <>
      <h1>{isEn ? "Store Settings" : "إعدادات المتجر"}</h1>
      <Notice result={params.result} />
      <TemplateGallery
        active={
          isTemplate(s.theme_template) ? s.theme_template : "modern-minimal"
        }
      />

      {/* Payment Gateways (Multi-tenant Paymob + COD) */}
      <section className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "0.5rem",
          }}
        >
          <h2 style={{ margin: 0 }}>
            {isEn ? "Payment Gateways" : "بوابات الدفع"}
          </h2>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#15803d",
              background: "rgba(21, 128, 61, 0.1)",
              padding: "0.25rem 0.65rem",
              borderRadius: "999px",
            }}
          >
            <ShieldCheck size={14} />
            {isEn ? "Tenant-Isolated Credentials" : "بيانات معزولة ومؤمّنة للمتجر"}
          </span>
        </div>
        <p style={{ marginTop: 0, opacity: 0.78, fontSize: "0.9rem" }}>
          {isEn
            ? "Enable Cash on Delivery and Paymob online payments (Visa / Mastercard & Egyptian Mobile Wallets). Saved secret keys are never returned to the browser."
            : "فعّل الدفع عند الاستلام والدفع الإلكتروني عبر باي موب (البطاقات البنكية والمحافظ الإلكترونية المصرية). المفاتيح السرية المحفوظة لا تُعرض في المتصفح أبداً."}
        </p>

        <form className="fields" action={savePaymentSettings}>
          <label className="check">
            <input
              type="checkbox"
              name="cod_enabled"
              defaultChecked={s.cod_enabled ?? true}
            />{" "}
            {isEn ? "Enable Cash on Delivery (COD)" : "تفعيل الدفع عند الاستلام"}
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="paymob_enabled"
              defaultChecked={s.paymob_enabled ?? false}
            />{" "}
            {isEn
              ? "Enable Paymob Online Gateway"
              : "تفعيل بوابة الدفع الإلكتروني باي موب"}
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="paymob_card_enabled"
              defaultChecked={s.paymob_card_enabled ?? false}
            />{" "}
            {isEn
              ? "Accept Visa / Mastercard (Card Iframe)"
              : "قبول البطاقات البنكية (فيزا / ماستركارد)"}
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="paymob_wallet_enabled"
              defaultChecked={s.paymob_wallet_enabled ?? false}
            />{" "}
            {isEn
              ? "Accept Egyptian Mobile Wallets"
              : "قبول المحافظ الإلكترونية المصرية"}
          </label>

          <label className="wide">
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <span>{isEn ? "Paymob API Key" : "مفتاح واجهة برمجة باي موب"}</span>
              {hasApiKey && (
                <small
                  style={{
                    color: "#15803d",
                    fontWeight: 700,
                    background: "rgba(21, 128, 61, 0.1)",
                    padding: "0.15rem 0.55rem",
                    borderRadius: "999px",
                  }}
                >
                  {isEn ? "Configured ••••••" : "محفوظ ومشفّر ••••••"}
                </small>
              )}
            </span>
            <input
              type="password"
              name="paymob_api_key"
              dir="ltr"
              autoComplete="new-password"
              defaultValue=""
              placeholder={
                hasApiKey
                  ? isEn
                    ? "Leave blank to keep existing secret key"
                    : "اتركه فارغاً للإبقاء على المفتاح المحفوظ"
                  : isEn
                    ? "Enter Paymob API Key"
                    : "أدخل مفتاح واجهة باي موب"
              }
            />
          </label>

          <label className="wide">
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <span>
                {isEn ? "Paymob HMAC Secret" : "مفتاح التوقيع السري لباي موب"}
              </span>
              {hasHmacSecret && (
                <small
                  style={{
                    color: "#15803d",
                    fontWeight: 700,
                    background: "rgba(21, 128, 61, 0.1)",
                    padding: "0.15rem 0.55rem",
                    borderRadius: "999px",
                  }}
                >
                  {isEn ? "Configured ••••••" : "محفوظ ومشفّر ••••••"}
                </small>
              )}
            </span>
            <input
              type="password"
              name="paymob_hmac_secret"
              dir="ltr"
              autoComplete="new-password"
              defaultValue=""
              placeholder={
                hasHmacSecret
                  ? isEn
                    ? "Leave blank to keep existing HMAC secret"
                    : "اتركه فارغاً للإبقاء على مفتاح التوقيع المحفوظ"
                  : isEn
                    ? "Enter Paymob HMAC Secret"
                    : "أدخل مفتاح التوقيع السري"
              }
            />
          </label>

          <label>
            {isEn ? "Card Integration ID" : "معرّف ربط البطاقات البنكية"}
            <input
              type="text"
              name="paymob_card_integration_id"
              dir="ltr"
              defaultValue={secretRow?.paymob_card_integration_id ?? ""}
              placeholder={isEn ? "e.g. 6075764" : "مثال: 6075764"}
            />
          </label>

          <label>
            {isEn ? "Wallet Integration ID" : "معرّف ربط المحافظ الإلكترونية"}
            <input
              type="text"
              name="paymob_wallet_integration_id"
              dir="ltr"
              defaultValue={secretRow?.paymob_wallet_integration_id ?? ""}
              placeholder={isEn ? "e.g. 6075775" : "مثال: 6075775"}
            />
          </label>

          <label>
            {isEn ? "Card Iframe ID" : "معرّف نافذة دفع البطاقة"}
            <input
              type="text"
              name="paymob_iframe_id"
              dir="ltr"
              defaultValue={secretRow?.paymob_iframe_id ?? ""}
              placeholder={isEn ? "e.g. 1102311" : "مثال: 1102311"}
            />
          </label>

          <div className="wide">
            <button>
              {isEn ? "Save Payment Gateways" : "حفظ إعدادات بوابات الدفع"}
            </button>
          </div>
        </form>
      </section>

      {/* Free Shipping & Cashback Wallet Settings */}
      <section className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "0.5rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
            }}
          >
            <Wallet size={19} />
            {isEn
              ? "Free Shipping & Cashback Wallet"
              : "الشحن المجاني ومحفظة الكاش باك"}
          </h2>
        </div>
        <p style={{ marginTop: 0, opacity: 0.78, fontSize: "0.9rem" }}>
          {isEn
            ? "Boost average order value with a live free-shipping progress bar in the cart and reward repeat buyers with automatic cashback credit on delivered orders."
            : "ارفع متوسط قيمة الطلب عبر شريط التقدم للشحن المجاني في السلة، وكافئ عملاءك بكاش باك تلقائي يُضاف لمحفظتهم عند اكتمال كل طلب."}
        </p>

        <form className="fields" action={saveWalletIncentiveSettings}>
          <label className="check">
            <input
              type="checkbox"
              name="cart_incentive_enabled"
              defaultChecked={s.cart_incentive_enabled ?? true}
            />{" "}
            {isEn
              ? "Enable Free-Shipping Cart Progress Bar"
              : "تفعيل شريط التقدم للشحن المجاني في السلة"}
          </label>

          <label className="check">
            <input
              type="checkbox"
              name="cashback_enabled"
              defaultChecked={s.cashback_enabled ?? true}
            />{" "}
            {isEn
              ? "Enable Automatic Cashback Wallet"
              : "تفعيل نظام الكاش باك التلقائي للمحفظة"}
          </label>

          <label>
            {isEn
              ? `Free Shipping Threshold (${s.currency})`
              : `الحد الأدنى للشحن المجاني (${s.currency})`}
            <input
              type="number"
              name="free_shipping_threshold"
              min="0"
              step="1"
              defaultValue={s.free_shipping_threshold ?? 1000}
              required
            />
          </label>

          <label>
            {isEn
              ? "Cashback Percentage (% · 0–50)"
              : "نسبة الكاش باك (% · من 0 إلى 50)"}
            <input
              type="number"
              name="cashback_percentage"
              min="0"
              max="50"
              step="0.5"
              defaultValue={s.cashback_percentage ?? 5}
              required
            />
          </label>

          <div className="wide">
            <button>
              {isEn
                ? "Save Free Shipping & Wallet Settings"
                : "حفظ إعدادات الشحن المجاني والمحفظة"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>{isEn ? "Store Details" : "بيانات المتجر"}</h2>
        <form className="fields" action={saveSettings}>
          <label>
            {isEn ? "Store Name" : "اسم المتجر"}
            <input name="store_name" defaultValue={s.store_name} required />
          </label>
          <label>
            {isEn
              ? `Shipping Fee (${s.currency})`
              : `رسوم الشحن (${s.currency})`}
            <input
              type="number"
              name="shipping_fee"
              min="0"
              step=".01"
              defaultValue={s.shipping_fee}
              required
            />
          </label>
          <label>
            {isEn ? "WhatsApp Number" : "رقم واتساب"}
            <input
              type="tel"
              dir="ltr"
              name="whatsapp_number"
              defaultValue={s.whatsapp_number}
            />
          </label>
          <label className="wide">
            {isEn
              ? "Hero Banner Image URLs · one HTTPS URL per line"
              : "روابط صور البانرات · رابط آمن في كل سطر"}
            <textarea
              name="banners"
              dir="ltr"
              rows={5}
              defaultValue={s.banners.join("\n")}
            />
          </label>
          <button>{isEn ? "Save Settings" : "حفظ الإعدادات"}</button>
        </form>
      </section>
    </>
  );
}
