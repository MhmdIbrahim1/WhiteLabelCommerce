import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Heart, LifeBuoy, LogOut, MapPin, Pencil, Settings2, ShoppingBag, UserRound, Wallet } from "lucide-react";
import { AddressBook } from "@/components/shop/address-book";
import { WalletSection, type WalletSummaryData } from "@/components/shop/wallet-section";
import { ToastFeedback } from "@/components/floating-toast";
import { LanguageToggle } from "@/components/language-provider";
import { EgyptAddressFields } from "@/components/shop/egypt-address-fields";
import { HybridAuthPanel } from "@/components/shop/hybrid-auth-panel";
import { authEntry, safeStorefrontNext, verifiedEmailUser, welcomeHref } from "@/lib/auth-flow";
import { storeCustomerEnrolled } from "@/lib/storefront-auth";
import { PLATFORM_SURFACE_HEADER } from "@/lib/tenant-shared";
import { serverDb, checked } from "@/lib/db";
import { settings } from "@/lib/shop";
import { storeHref } from "@/lib/tenant";
import { getServerLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { LogoutForm } from "@/components/auth-session";
import { saveCustomerAccount } from "../../login/actions";
import { CustomerTickets } from "./customer-tickets";
import "./account.css";

export default async function AccountPage({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  const [params, store, db] = await Promise.all([searchParams, settings(), serverDb()]);
  const [lang, { data: { user } }] = await Promise.all([getServerLang(store.uiConfig.defaultLanguage), db.auth.getUser()]);
  const href = (path: string) => storeHref(store.basePath, path);
  if (params.section === "security") redirect(href("/account"));
  const section = typeof params.section === "string" && ["profile", "addresses", "tickets", "wallet", "preferences"].includes(params.section)
    ? params.section : params.result ? "profile" : "";
  const ticket = section === "tickets" && typeof params.ticket === "string" ? params.ticket : "";
  const currentPath = href("/account" + (section ? "/" + section : "")) + (ticket ? "?ticket=" + encodeURIComponent(ticket) : "");
  if (!verifiedEmailUser(user)) {
    const next = safeStorefrontNext(params.next, store.basePath, store.slug) || currentPath;
    if ((await headers()).get(PLATFORM_SURFACE_HEADER) === "platform") redirect(authEntry(store.basePath, "/login", next));
    const error = typeof params.error === "string" ? params.error : "";
    return (
      <section className="account-auth-wrap">
        <div className="panel account-auth-card">
          <div className="auth-heading">
            <h1>
              {lang === "en"
                ? "My Account & Order Sync"
                : "حسابي ومزامنة الطلبات"}
            </h1>
            <p>
              {lang === "en"
                ? "Sign in to save your shipping details and track orders from this store."
                : "سجّل الدخول لحفظ بيانات الشحن ومتابعة طلباتك في هذا المتجر."}
            </p>
          </div>

          <HybridAuthPanel
            nextPath={next}
            basePath={store.basePath}
            initialError={error}
          />
        </div>
      </section>
    );
  }

  if (!(await storeCustomerEnrolled(db, store.storeId))) redirect(welcomeHref(store.basePath, currentPath));
  const en = lang === "en";
  const view = section;
  const { data: profile } = await db.from("store_customers").select("full_name,email,phone,governorate,city,address")
    .eq("store_id", store.storeId).eq("user_id", user.id).maybeSingle();
  const name = profile?.full_name || user.email?.split("@")[0] || (en ? "My account" : "حسابي");
  const tiles = [
    { key: "orders", icon: ShoppingBag, label: en ? "My Orders" : "طلباتي", path: "/orders" },
    { key: "addresses", icon: MapPin, label: en ? "Saved Addresses" : "عناويني", path: "/account/addresses" },
    { key: "tickets", icon: LifeBuoy, label: en ? "Support Tickets" : "تذاكر الدعم", path: "/account/tickets" },
    { key: "wishlist", icon: Heart, label: en ? "Wishlist" : "المفضلة", path: "/wishlist" },
  ];
  const groups = [
    { key: "profile", icon: UserRound, label: en ? "Personal information" : "بياناتي الشخصية" },
    { key: "preferences", icon: Settings2, label: en ? "Preferences" : "التفضيلات" },
    { key: "wallet", icon: Wallet, label: en ? "Store wallet" : "محفظة المتجر" },
  ];
  const Arrow = en ? ArrowRight : ArrowLeft;
  const account = en ? "My Account" : "حسابي";
  if (!view) {
    const counts = checked(await db.rpc("my_account_counts", { p_store_id: store.storeId })) as Record<string, number>;
    return <section className="account-hub">
      <h1>{account}</h1>
      <header className="hub-profile"><span className="hub-avatar" aria-hidden="true">{Array.from(String(name).trim())[0]}</span>
        <div><h2 dir="auto">{name}</h2><p><bdi dir="ltr">{user.email}</bdi></p>{profile?.phone && <small><bdi dir="ltr">{profile.phone}</bdi></small>}</div>
        <Link href={href("/account/profile")}><Pencil size={16}/>{en ? "Edit profile" : "تعديل الحساب"}</Link>
      </header>
      <nav className="hub-tiles" aria-label={en ? "Quick access" : "وصول سريع"}>{tiles.map(({ key, icon: Icon, label, path }) =>
        <Link key={key} href={href(path)}><Icon size={23}/><strong>{label}</strong><span><bdi dir="ltr">{Number(counts[key] ?? 0).toLocaleString(lang)}</bdi></span></Link>)}</nav>
      <nav className="hub-settings" aria-label={en ? "Account settings" : "إعدادات الحساب"}>
        {groups.map(({ key, icon: Icon, label }) => <Link key={key} href={href("/account/"+key)}><Icon size={19}/>{label}<Arrow size={16}/></Link>)}
        <LogoutForm><LogOut size={18}/>{t(lang, "navLogout")}</LogoutForm>
      </nav>
    </section>;
  }
  const heading = [...tiles, ...groups].find(item => item.key === view)?.label || account;
  let content;
  if (view === "profile") {
    const result = params.result;
    content = <>{result && <ToastFeedback kind={result === "saved" ? "success" : "error"} message={result === "saved"
      ? en ? "Profile saved." : "تم حفظ بياناتك."
      : result === "phone_in_use" || result === "phone_unavailable" ? en ? "Choose a different phone number." : "أدخل رقم هاتف آخر."
      : en ? "Check your name, phone and address." : "تحقق من الاسم والهاتف والعنوان."} />}
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
    </>;
  } else if (view === "addresses") {
    const addresses = checked(await db.rpc("my_addresses", {p_store_id: store.storeId}));
    content = <AddressBook storeId={store.storeId} initial={addresses} profile={{recipient_name: profile?.full_name || "", phone: profile?.phone || ""}} />;
  } else if (view === "wallet") {
    const wallet = checked(await db.rpc("get_customer_wallet_summary", {p_store_id: store.storeId, p_user_id: user.id})) as WalletSummaryData;
    content = <WalletSection summary={wallet} />;
  } else if (view === "tickets") {
    content = <CustomerTickets lang={lang} userId={user.id} storeId={store.storeId} basePath={store.basePath} ticketId={ticket} />;
  } else content = <LanguageToggle className="lang-toggle-pill"/>;
  return <section className="account-hub hub-spoke"><Link className="section-more-link" href={href("/account")}>{account}</Link>
    <h1>{heading}</h1><section className="panel hub-content">{content}</section></section>;
}
