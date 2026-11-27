import type { Lang } from "@/lib/i18n";

// Preserve the merchant's wording, including amounts and offers embedded in a sentence.
const numbers = /((?:[$€£]\s*)?[+−-]?[0-9٠-٩۰-۹]+(?:[.,٬٫][0-9٠-٩۰-۹]+)*(?:\s*[%٪]|\s+(?:[A-Z]{3}\b|ج\.م\.?))?)/g;

export function StoreCopy({ text, lang }: { text: string; lang: Lang }) {
  const script = /[\u0620-\u064a\u066e-\u06d3]/.test(text) ? "ar" : /[a-z]/i.test(text) ? "en" : lang;
  return <span className="sf-copy" lang={script} dir="auto">{text.split(numbers).map((part, i) =>
    i % 2 ? <bdi key={i} dir="ltr">{part}</bdi> : part)}</span>;
}
