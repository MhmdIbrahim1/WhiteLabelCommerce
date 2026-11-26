"use client";
import { useLanguage } from "../language-provider";

export function InvoiceButton() {
  const {lang} = useLanguage();
  return <button type="button" onClick={()=>window.print()}>{lang==="en" ? "Print invoice" : "طباعة الفاتورة"}</button>;
}
