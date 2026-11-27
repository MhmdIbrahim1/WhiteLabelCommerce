"use client";

import { CartLines, useBasketContents } from "./cart-lines";
import { StoreCopy } from "./store-copy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import {
  TicketPercent,
  X,
  Banknote,
  CreditCard,
  Smartphone,
  ShieldCheck,
  Loader2,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import {
  purchased,
  setPendingOnlineOrder,
  lineEffectivePrice,
  syncAbandonedCartContact,
  markWebCartRecovered,
  checkoutAttemptKey,
} from "./cart-store";
import { trackInitiateCheckout, trackPurchase } from "@/lib/analytics";
import {
  checkout,
  previewCoupon,
  type CheckoutResult,
} from "@/app/(shop)/checkout/action";
import { money } from "@/lib/brand";
import type { StoreIncentives } from "@/lib/shop";
import { storeHref } from "@/lib/tenant-shared";
import { useLanguage } from "@/components/language-provider";
import { AddressBook } from "./address-book";
import type { SavedAddress, ShippingRates } from "@/lib/customer-address";
import { findEgyptGovernorate } from "@/lib/egypt-locations";
import { CartIncentiveBar } from "./cart-incentive-bar";
import { CartUpsellStrip } from "./cart-upsell-strip";

const EGYPT_WALLET_RE = /^01[0125][0-9]{8}$/;
const subscribeToHydration = () => () => {};

export type StorePaymentOptions = {
  codEnabled: boolean;
  paymobEnabled: boolean;
  paymobCardEnabled: boolean;
  paymobWalletEnabled: boolean;
};

type SelectedPayment = "cod" | "paymob_card" | "paymob_wallet";

