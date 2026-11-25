import Link from "next/link";
import { ShieldAlert, Store, ArrowLeft, ArrowRight } from "lucide-react";
import { LanguageToggle } from "@/components/language-provider";
import type { Lang } from "@/lib/i18n";

export function SuspendedStoreGate({
  storeName,
  lang,
  canManage,
}: {
  storeName: string;
  lang: Lang;
  canManage: boolean;
}) {
  const isEn = lang === "en";
  const ArrowIcon = isEn ? ArrowRight : ArrowLeft;
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-slate-50 text-slate-900">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
            <Store size={16} />
            <span>{storeName}</span>
          </span>
          <LanguageToggle className="lang-toggle-pill" />
        </div>

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
          <ShieldAlert size={28} />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 m-0">
            {isEn
              ? "Store Temporarily Unavailable"
              : "المتجر غير متاح مؤقتاً"}
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            {isEn
              ? "This storefront is currently suspended and not accepting orders. Please check back later or contact the store administrator."
              : "هذا المتجر متوقف مؤقتاً ولا يستقبل طلبات في الوقت الحالي. يرجى المحاولة لاحقاً أو التواصل مع إدارة المتجر."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 no-underline"
          >
            <span>{isEn ? "Back to Main Platform" : "العودة للمنصة الرئيسية"}</span>
            <ArrowIcon size={15} />
          </Link>
          {canManage && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold hover:bg-slate-800 no-underline"
              style={{ color: "#ffffff" }}
            >
              <span>{isEn ? "Open Store Admin" : "فتح لوحة التحكم"}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
