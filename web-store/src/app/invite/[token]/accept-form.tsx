"use client";

import { useActionState } from "react";
import { limitLabel } from "@/lib/billing";
import type { Lang } from "@/lib/i18n";
import { acceptInvitation } from "./actions";

export function AcceptForm({ token, lang }: { token: string; lang: Lang }) {
  const [result, accept, pending] = useActionState(acceptInvitation.bind(null, token), null);
  const en = lang === "en";
  return <form action={accept}>
    <button disabled={pending}>{en ? "Accept invitation" : "قبول الدعوة"}</button>
    {result && <p role="status">{typeof result === "object" ? <>
      {en ? "The staff limit has been reached. Ask the owner to free a seat." : "بلغ المتجر حد مقاعد الفريق. اطلب من المالك إخلاء مقعد."}
      {" "}<bdi>({limitLabel(result.current, lang)} / {limitLabel(result.limit, lang)})</bdi></> :
      result === "member" ? (en ? "You already belong to this team." : "أنت عضو في هذا الفريق بالفعل.") :
      (en ? "Ask your team manager for a current invitation." : "اطلب دعوة سارية من مسؤول الفريق.")}</p>}
  </form>;
}
