"use client";

import { useEffect, useState } from "react";
import { Ruler, X } from "lucide-react";
import { detectSizeGuideTab, type SizeGuideTab } from "@/lib/specs";
import { useLanguage } from "@/components/language-provider";

const APPAREL_ROWS = [
  { size: "S", chest: "92–96", waist: "78–82", length: "69" },
  { size: "M", chest: "97–102", waist: "83–88", length: "71" },
  { size: "L", chest: "103–108", waist: "89–94", length: "73" },
  { size: "XL", chest: "109–115", waist: "95–101", length: "75" },
  { size: "XXL", chest: "116–122", waist: "102–108", length: "77" },
];

const PANTS_ROWS = [
  { size: "30", waist: "76–79", hip: "94–97", inseam: "78" },
  { size: "32", waist: "81–84", hip: "99–102", inseam: "79" },
  { size: "34", waist: "86–89", hip: "104–107", inseam: "80" },
  { size: "36", waist: "91–94", hip: "109–112", inseam: "81" },
  { size: "38", waist: "96–100", hip: "114–118", inseam: "81" },
];

const SHOES_ROWS = [
  { eu: "40", us: "7", uk: "6.5", cm: "25.0" },
  { eu: "41", us: "8", uk: "7.5", cm: "25.8" },
  { eu: "42", us: "9", uk: "8.5", cm: "26.5" },
  { eu: "43", us: "10", uk: "9.5", cm: "27.3" },
  { eu: "44", us: "11", uk: "10.5", cm: "28.0" },
  { eu: "45", us: "12", uk: "11.5", cm: "28.8" },
];

export function SizeGuideModal({
  open,
  onClose,
  sizes,
}: {
  open: boolean;
  onClose: () => void;
  sizes: string[];
}) {
  const { lang, t } = useLanguage();
  const isEn = lang === "en";
  const [tab, setTab] = useState<SizeGuideTab>(() => detectSizeGuideTab(sizes));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="size-guide-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="size-guide-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="size-guide-modal">
        <div className="size-guide-head">
          <h3 id="size-guide-title">
            <Ruler size={18} aria-hidden="true" />
            <span>{t("sizeGuideTitle")}</span>
          </h3>
          <button
            type="button"
            className="icon-ghost-btn"
            aria-label={t("sizeGuideClose")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="size-guide-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "apparel"}
            className={tab === "apparel" ? "is-active" : ""}
            onClick={() => setTab("apparel")}
          >
            {t("sizeGuideApparel")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pants"}
            className={tab === "pants" ? "is-active" : ""}
            onClick={() => setTab("pants")}
          >
            {t("sizeGuidePants")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "shoes"}
            className={tab === "shoes" ? "is-active" : ""}
            onClick={() => setTab("shoes")}
          >
            {t("sizeGuideShoes")}
          </button>
        </div>

        <div className="size-guide-table-wrap">
          {tab === "apparel" && (
            <table className="size-guide-table">
              <thead>
                <tr>
                  <th>{isEn ? "Size" : "المقاس"}</th>
                  <th>{isEn ? "Chest (cm)" : "الصدر (سم)"}</th>
                  <th>{isEn ? "Waist (cm)" : "الخصر (سم)"}</th>
                  <th>{isEn ? "Length (cm)" : "الطول (سم)"}</th>
                </tr>
              </thead>
              <tbody>
                {APPAREL_ROWS.map((r) => (
                  <tr key={r.size}>
                    <td><strong>{r.size}</strong></td>
                    <td dir="ltr">{r.chest}</td>
                    <td dir="ltr">{r.waist}</td>
                    <td dir="ltr">{r.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "pants" && (
            <table className="size-guide-table">
              <thead>
                <tr>
                  <th>{isEn ? "Waist (EU/US)" : "مقاس الخصر"}</th>
                  <th>{isEn ? "Waist (cm)" : "محيط الخصر (سم)"}</th>
                  <th>{isEn ? "Hip (cm)" : "الأرداف (سم)"}</th>
                  <th>{isEn ? "Inseam (cm)" : "الطول الداخلي (سم)"}</th>
                </tr>
              </thead>
              <tbody>
                {PANTS_ROWS.map((r) => (
                  <tr key={r.size}>
                    <td><strong>{r.size}</strong></td>
                    <td dir="ltr">{r.waist}</td>
                    <td dir="ltr">{r.hip}</td>
                    <td dir="ltr">{r.inseam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "shoes" && (
            <table className="size-guide-table">
              <thead>
                <tr>
                  <th>EU</th>
                  <th>US</th>
                  <th>UK</th>
                  <th>{isEn ? "Foot Length (cm)" : "طول القدم (سم)"}</th>
                </tr>
              </thead>
              <tbody>
                {SHOES_ROWS.map((r) => (
                  <tr key={r.eu}>
                    <td><strong>{r.eu}</strong></td>
                    <td dir="ltr">{r.us}</td>
                    <td dir="ltr">{r.uk}</td>
                    <td dir="ltr">{r.cm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="size-guide-note">
          {isEn
            ? "Tip: If you are between two sizes, we recommend sizing up for a relaxed fit."
            : "نصيحة: إذا كان مقاسك بين مقاسين، ننصح باختيار المقاس الأكبر لمزيد من الراحة."}
        </p>
      </div>
    </div>
  );
}
