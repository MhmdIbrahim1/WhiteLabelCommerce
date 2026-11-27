"use client";
import { useFormStatus } from "react-dom";
import { Check, ShoppingBag } from "lucide-react";
import {
  templates,
  templateVars,
  type TemplateId,
} from "@/lib/theme-templates";
import { useLanguage } from "@/components/language-provider";
import { applyTemplate } from "../mutations";

function Choices({ active }: { active: TemplateId }) {
  const { pending } = useFormStatus();
  const { lang } = useLanguage();
  const isEn = lang === "en";
  return (
    <div className="template-grid">
      {(Object.keys(templates) as TemplateId[]).map((id) => {
        const tpl = templates[id];
        return (
          <button
            key={id}
            type="submit"
            name="template"
            value={id}
            aria-pressed={active === id}
            disabled={pending}
            style={templateVars(id)}
            className="template-choice"
          >
            <span className="mini-shop" aria-hidden="true">
              <span className="mini-nav">
                <ShoppingBag size={13} />
                <i />
                <i />
              </span>
              <span className="mini-hero">
                <span />
                <i />
              </span>
              <span className="mini-products">
                {[1, 2, 3].map((n) => (
                  <i key={n} />
                ))}
              </span>
            </span>
            <strong>
              {isEn ? tpl.title_en : tpl.title}
              {active === id && <Check size={17} />}
            </strong>
            <span>{isEn ? tpl.description_en : tpl.description}</span>
            <span className="swatches" aria-hidden="true">
              {[tpl.primary, tpl.accent, tpl.surface].map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TemplateGallery({ active }: { active: TemplateId }) {
  const { lang } = useLanguage();
  const isEn = lang === "en";
  return (
    <section className="ws-box">
      <h2>{isEn ? "Storefront appearance" : "مظهر واجهة المتجر"}</h2>
      <p>{isEn ? "Choose a template to apply its colors and layout to the storefront." : "اختر قالباً لتطبيق ألوانه وتخطيطه على واجهة المتجر."}</p>
      <form action={applyTemplate}>
        <Choices active={active} />
      </form>
    </section>
  );
}
