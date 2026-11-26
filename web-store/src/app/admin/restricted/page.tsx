import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { requireAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";

export default async function RestrictedPage() {
  const [, lang] = await Promise.all([requireAdmin(), getServerLang()]);
  const en = lang === "en";
  return <section className="card" dir={en ? "ltr" : "rtl"}>
    <LockKeyhole size={24} aria-hidden="true" />
    <h1>{en ? "Access restricted" : "الوصول مقيّد"}</h1>
    <p>{en ? "Ask your store owner for access to this section." : "اطلب من مالك متجرك صلاحية الوصول إلى هذا القسم."}</p>
    <Link href="/admin">{en ? "Back to workspace" : "العودة إلى مساحة العمل"}</Link>
  </section>;
}
