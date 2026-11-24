"use client";

import { ListChecks } from "lucide-react";
import { normalizeSpecs, type ProductSpec } from "@/lib/specs";
import { localizedText } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";

export function ProductSpecsTable({
  specs,
}: {
  specs?: ProductSpec[] | null;
}) {
  const { lang, t } = useLanguage();
  const rows = normalizeSpecs(specs);
  if (rows.length === 0) return null;

  return (
    <section
      className="specs-section shop-animate"
      aria-labelledby="product-specs-heading"
    >
      <div className="specs-section-head">
        <span className="section-kicker">{t("specsKicker")}</span>
        <h2 id="product-specs-heading" className="specs-heading">
          <ListChecks size={19} aria-hidden="true" />
          <span>{t("specsTitle")}</span>
        </h2>
      </div>

      <div className="specs-card">
        <dl className="specs-list">
          {rows.map((row, idx) => (
            <div key={idx} className="specs-row">
              <dt className="specs-key">
                {localizedText(lang, row.key_ar, row.key_en)}
              </dt>
              <dd className="specs-value">
                {localizedText(lang, row.value_ar, row.value_en)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
