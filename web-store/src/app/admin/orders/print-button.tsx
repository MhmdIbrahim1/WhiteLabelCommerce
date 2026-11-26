"use client";

import { useLanguage } from "@/components/language-provider";

export function PrintButton() {
  const { lang } = useLanguage();
  return <button type="button" onClick={() => window.print()}>{lang === "en" ? "Print" : "طباعة"}</button>;
}
