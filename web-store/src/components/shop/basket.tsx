"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import {
  Plus,
  Minus,
  Trash2,
  TicketPercent,
  X,
  Banknote,
  CreditCard,
  Smartphone,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import {
  useCart,
  change,
  purchased,
  setPendingOnlineOrder,
} from "./cart-store";
import {
  checkout,
  previewCoupon,
  type CheckoutResult,
} from "@/app/(shop)/checkout/action";
import { money } from "@/lib/brand";
import { localizedText, translateColor } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";

const EGYPT_WALLET_RE = /^01[0125][0-9]{8}$/;

export type StorePaymentOptions = {
  codEnabled: boolean;
  paymobEnabled: boolean;
  paymobCardEnabled: boolean;
  paymobWalletEnabled: boolean;
};

type SelectedPayment = "cod" | "paymob_card" | "paymob_wallet";

export function Basket({
  order = false,
  fee,
  currency,
  defaultName = "",
  defaultPhone = "",
  defaultAddress = "",
  signedInEmail = null,
  paymentOptions = {
    codEnabled: true,
    paymobEnabled: false,
    paymobCardEnabled: false,
    paymobWalletEnabled: false,
  },
}: {
  order?: boolean;
  fee: number;
  currency: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultAddress?: string;
  signedInEmail?: string | null;
  paymentOptions?: StorePaymentOptions;
}) {
  const router = useRouter();
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const lines = useCart();

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
  const lock = useRef(false);

  const activePayment: SelectedPayment = availableMethods.includes(
    selectedPayment,
  )
    ? selectedPayment
    : defaultMethod;

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const discount = appliedCoupon
    ? Math.min(subtotal, appliedCoupon.discount)
    : 0;
  const finalTotal = Math.max(0, subtotal - discount) + fee;

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
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
        <p dir="ltr">{result.id}</p>
        <p>{money(result.total ?? null, result.currency, lang)}</p>
        <Link className="cta" href="/orders">
          {t("trackOrderBtn")}
        </Link>
      </section>
    );

  if (!lines.length)
    return (
      <div className="panel">
        <h1>{t("cartEmpty")}</h1>
        <Link className="cta" href="/products">
          {t("heroShopProducts")}
        </Link>
      </div>
    );

  return (
    <>
      <h1>{order ? t("checkoutTitle") : t("cartTitle")}</h1>
      <div className="checkout-progress" aria-label={t("checkoutTitle")}>
        <div className="checkout-progress-steps">
          <span data-active="true">{t("stepReviewCart")}</span>
          <span data-active={order ? "true" : "false"}>
            {t("stepShippingPay")}
          </span>
          <span data-active="false">{t("stepConfirm")}</span>
        </div>
        <div className="checkout-progress-track">
          <div
            className="checkout-progress-fill"
            style={{ width: order ? "68%" : "34%" }}
          />
        </div>
      </div>
      <div className="details-grid">
        <section className="panel">
          <h2>{t("cartItemsTitle")}</h2>
          {lines.map((l) => (
            <div
              className="basket-line"
              key={JSON.stringify([l.id, l.color, l.size])}
            >
              <div className="basket-line-info">
                <Link href={"/products/" + l.id}>
                  {localizedText(lang, l.name, l.name_en)}
                </Link>
                {(l.size || l.color) && (
                  <div className="variant-badges-row">
                    {l.size && (
                      <span className="variant-pill-badge">
                        {t("sizeLabel")}: <b>{l.size}</b>
                      </span>
                    )}
                    {l.color && (
                      <span className="variant-pill-badge">
                        {t("colorLabel")}: <b>{translateColor(l.color, lang)}</b>
                      </span>
                    )}
                  </div>
                )}
                <p className="basket-line-price">
                  {money(l.price, currency, lang)}
                </p>
              </div>
              <div className="actions">
                {!order && (
                  <button
                    aria-label={isEn ? "Decrease quantity" : "إنقاص الكمية"}
                    onClick={() => change(l, -1)}
                  >
                    <Minus size={15} />
                  </button>
                )}
                <b>
                  {order ? `${t("qtyLabel")}: ${l.quantity}` : l.quantity}
                </b>
                {!order && (
                  <>
                    <button
                      aria-label={isEn ? "Increase quantity" : "زيادة الكمية"}
                      disabled={
                        lines
                          .filter((x) => x.id === l.id)
                          .reduce((n, x) => n + x.quantity, 0) >= l.stock
                      }
                      onClick={() => change(l, 1)}
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      aria-label={isEn ? "Remove item" : "حذف المنتج"}
                      onClick={() => change(l, -l.quantity)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
        <section className="panel cart-summary-panel">
          <h2>{t("orderSummaryTitle")}</h2>
          <p>
            {t("subtotalLabel")} · {money(subtotal, currency, lang)}
          </p>
          {appliedCoupon && (
            <p className="coupon-discount-line">
              {t("couponDiscountLabel")} ({appliedCoupon.code}) · -
              {money(discount, currency, lang)}
            </p>
          )}
          <p>
            {t("shippingLabel")} · {money(fee, currency, lang)}
          </p>
          <strong>
            {t("estimatedTotalLabel")} · {money(finalTotal, currency, lang)}
          </strong>
          {order && (
            <div className="coupon-apply-box">
              {appliedCoupon ? (
                <div className="coupon-applied-chip">
                  <span>
                    <TicketPercent size={14} /> {t("couponActivePrefix")}{" "}
                    {appliedCoupon.code} {t("couponActiveSuffix")}
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
                    dir="ltr"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
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
                  role="status"
                  style={{
                    color: couponMsg.ok ? "#15803d" : "#dc2626",
                    fontWeight: 600,
                  }}
                >
                  {couponMsg.text}
                </small>
              )}
            </div>
          )}
          {order ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (lock.current || availableMethods.length === 0) return;

                const cleanWallet = walletPhone.replace(/\s+/g, "");
                if (
                  activePayment === "paymob_wallet" &&
                  !EGYPT_WALLET_RE.test(cleanWallet)
                ) {
                  setWalletError(t("paymentWalletPhoneError"));
                  return;
                }
                setWalletError(null);
                setResult({});

                lock.current = true;
                setBusy(true);
                const f = new FormData(e.currentTarget);
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
                  const payload = JSON.stringify([
                    address,
                    phone,
                    items,
                    couponCode,
                    activePayment,
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
                  const key = "nova.checkout." + hash;
                  const request =
                    localStorage.getItem(key) || crypto.randomUUID();
                  localStorage.setItem(key, request);

                  const receipt = await checkout(
                    request,
                    address,
                    phone,
                    activePayment,
                    items,
                    couponCode || undefined,
                    defaultName || undefined,
                  );

                  if (!receipt.id) {
                    setResult(receipt);
                    return;
                  }

                  // Online Paymob Flow: keep cart intact and show full-screen redirecting state
                  // Cart is cleared ONLY when payment is confirmed on /orders (?payment=success or paid)
                  if (
                    activePayment === "paymob_card" ||
                    activePayment === "paymob_wallet"
                  ) {
                    setRedirectingPayment(true);
                    setPendingOnlineOrder(receipt.id);
                    const initRes = await fetch(
                      "/api/payments/paymob/initiate",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          order_id: receipt.id,
                          method:
                            activePayment === "paymob_card"
                              ? "card"
                              : "wallet",
                          wallet_phone:
                            activePayment === "paymob_wallet"
                              ? cleanWallet
                              : undefined,
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
                  purchased(lines);
                  localStorage.removeItem(key);
                  router.push(
                    "/orders?placed=cod&order=" + encodeURIComponent(receipt.id),
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
                  <span>
                    {isEn
                      ? `Signed in as ${signedInEmail} — your order will sync automatically.`
                      : `مسجّل الدخول: ${signedInEmail} — سيتم مزامنة طلبك مع حسابك تلقائياً.`}
                  </span>
                ) : (
                  <>
                    <span>
                      {isEn
                        ? "Have an account? Sign in to auto-fill shipping details or continue as guest."
                        : "لديك حساب؟ سجّل الدخول لملء بيانات الشحن تلقائياً أو أكمل كزائر."}
                    </span>
                    <Link href="/login?next=/checkout">
                      {isEn ? "Sign in" : "تسجيل الدخول"}
                    </Link>
                  </>
                )}
              </div>
              <label>
                {t("shippingAddressLabel")}
                <textarea
                  name="address"
                  defaultValue={defaultAddress}
                  required
                  minLength={3}
                  maxLength={500}
                  autoComplete="street-address"
                />
              </label>
              <label>
                {t("trackingPhoneLabel")}
                <input
                  name="phone"
                  dir="ltr"
                  type="tel"
                  defaultValue={defaultPhone}
                  autoComplete="tel"
                  required
                  maxLength={24}
                />
              </label>

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
                    <small role="alert" className="wallet-error-text">
                      {walletError}
                    </small>
                  )}
                </label>
              )}

              <button
                className="checkout-cta"
                disabled={busy || availableMethods.length === 0}
              >
                {redirectingPayment
                  ? t("paymentRedirectingBtn")
                  : busy
                    ? t("confirmingOrderBtn")
                    : t("confirmOrderBtn")}
              </button>
              {result.error && <p role="alert">{result.error}</p>}
            </form>
          ) : (
            <p>
              <Link className="cta checkout-cta" href="/checkout">
                {t("proceedCheckoutBtn")}
              </Link>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
