import Link from "next/link";
import { limitLabel, quotaMessage, type Resource } from "@/lib/billing";
import type { Lang } from "@/lib/i18n";
import "./quota-prompt.css";

export function QuotaPrompt({ resource, lang, disabled = false, usage }: {
  resource: Resource; lang: Lang; disabled?: boolean; usage?: { current: number; limit: number | null };
}) {
  return <div className="quota-prompt" role="status"><span>{quotaMessage(resource, lang, disabled)}
    {usage && <> <bdi>({limitLabel(usage.current, lang)} / {limitLabel(usage.limit, lang)})</bdi></>}</span>
    <Link href="/admin/billing#plans">{lang === "en" ? "View plans and limits" : "عرض الباقات والحدود"}</Link></div>;
}
