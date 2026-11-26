"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  RotateCcw,
  ArrowLeftRight,
  Wallet,
  CreditCard,
  CheckCircle2,
  PackageCheck,
  MessageSquare,
  X,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { date, money } from "@/lib/brand";
import { translateColor } from "@/lib/i18n";
import {
  RETURN_REASON_OPTIONS,
  hasActiveReturn,
  localizeReturnReason,
  refundMethodLabel,
  returnStatusMeta,
  returnTypeLabel,
  type ReturnRefundMethod,
  type ReturnRequestRecord,
  type ReturnRequestType,
} from "@/lib/returns";
import {
  submitReturnRequestAction,
  type OrderItemSummary,
} from "@/app/(shop)/orders/actions";

const emptySubscribe = () => () => {};

export function OrderReturnPanel({
  orderId,
  orderStatus,
  currency = "EGP",
  orderItems,
  initialReturn = null,
}: {
  orderId: string;
  orderStatus: string;
  currency?: string;
  orderItems: OrderItemSummary[];
  initialReturn?: ReturnRequestRecord | null;
}) {
  const router = useRouter();
  const { lang } = useLanguage();
  const isEn = lang === "en";
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const [returnReq, setReturnReq] = useState<ReturnRequestRecord | null>(
    initialReturn,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [requestType, setRequestType] = useState<ReturnRequestType>("return");
  const [refundMethod, setRefundMethod] =
    useState<ReturnRefundMethod>("wallet");
  const [reasonCode, setReasonCode] = useState<string>(
    RETURN_REASON_OPTIONS[0].code,
  );
  const [customerNotes, setCustomerNotes] = useState("");
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const item of orderItems) {
      map[item.id] = item.quantity;
    }
    return map;
  });
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  const estimatedRefund = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      const qty = selectedQty[item.id] ?? 0;
      return sum + qty * Number(item.unit_price ?? 0);
    }, 0);
  }, [orderItems, selectedQty]);

  const selectedCount = useMemo(
    () =>
      Object.values(selectedQty).reduce((sum, q) => sum + (q > 0 ? q : 0), 0),
    [selectedQty],
  );

  const canSubmitNew =
    orderStatus === "delivered" &&
    orderItems.length > 0 &&
    !hasActiveReturn(returnReq);

  const openDrawer = () => {
    const initial: Record<string, number> = {};
    for (const item of orderItems) {
      initial[item.id] = item.quantity;
    }
    setSelectedQty(initial);
    setRequestType("return");
    setRefundMethod("wallet");
    setReasonCode(RETURN_REASON_OPTIONS[0].code);
    setCustomerNotes("");
    setError(null);
    setDrawerOpen(true);
  };

  const toggleItem = (item: OrderItemSummary) => {
    setSelectedQty((prev) => ({
      ...prev,
      [item.id]: (prev[item.id] ?? 0) > 0 ? 0 : item.quantity,
    }));
  };

  const adjustItemQty = (item: OrderItemSummary, delta: number) => {
    setSelectedQty((prev) => {
      const next = Math.max(
        0,
        Math.min(item.quantity, (prev[item.id] ?? 0) + delta),
      );
      return { ...prev, [item.id]: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    setError(null);

    const payloadItems = orderItems
      .map((item) => ({
        order_item_id: item.id,
        quantity: selectedQty[item.id] ?? 0,
      }))
      .filter((it) => it.quantity > 0);

    if (payloadItems.length === 0) {
      setError(
        isEn
          ? "Select at least one item to continue."
          : "يرجى اختيار منتج واحد على الأقل للمتابعة.",
      );
      return;
    }

    const chosenReason =
      RETURN_REASON_OPTIONS.find((r) => r.code === reasonCode)?.code ??
      reasonCode;

    submitLock.current = true;
    setSubmitting(true);
    try {
      const res = await submitReturnRequestAction({
        orderId,
        requestType,
        refundMethod,
        reason: chosenReason,
        customerNotes,
        items: payloadItems,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      setReturnReq(res.returnRequest);
      setDrawerOpen(false);
      router.refresh();
    } catch {
      setError(
        isEn
          ? "Something went wrong. Please try again."
          : "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (!returnReq && !canSubmitNew) {
    return null;
  }

  const statusMeta = returnReq ? returnStatusMeta(returnReq.status, lang) : null;

  return (
    <div className="order-return-block">
      {returnReq && statusMeta && (
        <div
          className="order-return-status-card"
          data-return-status={returnReq.status}
        >
          <div className="order-return-card-head">
            <div className="order-return-title-wrap">
              <span className="order-return-icon-badge" aria-hidden="true">
                {returnReq.request_type === "exchange" ? (
                  <ArrowLeftRight size={15} />
                ) : (
                  <RotateCcw size={15} />
                )}
              </span>
              <div>
                <strong className="order-return-heading">
                  {returnReq.request_type === "exchange"
                    ? isEn
                      ? "Exchange Request"
                      : "طلب استبدال"
                    : isEn
                      ? "Return Request"
                      : "طلب إرجاع"}{" "}
                  <span dir="ltr" className="order-return-code">
                    #{returnReq.id.slice(0, 8)}
                  </span>
                </strong>
                <small className="order-return-date">
                  {date(returnReq.created_at, lang)}
                </small>
              </div>
            </div>

            <span
              className="return-status-pill"
              style={{
                background: statusMeta.bg,
                color: statusMeta.color,
                borderColor: statusMeta.border,
              }}
            >
              {statusMeta.label}
            </span>
          </div>

          <div className="order-return-meta-grid">
            <div className="order-return-meta-pill">
              {returnReq.refund_method === "wallet" ? (
                <Wallet size={14} />
              ) : (
                <CreditCard size={14} />
              )}
              <span>{refundMethodLabel(returnReq.refund_method, lang)}</span>
            </div>
            <div className="order-return-meta-pill is-amount">
              <span>{isEn ? "Refund Amount" : "قيمة الاسترداد"}:</span>
              <strong>{money(returnReq.refund_amount, currency, lang)}</strong>
            </div>
            {returnReq.wallet_credited && (
              <div className="order-return-meta-pill is-success">
                <CheckCircle2 size={14} />
                <span>
                  {isEn ? "Credited to Store Wallet" : "تم الإيداع في محفظة المتجر"}
                </span>
              </div>
            )}
            {returnReq.restocked && (
              <div className="order-return-meta-pill is-info">
                <PackageCheck size={14} />
                <span>{isEn ? "Items Received" : "تم استلام المنتجات"}</span>
              </div>
            )}
          </div>

          <p className="order-return-reason">
            <strong>{isEn ? "Reason" : "السبب"}:</strong>{" "}
            {localizeReturnReason(returnReq.reason, lang)}
          </p>

          {returnReq.items.length > 0 && (
            <ul className="order-return-items-list">
              {returnReq.items.map((it, i) => (
                <li
                  key={`${it.order_item_id ?? it.product_id ?? i}`}
                  className="order-return-item-chip"
                >
                  <span>
                    {it.product_name} × {it.quantity}
                  </span>
                  {(it.size || it.color) && (
                    <small>
                      {[
                        it.size,
                        it.color ? translateColor(it.color, lang) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          )}

          {returnReq.customer_notes && (
            <p className="order-return-notes">
              <small>
                {isEn ? "Your note:" : "ملاحظتك:"} {returnReq.customer_notes}
              </small>
            </p>
          )}

          {returnReq.admin_notes && (
            <div className="order-return-admin-reply">
              <div className="order-return-admin-reply-head">
                <MessageSquare size={13} />
                <span>{isEn ? "Merchant Response" : "رد إدارة المتجر"}</span>
              </div>
              <p>{returnReq.admin_notes}</p>
            </div>
          )}
        </div>
      )}

      {canSubmitNew && (
        <button
          type="button"
          className="order-return-trigger-btn"
          onClick={openDrawer}
        >
          <RotateCcw size={15} />
          <span>
            {isEn
              ? "Request Return or Exchange"
              : "طلب إرجاع أو استبدال"}
          </span>
        </button>
      )}

      {isClient &&
        drawerOpen &&
        createPortal(
          <div
            className="return-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget && !submitting) {
                setDrawerOpen(false);
              }
            }}
          >
            <div
              className="return-modal-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`return-modal-title-${orderId}`}
              dir={isEn ? "ltr" : "rtl"}
            >
              <div className="return-modal-header">
                <div>
                  <h3 id={`return-modal-title-${orderId}`}>
                    {isEn
                      ? "Request Return or Exchange"
                      : "طلب إرجاع أو استبدال"}
                  </h3>
                  <small dir="ltr">#{orderId.slice(0, 8)}</small>
                </div>
                <button
                  type="button"
                  className="return-modal-close"
                  aria-label={isEn ? "Close" : "إغلاق"}
                  disabled={submitting}
                  onClick={() => setDrawerOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="return-modal-body">
                {/* 1. Request Type */}
                <fieldset className="return-fieldset">
                  <legend>
                    {isEn ? "1. Request Type" : "1. نوع الطلب"}
                  </legend>
                  <div className="return-choice-grid">
                    {(["return", "exchange"] as const).map((typeOpt) => {
                      const active = requestType === typeOpt;
                      return (
                        <button
                          key={typeOpt}
                          type="button"
                          className={`return-choice-card ${active ? "is-active" : ""}`}
                          onClick={() => setRequestType(typeOpt)}
                        >
                          {typeOpt === "return" ? (
                            <RotateCcw size={16} />
                          ) : (
                            <ArrowLeftRight size={16} />
                          )}
                          <span>{returnTypeLabel(typeOpt, lang)}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* 2. Select Items & Quantities */}
                <fieldset className="return-fieldset">
                  <legend>
                    {isEn
                      ? "2. Select Items & Quantities"
                      : "2. اختر المنتجات والكميات"}
                  </legend>
                  <div className="return-items-selector">
                    {orderItems.map((item) => {
                      const qty = selectedQty[item.id] ?? 0;
                      const checked = qty > 0;
                      return (
                        <div
                          key={item.id}
                          className={`return-select-row ${checked ? "is-checked" : ""}`}
                        >
                          <label className="return-select-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleItem(item)}
                            />
                            <div className="return-select-info">
                              <strong>{item.product_name}</strong>
                              <small>
                                {money(item.unit_price, currency, lang)}
                                {item.size ? ` · ${item.size}` : ""}
                                {item.color
                                  ? ` · ${translateColor(item.color, lang)}`
                                  : ""}
                              </small>
                            </div>
                          </label>
                          <div className="return-qty-stepper">
                            <button
                              type="button"
                              aria-label={isEn ? "Decrease" : "تقليل"}
                              disabled={qty <= 0}
                              onClick={() => adjustItemQty(item, -1)}
                            >
                              <Minus size={13} />
                            </button>
                            <span dir="ltr">
                              {qty} / {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={isEn ? "Increase" : "زيادة"}
                              disabled={qty >= item.quantity}
                              onClick={() => adjustItemQty(item, 1)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                {/* 3. Refund Method */}
                <fieldset className="return-fieldset">
                  <legend>
                    {isEn ? "3. Refund Method" : "3. طريقة الاسترداد"}
                  </legend>
                  <div className="return-choice-grid is-stack-sm">
                    <button
                      type="button"
                      className={`return-choice-card is-detailed ${refundMethod === "wallet" ? "is-active" : ""}`}
                      onClick={() => setRefundMethod("wallet")}
                    >
                      <div className="return-choice-top">
                        <Wallet size={16} />
                        <strong>
                          {isEn
                            ? "Store Wallet (Instant)"
                            : "محفظة المتجر (فوري)"}
                        </strong>
                        <span className="return-fast-tag">
                          <Sparkles size={11} />
                          {isEn ? "Instant" : "فوري"}
                        </span>
                      </div>
                      <small>
                        {isEn
                          ? "Credited immediately to your store wallet for your next order."
                          : "يُضاف فوراً إلى رصيد محفظتك في المتجر لاستخدامه في طلبك القادم."}
                      </small>
                    </button>

                    <button
                      type="button"
                      className={`return-choice-card is-detailed ${refundMethod === "original_payment" ? "is-active" : ""}`}
                      onClick={() => setRefundMethod("original_payment")}
                    >
                      <div className="return-choice-top">
                        <CreditCard size={16} />
                        <strong>
                          {isEn ? "Original Payment" : "وسيلة الدفع الأصلية"}
                        </strong>
                      </div>
                      <small>
                        {isEn
                          ? "Refunded to your original payment method after review."
                          : "يُرد عبر وسيلة الدفع الأصلية بعد المراجعة والاستلام."}
                      </small>
                    </button>
                  </div>
                </fieldset>

                {/* 4. Reason & Notes */}
                <label className="return-field-label">
                  <span>{isEn ? "4. Reason" : "4. سبب الطلب"}</span>
                  <select
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value)}
                    required
                  >
                    {RETURN_REASON_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {isEn ? opt.en : opt.ar}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="return-field-label">
                  <span>
                    {isEn
                      ? "Additional Notes (Optional)"
                      : "ملاحظات إضافية (اختياري)"}
                  </span>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder={
                      isEn
                        ? "e.g., Needed size L instead of M, or details about item condition..."
                        : "مثال: أرغب في مقاس L بدلاً من M، أو تفاصيل إضافية..."
                    }
                  />
                </label>

                <div className="return-summary-bar">
                  <div>
                    <small>
                      {isEn
                        ? `Estimated Refund (${selectedCount} item${selectedCount === 1 ? "" : "s"})`
                        : `قيمة الاسترداد التقديرية (${selectedCount} قطعة)`}
                    </small>
                    <strong>{money(estimatedRefund, currency, lang)}</strong>
                  </div>
                  <button
                    type="submit"
                    className="return-submit-btn"
                    disabled={submitting || selectedCount === 0}
                  >
                    {submitting
                      ? isEn
                        ? "Submitting…"
                        : "جارٍ الإرسال…"
                      : isEn
                        ? "Submit Request"
                        : "إرسال الطلب"}
                  </button>
                </div>

                {error && (
                  <p role="alert" className="return-error-banner">
                    {error}
                  </p>
                )}
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
