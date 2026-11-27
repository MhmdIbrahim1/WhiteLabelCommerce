import { notFound, redirect } from "next/navigation";
import { TenantAuthShell } from "@/components/shop/tenant-auth-shell";
import { LogoutForm } from "@/components/auth-session";
import { OnboardingForm } from "@/components/shop/onboarding-form";
import { authEntry, safeStorefrontNext, verifiedEmailUser } from "@/lib/auth-flow";
import { requestUser, serverDb } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { localizedText } from "@/lib/i18n";
import { settings } from "@/lib/shop";
import { authStorefront, googleProfileName, storeCustomerEnrolled } from "@/lib/storefront-auth";
import { storeHref } from "@/lib/tenant-shared";

export const metadata = { referrer: "no-referrer" as const, robots: { index: false, follow: false } };

export default async function Welcome({ searchParams }: PageProps<"/welcome">) {
  const [store, query, user, db] = await Promise.all([authStorefront(), searchParams, requestUser(), serverDb()]);
  if (!store) notFound();
  const next = safeStorefrontNext(query.next, store.basePath, store.slug);
  if (!verifiedEmailUser(user)) redirect(authEntry(store.basePath, "/login", next));
  if (await storeCustomerEnrolled(db, store.id)) redirect(next || storeHref(store.basePath, "/account"));
  const [shop, initialName] = await Promise.all([settings(), googleProfileName(db, user)]);
  const lang = await getServerLang(shop.uiConfig.defaultLanguage);
  const en = lang === "en";
  const storeName = localizedText(lang, shop.nameAr, shop.nameEn) || shop.name;
  return <TenantAuthShell>
    <h1>{en ? "Complete your profile for " : "أكمل بياناتك لمتجر "}<bdi dir="auto">{storeName}</bdi></h1>
    <div className="welcome-identity"><bdi dir="ltr">{user.email}</bdi>
      <LogoutForm storeLoginNext={next}>{en ? "Use a different account" : "استخدم حساباً آخر"}</LogoutForm></div>
    <OnboardingForm key={user.id} expectedUserId={user.id} initialName={initialName} next={next} />
  </TenantAuthShell>;
}
