import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "تعذّر التحقق من الدفع · Payment verification" },
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function PaymentReturnError() {
  return <main className="panel" style={{ maxInlineSize: "38rem", margin: "12vh auto", padding: "clamp(1.25rem, 5vw, 3rem)" }}>
    <section lang="ar" dir="rtl"><h1>تعذّر التحقق من نتيجة الدفع</h1><p>افتح صفحة طلباتك في المتجر للتحقق من حالة طلبك.</p></section>
    <section lang="en" dir="ltr"><h2>We couldn’t verify this payment</h2><p>Open My Orders in the store to check your order.</p></section>
  </main>;
}
