import Link from "next/link";
import {
  UserRound,
  ShoppingBag,
  Wallet,
  PackageCheck,
  ArrowLeft,
  ArrowRight,
  LogOut,
  Sparkles,
  LockKeyhole,
  Heart,
} from "lucide-react";
import { serverDb, checked } from "@/lib/db";
import { money } from "@/lib/brand";
import { settings } from "@/lib/shop";
import { storeHref } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { Timeline } from "@/components/shop/tracking";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";
import { EgyptAddressFields } from "@/components/shop/egypt-address-fields";
import {
  WalletSection,
  type WalletSummaryData,
} from "@/components/shop/wallet-section";
import type { Summary } from "../orders/actions";
import { logout, saveCustomerAccount } from "../../login/actions";

type CustomerProfileRow = {
  full_name: string;
  phone: string;
  email: string;
  governorate: string;
  city: string;
  address: string;
};

type AccountOrderRow = Summary & {
  total: number | null;
  currency: string;
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, store, lang, db] = await Promise.all([
    searchParams,
    settings(),
    getServerLang(),
    serverDb(),
  ]);
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    const error = typeof params.error === "string" ? params.error : "";
    const registered =
      typeof params.registered === "string" ? params.registered : "";
    return (
      <section className="account-auth-wrap">
        <div className="panel account-auth-card">
          <div className="auth-heading">
            <span className="auth-pill">
              <Sparkles size={13} /> {t(lang, "authSecurePill")}
            </span>
            <h1>
              {lang === "en"
                ? "My Account & Order Sync"
                : "حسابي ومزامنة الطلبات"}
            </h1>
            <p>
              {lang === "en"
                ? "Sign in with a 6-digit email OTP code or password to auto-fill checkout, link past guest orders, and sync across web & mobile."
                : "سجّل الدخول برمز تحقق من 6 أرقام أو كلمة المرور لملء بيانات الشحن تلقائياً، ربط طلباتك السابقة، والمزامنة بين الموقع والتطبيق."}
            </p>
          </div>

          <HybridAuthPanel
            nextPath="/account"
            storeName={store.name}
            initialError={error}
            initialRegistered={registered}
          />

          <footer className="auth-footer">
            <LockKeyhole size={14} /> {t(lang, "authFooterNote")}
          </footer>
        </div>
      </section>
    );
  }

  const [profileRes, ordersRes, walletRes] = await Promise.all([
    db
      .from("store_customers")
      .select("full_name,phone,email,governorate,city,address")
      .eq("store_id", store.storeId)
      .eq("user_id", user.id)
      .maybeSingle<CustomerProfileRow>(),
    db
      .from("orders")
      .select(
        "id,status,created_at,total,currency,payment_method,payment_status,shipping_carrier,tracking_number,tracking_url,courier_note,shipped_at,delivered_at,order_items(id,product_name,quantity,unit_price,size,color)",
      )
      .eq("store_id", store.storeId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    db.rpc("get_customer_wallet_summary", {
      p_store_id: store.storeId,
      p_user_id: user.id,
    }),
  ]);

  const rawWallet = (!walletRes.error && walletRes.data
    ? (walletRes.data as Partial<WalletSummaryData>)
    : null);
  const walletSummary: WalletSummaryData = {
    balance: Math.max(0, Number(rawWallet?.balance ?? 0)),
    currency: String(rawWallet?.currency || store.currency),
    cashback_enabled:
      rawWallet?.cashback_enabled ?? store.incentives.cashbackEnabled,
    cashback_percentage: Number(
      rawWallet?.cashback_percentage ?? store.incentives.cashbackPercentage,
    ),
    transactions: Array.isArray(rawWallet?.transactions)
      ? rawWallet.transactions
      : [],
  };

  const ArrowIcon = lang === "en" ? ArrowRight : ArrowLeft;
  const profile = profileRes.data;
  const allOrders = (checked(ordersRes) as AccountOrderRow[]) ?? [];
  const totalOrders = allOrders.length;
  const deliveredOrders = allOrders.filter((o) => o.status === "delivered");
  const totalSpent = deliveredOrders.reduce(
    (sum, o) => sum + Number(o.total ?? 0),
    0,
  );
  const result = typeof params.result === "string" ? params.result : "";

  return (
    <>
      <div className="split section-head">
        <div>
          <span className="section-kicker">{t(lang, "accountKicker")}</span>
          <h1>
            {t(lang, "accountHello")}{" "}
            {profile?.full_name || user.email?.split("@")[0] || ""}
          </h1>
          <p dir="ltr" style={{ marginTop: "0.2rem" }}>
            {user.email}
          </p>
        </div>
        <div className="actions">
          <Link
            href={storeHref(store.basePath, "/wishlist")}
            className="section-more-link"
          >
            <Heart size={15} />
            <span>{t(lang, "navWishlist")}</span>
          </Link>
          <Link
            href={storeHref(store.basePath, "/orders")}
            className="section-more-link"
          >
            <span>{t(lang, "accountAllOrders")}</span>
            <ArrowIcon size={15} />
          </Link>
          <form action={logout} style={{ margin: 0 }}>
            <button className="orders-logout-btn">
              <LogOut size={15} /> {t(lang, "navLogout")}
            </button>
          </form>
        </div>
      </div>

      <div className="account-kpis shop-animate">
        <article className="panel account-kpi-card">
          <span className="trust-icon">
            <ShoppingBag size={18} />
          </span>
          <div>
            <small>{t(lang, "accountTotalOrders")}</small>
            <strong>{totalOrders}</strong>
          </div>
        </article>
        <article className="panel account-kpi-card">
          <span className="trust-icon">
            <PackageCheck size={18} />
          </span>
          <div>
            <small>{t(lang, "accountDelivered")}</small>
            <strong>{deliveredOrders.length}</strong>
          </div>
        </article>
        <article className="panel account-kpi-card">
          <span className="trust-icon">
            <Wallet size={18} />
          </span>
          <div>
            <small>{t(lang, "accountTotalSpent")}</small>
            <strong>{money(totalSpent, store.currency, lang)}</strong>
          </div>
        </article>
      </div>

      <WalletSection summary={walletSummary} />

      <div className="details-grid" style={{ marginTop: "1.75rem" }}>
        <section className="panel">
          <div className="split" style={{ marginBottom: "0.75rem" }}>
            <h2
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
            >
              <UserRound size={18} /> {t(lang, "accountProfileTitle")}
            </h2>
          </div>

          {result === "saved" && (
            <p className="account-notice account-notice--ok" role="status">
              {lang === "en"
                ? "Profile saved and any matching guest orders were linked."
                : "تم حفظ بياناتك وربط أي طلبات سابقة مطابقة لرقم هاتفك أو بريدك."}
            </p>
          )}
          {(result === "error" ||
            result === "phone_error" ||
            result === "phone_in_use") && (
            <p className="account-notice account-notice--error" role="alert">
              {result === "phone_error"
                ? lang === "en"
                  ? "Enter a valid 8–15 digit phone number."
                  : "تحقق من رقم الهاتف (8 إلى 15 رقماً)."
                : result === "phone_in_use"
                  ? lang === "en"
                    ? "This phone number is already linked to another account."
                    : "رقم الهاتف مسجل بالفعل بحساب آخر."
                  : lang === "en"
                    ? "Could not save profile. Please try again."
                    : "تعذر حفظ البيانات. أعد المحاولة."}
            </p>
          )}

          <form action={saveCustomerAccount}>
            <label>
              {t(lang, "fullNameLabel")}
              <input
                name="full_name"
                defaultValue={profile?.full_name ?? ""}
                placeholder={t(lang, "fullNameLabel")}
                maxLength={100}
              />
            </label>
            <label>
              {t(lang, "deliveryPhone")}
              <input
                name="phone"
                type="tel"
                dir="ltr"
                defaultValue={profile?.phone ?? ""}
                placeholder="01012345678"
                maxLength={24}
              />
            </label>
            <EgyptAddressFields
              initialGovernorate={profile?.governorate ?? ""}
              initialCity={profile?.city ?? ""}
              initialStreet={profile?.address ?? ""}
            />
            <button>{t(lang, "accountSaveBtn")}</button>
          </form>
        </section>

        <section className="panel order-panel">
          <div className="split" style={{ marginBottom: "0.75rem" }}>
            <h2>{t(lang, "accountRecentOrders")}</h2>
            <Link
              href={storeHref(store.basePath, "/orders")}
              className="section-more-link"
            >
              {t(lang, "viewAll")} <ArrowIcon size={14} />
            </Link>
          </div>
          {allOrders.length > 0 ? (
            <div className="orders-list">
              {allOrders.slice(0, 4).map((o, idx) => (
                <Timeline key={o.id} row={o} index={idx} />
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "0.85rem",
                marginTop: "0.75rem",
              }}
            >
              <p>{t(lang, "accountNoOrders")}</p>
              <Link href={storeHref(store.basePath, "/products")} className="cta">
                {t(lang, "heroShopProducts")}
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
