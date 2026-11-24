"use client";
import { useLanguage } from "@/components/language-provider";

export default function ErrorPanel({ reset }: { reset: () => void }) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  return (
    <section className="card">
      <h2>{isEn ? "Failed to Load Data" : "تعذر تحميل البيانات"}</h2>
      <p>
        {isEn
          ? "Please check your connection and database migrations."
          : "تحقق من الاتصال وتطبيق تحديث قاعدة البيانات."}
      </p>
      <button onClick={reset}>{isEn ? "Try Again" : "إعادة المحاولة"}</button>
    </section>
  );
}
