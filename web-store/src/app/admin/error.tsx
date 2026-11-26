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
          ? "Check your connection and try again."
          : "تحقق من اتصالك وحاول مرة أخرى."}
      </p>
      <button onClick={reset}>{isEn ? "Try Again" : "إعادة المحاولة"}</button>
    </section>
  );
}
