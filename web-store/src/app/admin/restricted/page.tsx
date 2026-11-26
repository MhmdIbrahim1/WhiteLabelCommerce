import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { requireAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";

export default async function RestrictedPage() {
  const [, lang] = await Promise.all([requireAdmin(), getServerLang()]);
  const en = lang === "en";
  return <section className="ws-restricted" dir={en ? "ltr" : "rtl"}>
    <span className="ws-shop-icon"><LockKeyhole size={23} aria-hidden="true" /></span>
    <h1>{en ? "Access restricted" : "الوصول مقيّد"}</h1>
    <p>{en ? "Your role gives you access to other parts of this store. Ask the store owner if you need this section too." : "يمكنك متابعة العمل في الأقسام المتاحة لدورك. إذا احتجت إلى هذا القسم، اطلب الصلاحية من مالك المتجر."}</p>
    <Link className="pt-action" href="/admin">{en ? "Back to workspace" : "العودة إلى لوحة المتجر"}</Link>
  </section>;
}