export function Basket({
  order = false,
  storeId = "", addresses = [], rates = {}, signedIn = false,
  fee,
  currency,
  defaultName = "",
  defaultPhone = "",
  defaultGovernorate = "",
  defaultCity = "",
  defaultAddress = "",
  signedInEmail = null,
  paymentOptions = {
    codEnabled: true,
    paymobEnabled: false,
    paymobCardEnabled: false,
    paymobWalletEnabled: false,
  },
  incentives = {
    cartIncentiveEnabled: true,
    freeShippingThreshold: 1000,
    cashbackEnabled: true,
    cashbackPercentage: 5,
  },
  walletBalance = 0,
  basePath = "",
}: {
  order?: boolean;
  storeId?: string;
  addresses?: SavedAddress[];
  rates?: ShippingRates;
  signedIn?: boolean;
  fee: number;
  currency: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultGovernorate?: string;
  defaultCity?: string;
  defaultAddress?: string;
  signedInEmail?: string | null;
  paymentOptions?: StorePaymentOptions;
  incentives?: StoreIncentives;
  walletBalance?: number;
  basePath?: string;
}) {
  const router = useRouter();
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const basket = useBasketContents();
  const { tenant: tenantId, lines, subtotal, overLimit } = basket;

  const availableMethods: SelectedPayment[] = [];
  if (paymentOptions.codEnabled) availableMethods.push("cod");
  if (paymentOptions.paymobEnabled && paymentOptions.paymobCardEnabled) {
    availableMethods.push("paymob_card");
  }
  if (paymentOptions.paymobEnabled && paymentOptions.paymobWalletEnabled) {
    availableMethods.push("paymob_wallet");
  }

  const defaultMethod: SelectedPayment = availableMethods[0] ?? "cod";

  const [selectedPayment, setSelectedPayment] =
    useState<SelectedPayment>(defaultMethod);
  const [walletPhone, setWalletPhone] = useState(
    EGYPT_WALLET_RE.test(defaultPhone.replace(/\s+/g, ""))
      ? defaultPhone.replace(/\s+/g, "")
      : "",
  );
  const [walletError, setWalletError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [redirectingPayment, setRedirectingPayment] = useState(false);
  const [result, setResult] = useState<CheckoutResult>({});
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
  } | null>(null);
  const [couponMsg, setCouponMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const couponLock = useRef(false);
  const lock = useRef(false);
  const checkoutTrackedRef = useRef(false);

  const activePayment: SelectedPayment = availableMethods.includes(
    selectedPayment,
  )
    ? selectedPayment
    : defaultMethod;

  const discount = appliedCoupon
    ? Math.min(subtotal, appliedCoupon.discount)
    : 0;
  const freeShippingUnlocked =
    incentives.cartIncentiveEnabled &&
    incentives.freeShippingThreshold > 0 &&
    subtotal >= incentives.freeShippingThreshold;
  const [governorate, setGovernorate] = useState(addresses.find(a => a.is_default)?.governorate ?? findEgyptGovernorate(defaultGovernorate)?.id ?? "");
  const deliveryFee = rates[governorate] ?? fee;
  const effectiveFee = freeShippingUnlocked ? 0 : deliveryFee;
  const preWalletTotal = Math.max(0, subtotal - discount) + effectiveFee;
  const canUseWallet = Boolean(order && signedInEmail && walletBalance > 0);
  const walletApplied =
    canUseWallet && useWallet
      ? Math.min(walletBalance, preWalletTotal)
      : 0;
  const finalTotal = Math.max(0, preWalletTotal - walletApplied);
  const fullyPaidByWallet = walletApplied > 0 && finalTotal === 0;

  // Fire InitiateCheckout once when shopper lands on /checkout with items, and sync contact info
  useEffect(() => {
    if (!order || lines.length === 0) return;
    if (!checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true;
      trackInitiateCheckout({
        currency,
        value: subtotal,
        items: lines.map((l) => ({
          id: l.id,
          name: l.name,
          price: lineEffectivePrice(l),
          quantity: l.quantity,
          variant: [l.size, l.color].filter(Boolean).join(" / ") || undefined,
        })),
      });
    }
    syncAbandonedCartContact(tenantId, {
      name: defaultName,
      email: signedInEmail,
      phone: defaultPhone,
      currency,
    });
  }, [
    order,
    lines,
    subtotal,
    currency,
    defaultName,
    signedInEmail,
    defaultPhone,
    tenantId,
  ]);

  const handleApplyCoupon = async () => {
    if (!couponInput.trim() || couponLock.current) return;
    couponLock.current = true;
    setCheckingCoupon(true);
    setCouponMsg(null);
    try {
      const res = await previewCoupon(couponInput, subtotal);
      if (res.valid && res.code) {
        setAppliedCoupon({
          code: res.code,
          discount: res.discountAmount ?? 0,
        });
        setCouponMsg({
          ok: true,
          text: isEn
            ? `Coupon (${res.code}) applied successfully.`
            : res.message,
        });
      } else {
        setAppliedCoupon(null);
        setCouponMsg({ ok: false, text: res.message });
      }
    } catch {
      setCouponMsg({
        ok: false,
        text: isEn ? "Could not verify promo code." : "تعذر التحقق من الكوبون.",
      });
    } finally {
      couponLock.current = false;
      setCheckingCoupon(false);
    }
  };

  if (redirectingPayment)
    return (
      <section className="panel payment-redirect-screen" role="status" aria-live="polite">
        <div className="payment-redirect-icon">
          <Loader2 size={32} className="spin-icon" aria-hidden="true" />
        </div>
        <h1>{t("paymentRedirectingTitle")}</h1>
        <p>{t("paymentRedirectingSubtitle")}</p>
        <span className="payment-redirect-badge">
          <ShieldCheck size={15} aria-hidden="true" />
          {activePayment === "paymob_wallet"
            ? t("paymentWalletOption")
            : t("paymentCardOption")}
        </span>
      </section>
    );

  if (result.id)
    return (
      <section className="panel">
        <h1>{t("orderReceivedTitle")}</h1>
        <p>{t("orderReceivedNote")}</p>
        <p><bdi dir="ltr">{result.id}</bdi></p>
        <p><bdi dir="ltr">{money(result.total ?? null, result.currency, lang)}</bdi></p>
        <Link className="cta" href={storeHref(basePath, "/orders")}>
          {t("trackOrderBtn")}
        </Link>
      </section>
    );

  if (!hydrated) return <section className="panel" role="status" aria-busy="true">
    <h1>{order ? t("checkoutTitle") : t("cartTitle")}</h1>
    <p>{isEn ? "Loading your cart…" : "جارٍ تحميل سلتك…"}</p>
  </section>;

  if (!lines.length)
    return (
      <div className="panel">
        <h1>{t("cartEmpty")}</h1>
        <Link className="cta" href={storeHref(basePath, "/products")}>
          {t("heroShopProducts")}
        </Link>
      </div>
    );

  return (
    <>
      <header className="sf-purchase-head">
        <h1>{order ? t("checkoutTitle") : t("cartTitle")}</h1>
        <ol aria-label={t("checkoutTitle")}>
          <li aria-current={order ? undefined : "step"}><Link href={storeHref(basePath, "/cart")}>{t("stepReviewCart")}</Link></li>
          <li aria-current={order ? "step" : undefined}>{t("stepShippingPay")}</li>
          <li>{t("stepConfirm")}</li>
        </ol>
      </header>
      <CartIncentiveBar
        enabled={incentives.cartIncentiveEnabled}
        threshold={incentives.freeShippingThreshold}
        subtotal={subtotal}
        currency={currency}
      />
      {!order && (
        <CartUpsellStrip
          enabled={incentives.cartIncentiveEnabled}
          threshold={incentives.freeShippingThreshold}
          subtotal={subtotal}
          currency={currency}
          cartLines={lines}
          basePath={basePath}
        />
      )}
      <div className="sf-checkout-grid" data-order={order}>
        {order ? (
          <form id="store-checkout" className="sf-checkout-form panel"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                overLimit || lock.current ||
                (!fullyPaidByWallet && availableMethods.length === 0)
              )
                return;

              const effectivePaymentMethod = fullyPaidByWallet
                ? "wallet"
                : activePayment;
              const cleanWallet = walletPhone.replace(/\s+/g, "");
              if (
                effectivePaymentMethod === "paymob_wallet" &&
                !EGYPT_WALLET_RE.test(cleanWallet)
              ) {
                setWalletError(t("paymentWalletPhoneError"));
                e.currentTarget.querySelector<HTMLInputElement>('input[name="wallet_phone"]')?.focus();
                return;
              }
              setWalletError(null);
              setResult({});

              lock.current = true;
              setBusy(true);
              const f = new FormData(e.currentTarget);
              if (e.currentTarget.querySelector(".address-book fieldset:disabled")) { lock.current = false; setBusy(false); return; }
              const delivery = JSON.parse(String(f.get("delivery")));
              const recipient = String(f.get("recipient_name") || "").trim();
              const address = String(f.get("address")).trim(),
                phone = String(f.get("phone")),
                items = lines.map(({ id, quantity, size, color }) => ({
                  id,
                  quantity,
                  size,
                  color,
                }));
              try {
                const couponCode = appliedCoupon?.code ?? "";
                const useWalletFlag = canUseWallet && useWallet;
                const payload = JSON.stringify([
                  address,
                  phone, delivery, recipient,
                  items,
                  couponCode,
                  effectivePaymentMethod,
                  useWalletFlag,
                ]);
                const hash = Array.from(
                  new Uint8Array(
                    await crypto.subtle.digest(
                      "SHA-256",
                      new TextEncoder().encode(payload),
                    ),
                  ),
                )
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join("");
                const key = checkoutAttemptKey(tenantId, hash);
                const request =
                  localStorage.getItem(key) || crypto.randomUUID();
                localStorage.setItem(key, request);

                const receipt = await checkout(
                  request,
                  address,
                  phone,
                  effectivePaymentMethod,
                  items,
                  couponCode || undefined,
                  recipient || undefined,
                  useWalletFlag,
                  delivery,
                );

                if (!receipt.id) {
                  setResult(receipt);
                  return;
                }

                const purchasedPixelItems = lines.map((l) => ({
                  id: l.id,
                  name: l.name,
                  price: lineEffectivePrice(l),
                  quantity: l.quantity,
                  variant:
                    [l.size, l.color].filter(Boolean).join(" / ") || undefined,
                }));

                // Full Store Wallet Payment (remainingTotal === 0): skip Paymob, clear cart & confirm
                if (
                  effectivePaymentMethod === "wallet" ||
                  Number(receipt.total ?? 0) <= 0
                ) {
                  markWebCartRecovered(tenantId, receipt.id);
                  trackPurchase({
                    orderId: receipt.id,
                    value: Number(receipt.total ?? finalTotal),
                    currency: receipt.currency ?? currency,
                    items: purchasedPixelItems,
                  });
                  purchased(tenantId, lines);
                  localStorage.removeItem(key);
                  router.push(
                    storeHref(
                      basePath,
                      "/orders?placed=wallet&order=" +
                        encodeURIComponent(receipt.id),
                    ),
                  );
                  return;
                }

                // Online Paymob Flow: keep cart intact and show full-screen redirecting state
                // Cart is cleared ONLY when payment is confirmed on /orders (?payment=success or paid)
                if (
                  effectivePaymentMethod === "paymob_card" ||
                  effectivePaymentMethod === "paymob_wallet"
                ) {
                  setRedirectingPayment(true);
                  setPendingOnlineOrder(tenantId, receipt.id);
                  const initRes = await fetch(
                    "/api/payments/paymob/initiate",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        order_id: receipt.id,
                        method:
                          effectivePaymentMethod === "paymob_card"
                            ? "card"
                            : "wallet",
                        wallet_phone:
                          effectivePaymentMethod === "paymob_wallet"
                            ? cleanWallet
                            : undefined,
                        customer_phone: phone,
                      }),
                    },
                  );
                  const initData = (await initRes.json()) as {
                    redirect_url?: string;
                    error?: string;
                  };
                  if (!initRes.ok || !initData.redirect_url) {
                    setRedirectingPayment(false);
                    setResult({
                      error: isEn
                        ? "Order created, but online payment could not be initiated. You can retry from My Orders."
                        : "تم إنشاء الطلب ولكن تعذر بدء الدفع الإلكتروني حالياً. يمكنك إعادة المحاولة من صفحة طلباتي.",
                    });
                    return;
                  }
                  localStorage.removeItem(key);
                  window.location.assign(initData.redirect_url);
                  return;
                }

                // Cash on Delivery Flow: clear cart immediately and redirect to /orders
                markWebCartRecovered(tenantId, receipt.id);
                trackPurchase({
                  orderId: receipt.id,
                  value: Number(receipt.total ?? finalTotal),
                  currency: receipt.currency ?? currency,
                  items: purchasedPixelItems,
                });
                purchased(tenantId, lines);
                localStorage.removeItem(key);
                router.push(
                  storeHref(
                    basePath,
                    "/orders?placed=cod&order=" +
                      encodeURIComponent(receipt.id),
                  ),
                );
              } catch {
                setRedirectingPayment(false);
                setResult({
                  error: isEn
                    ? "Could not connect or submit your order. Please try again."
                    : "تعذر الاتصال أو حفظ محاولة الشراء. أعد المحاولة.",
                });
              } finally {
                setBusy(false);
                lock.current = false;
              }
            }}
          >
            <div className="checkout-auth-banner">
              {signedInEmail ? (
                <span>{isEn ? "Signed in as " : "مسجّل الدخول بحساب "}<bdi dir="ltr">{signedInEmail}</bdi></span>
              ) : (
                <>
                  <span>
                    {isEn
                      ? "Have an account? Sign in to auto-fill shipping details or continue as guest."
                      : "لديك حساب؟ سجّل الدخول لملء بيانات الشحن تلقائياً أو أكمل كزائر."}
                  </span>
                  <Link
                    href={`${basePath}/login?next=${encodeURIComponent(
                      storeHref(basePath, "/checkout"),
                    )}`}
                  >
                    {isEn ? "Sign in" : "تسجيل الدخول"}
                  </Link>
                </>
              )}
            </div>
            <AddressBook storeId={storeId} checkout signedIn={signedIn} initial={addresses}
              profile={{recipient_name:defaultName, phone:defaultPhone, governorate:defaultGovernorate, city:defaultCity, street:defaultAddress}}
              onGovernorate={setGovernorate} onPhone={phone => syncAbandonedCartContact(tenantId, {
                phone, name:defaultName, email:signedInEmail, currency,
              })} />

            {canUseWallet && (
              <div
                className={`wallet-checkout-toggle ${useWallet ? "is-active" : ""}`}
              >
                <label className="wallet-checkout-label">
                  <span className="wallet-checkout-info">
                    <Wallet size={18} aria-hidden="true" />
                    <span>
                      <strong>
                        {isEn ? "Use wallet credit" : "استخدام رصيد المحفظة"} · <bdi dir="ltr">{money(walletBalance, currency, lang)}</bdi>
                      </strong>
                      <small>{useWallet ? <>{isEn ? "Credit applied" : "الرصيد المستخدم"} · <bdi dir="ltr">{money(walletApplied, currency, lang)}</bdi></>
                        : isEn ? "Apply store credit to this order." : "استخدم رصيدك المتاح في هذا الطلب."}</small>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={(e) => setUseWallet(e.target.checked)}
                  />
                </label>
              </div>
            )}

            {fullyPaidByWallet ? (
              <div className="wallet-full-cover-banner" role="status">
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>
                  {isEn
                    ? "Paid in full via Store Wallet — no extra payment required."
                    : "مغطّى بالكامل برصيد محفظة المتجر — لا يلزم دفع إضافي."}
                </span>
              </div>
            ) : (
              <>
                <fieldset className="payment-options-group">
                  <legend>{t("paymentMethodLabel")}</legend>
                  {availableMethods.length === 0 ? (
                    <p role="alert">{t("paymentNoMethods")}</p>
                  ) : (
                    <div className="payment-options-list">
                      {paymentOptions.codEnabled && (
                        <label
                          className={`payment-option-card ${activePayment === "cod" ? "is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="payment"
                            value="cod"
                            checked={activePayment === "cod"}
                            onChange={() => {
                              setSelectedPayment("cod");
                              setWalletError(null);
                            }}
                          />
                          <Banknote size={18} aria-hidden="true" />
                          <span>{t("paymentCod")}</span>
                        </label>
                      )}

                      {paymentOptions.paymobEnabled &&
                        paymentOptions.paymobCardEnabled && (
                          <label
                            className={`payment-option-card ${activePayment === "paymob_card" ? "is-selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="payment"
                              value="paymob_card"
                              checked={activePayment === "paymob_card"}
                              onChange={() => {
                                setSelectedPayment("paymob_card");
                                setWalletError(null);
                              }}
                            />
                            <CreditCard size={18} aria-hidden="true" />
                            <span>{t("paymentCardOption")}</span>
                          </label>
                        )}

                      {paymentOptions.paymobEnabled &&
                        paymentOptions.paymobWalletEnabled && (
                          <label
                            className={`payment-option-card ${activePayment === "paymob_wallet" ? "is-selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="payment"
                              value="paymob_wallet"
                              checked={activePayment === "paymob_wallet"}
                              onChange={() => {
                                setSelectedPayment("paymob_wallet");
                                setWalletError(null);
                              }}
                            />
                            <Smartphone size={18} aria-hidden="true" />
                            <span>{t("paymentWalletOption")}</span>
                          </label>
                        )}
                    </div>
                  )}
                </fieldset>

                {activePayment === "paymob_wallet" && (
                  <label className="wallet-phone-field">
                    {t("paymentWalletPhoneLabel")}
                    <input
                      type="tel"
                      name="wallet_phone"
                      aria-invalid={Boolean(walletError)} aria-describedby={walletError ? "wallet-phone-error" : undefined}
                      onBlur={() => { if (walletPhone && !EGYPT_WALLET_RE.test(walletPhone.replace(/\s+/g, ""))) setWalletError(t("paymentWalletPhoneError")); }}
                      dir="ltr"
                      inputMode="numeric"
                      maxLength={11}
                      value={walletPhone}
                      onChange={(e) => {
                        setWalletPhone(e.target.value);
                        if (walletError) setWalletError(null);
                      }}
                      placeholder={t("paymentWalletPhonePlaceholder")}
                      required
                    />
                    {walletError && (
                      <small role="alert" id="wallet-phone-error" className="sf-field-error">
                        {walletError}
                      </small>
                    )}
                  </label>
                )}
              </>
            )}
          </form>
        ) : <section className="panel sf-basket-items">
          <h2>{t("cartItemsTitle")}</h2>
          <CartLines basket={basket} currency={currency} basePath={basePath} editable/>
        </section>}
        <aside className="panel cart-summary-panel sf-summary">
          <h2>{t("orderSummaryTitle")}</h2>
          {order && <CartLines basket={basket} currency={currency} basePath={basePath} editable={false}/>}
          <dl className="sf-breakdown" aria-live="polite">
            <div><dt>{t("subtotalLabel")}</dt><dd><bdi dir="ltr">{money(subtotal, currency, lang)}</bdi></dd></div>
            {appliedCoupon && <div><dt>{t("couponDiscountLabel")} <bdi dir="ltr">{appliedCoupon.code}</bdi></dt>
              <dd><bdi dir="ltr">−{money(discount, currency, lang)}</bdi></dd></div>}
            <div><dt>{t("shippingLabel")}</dt><dd>
              {freeShippingUnlocked || effectiveFee === 0 ? <>{isEn ? "Free" : "مجاني"}
                {deliveryFee > 0 && <> <del><bdi dir="ltr">{money(deliveryFee, currency, lang)}</bdi></del></>}</>
                : <bdi dir="ltr">{money(effectiveFee, currency, lang)}</bdi>}
            </dd></div>
            {walletApplied > 0 && <div><dt>{isEn ? "Wallet credit" : "رصيد المحفظة"}</dt><dd><bdi dir="ltr">−{money(walletApplied, currency, lang)}</bdi></dd></div>}
            <div className="sf-total"><dt>{t("estimatedTotalLabel")}</dt><dd><bdi dir="ltr">{money(finalTotal, currency, lang)}</bdi></dd></div>
          </dl>
          {order && (
            <div className="coupon-apply-box">
              {appliedCoupon ? (
                <div className="coupon-applied-chip">
                  <span>
                    <TicketPercent size={14} /> {t("couponActivePrefix")}{" "}
                    <bdi dir="ltr">{appliedCoupon.code}</bdi> {t("couponActiveSuffix")}
                  </span>
                  <button
                    type="button"
                    className="icon-ghost-btn"
                    aria-label={isEn ? "Remove coupon" : "إزالة الكوبون"}
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponInput("");
                      setCouponMsg(null);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="coupon-input-row">
                  <input
                    type="text"
                    dir={couponInput ? "ltr" : isEn ? "ltr" : "rtl"}
                    value={couponInput}
                    aria-invalid={couponMsg?.ok === false}
                    aria-describedby={couponMsg ? "coupon-feedback" : undefined}
                    onChange={(e) => { setCouponInput(e.target.value); setCouponMsg(null); }}
                    placeholder={t("couponPlaceholder")}
                    aria-label={t("couponPlaceholder")}
                    maxLength={40}
                  />
                  <button
                    type="button"
                    disabled={checkingCoupon || !couponInput.trim()}
                    onClick={handleApplyCoupon}
                  >
                    {checkingCoupon ? "…" : t("couponApply")}
                  </button>
                </div>
              )}
              {couponMsg && (
                <small
                  id="coupon-feedback" role="status" className={couponMsg.ok ? "sf-success" : "sf-field-error"}
                >
                  <StoreCopy text={couponMsg.text} lang={lang}/>
                </small>
              )}
            </div>
          )}
          {order ? <>
              <button
                className="checkout-cta" type="submit" form="store-checkout"
                disabled={
                  overLimit || busy || (!fullyPaidByWallet && availableMethods.length === 0)
                }
              >
                {redirectingPayment
                  ? t("paymentRedirectingBtn")
                  : busy
                    ? t("confirmingOrderBtn")
                    : fullyPaidByWallet
                      ? isEn
                        ? "Complete Order with Store Wallet"
                        : "إتمام الطلب برصيد المحفظة"
                      : t("confirmOrderBtn")}
              </button>
              {overLimit && <Link href={storeHref(basePath, "/cart")}>{isEn ? "Reduce quantities in your cart" : "خفّض الكميات في السلة"}</Link>}
              {result.error && <p role="alert" className="sf-field-error"><StoreCopy text={result.error} lang={lang}/></p>}
          </> : <Link className="cta checkout-cta" href={storeHref(basePath, "/checkout")}>{t("proceedCheckoutBtn")}</Link>}
        </aside>
      </div>
    </>
  );
}
