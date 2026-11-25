"use client";

import { Wallet, Sparkles, ArrowDownLeft, ArrowUpRight, History } from "lucide-react";
import { date, money } from "@/lib/brand";
import { useLanguage } from "@/components/language-provider";

export type WalletTransactionItem = {
  id: string;
  order_id: string | null;
  type:
    | "cashback_earned"
    | "order_redemption"
    | "order_refund"
    | "admin_credit"
    | "admin_debit"
    | string;
  amount: number;
  balance_after: number;
  note_ar: string;
  note_en: string;
  created_at: string;
};

export type WalletSummaryData = {
  balance: number;
  currency: string;
  cashback_enabled: boolean;
  cashback_percentage: number;
  transactions: WalletTransactionItem[];
};

function txTitle(tx: WalletTransactionItem, isEn: boolean): string {
  const shortOrder = tx.order_id ? `#${tx.order_id.slice(0, 8)}` : "";
  if (isEn) {
    if (tx.note_en?.trim()) return tx.note_en.trim();
    switch (tx.type) {
      case "cashback_earned":
        return shortOrder ? `Cashback earned · ${shortOrder}` : "Cashback earned";
      case "order_redemption":
        return shortOrder ? `Redeemed on order ${shortOrder}` : "Order wallet redemption";
      case "order_refund":
        return shortOrder ? `Refunded from order ${shortOrder}` : "Cancelled order refund";
      case "return_refund":
      case "credit":
        return shortOrder ? `Return refund · ${shortOrder}` : "Return refund credit";
      case "admin_credit":
        return "Store credit added";
      case "admin_debit":
        return "Store credit deducted";
      default:
        return "Wallet adjustment";
    }
  }
  if (tx.note_ar?.trim()) return tx.note_ar.trim();
  switch (tx.type) {
    case "cashback_earned":
      return shortOrder ? `كاش باك طلب ${shortOrder}` : "كاش باك مكتسب";
    case "order_redemption":
      return shortOrder ? `خصم على طلب ${shortOrder}` : "استخدام رصيد المحفظة";
    case "order_refund":
      return shortOrder ? `استرداد طلب ملغي ${shortOrder}` : "استرداد رصيد المحفظة";
    case "return_refund":
    case "credit":
      return shortOrder ? `استرداد طلب إرجاع ${shortOrder}` : "استرداد إرجاع للمحفظة";
    case "admin_credit":
      return "رصيد إداري";
    case "admin_debit":
      return "خصم إداري";
    default:
      return "حركة محفظة";
  }
}

export function WalletSection({ summary }: { summary: WalletSummaryData }) {
  const { lang } = useLanguage();
  const isEn = lang === "en";

  return (
    <section className="panel wallet-account-card shop-animate">
      <div className="wallet-hero-banner">
        <div className="wallet-hero-main">
          <span className="wallet-hero-icon" aria-hidden="true">
            <Wallet size={22} />
          </span>
          <div>
            <small className="wallet-hero-label">
              {isEn ? "Available Wallet Balance" : "رصيد المحفظة المتاح"}
            </small>
            <strong className="wallet-hero-balance">
              {money(summary.balance, summary.currency, lang)}
            </strong>
          </div>
        </div>

        {summary.cashback_enabled && summary.cashback_percentage > 0 && (
          <span className="wallet-cashback-pill">
            <Sparkles size={14} aria-hidden="true" />
            {isEn
              ? `Earn ${summary.cashback_percentage}% cashback on every delivered order`
              : `اكسب ${summary.cashback_percentage}% كاش باك عند اكتمال كل طلب`}
          </span>
        )}
      </div>

      <div className="wallet-history-wrap">
        <h3 className="wallet-history-title">
          <History size={16} aria-hidden="true" />
          <span>{isEn ? "Wallet Transaction History" : "سجل حركات المحفظة"}</span>
        </h3>

        {summary.transactions.length === 0 ? (
          <p className="wallet-empty-note">
            {isEn
              ? "No wallet transactions yet. Complete orders to earn instant cashback!"
              : "لا توجد حركات على المحفظة بعد. أكمل طلباتك لتربح كاش باك تلقائياً!"}
          </p>
        ) : (
          <ul className="wallet-tx-list">
            {summary.transactions.map((tx) => {
              const isCredit = Number(tx.amount) > 0;
              return (
                <li key={tx.id} className="wallet-tx-row">
                  <span
                    className={`wallet-tx-badge ${isCredit ? "is-credit" : "is-debit"}`}
                    aria-hidden="true"
                  >
                    {isCredit ? (
                      <ArrowDownLeft size={15} />
                    ) : (
                      <ArrowUpRight size={15} />
                    )}
                  </span>
                  <div className="wallet-tx-meta">
                    <strong>{txTitle(tx, isEn)}</strong>
                    <small>{date(tx.created_at, lang)}</small>
                  </div>
                  <div className="wallet-tx-amount-col">
                    <strong
                      dir="ltr"
                      className={isCredit ? "wallet-amt-credit" : "wallet-amt-debit"}
                    >
                      {isCredit ? "+" : "-"}
                      {money(Math.abs(Number(tx.amount)), summary.currency, lang)}
                    </strong>
                    <small>
                      {isEn ? "Balance" : "الرصيد"}:{" "}
                      {money(Number(tx.balance_after), summary.currency, lang)}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
