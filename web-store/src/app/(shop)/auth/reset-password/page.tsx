import Link from "next/link";
import { emailPasswordResetEnabled } from "@/lib/password-policy";
import { PasswordForm } from "@/components/shop/password-form";
import { settings } from "@/lib/shop";
import { storeHref } from "@/lib/tenant";
import { getServerLang } from "@/lib/i18n-server";

export const metadata = {referrer:"no-referrer" as const, robots:{index:false,follow:false}};
export default async function Reset({searchParams}:PageProps<"/auth/reset-password">) {
  const [store,lang,params]=await Promise.all([settings(),getServerLang(),searchParams]);
  const en=lang==="en";
  const token=params.type==="recovery" && typeof params.token_hash==="string" ? params.token_hash : undefined;
  const code=typeof params.code==="string" ? params.code : undefined;
  return <section className="panel hub-content" style={{maxWidth:"32rem",margin:"2rem auto"}}><h1>{en?"Reset password":"استعادة كلمة المرور"}</h1>
    {emailPasswordResetEnabled ? <PasswordForm mode={token || code ? "recover" : "request"} token={token} code={code} storeSlug={store.slug}/>
      : <p>{en?"Email password reset is currently unavailable.":"استعادة كلمة المرور بالبريد غير متاحة حالياً."}</p>}
    <Link href={storeHref(store.basePath,"/account")}>{en?"Back to account":"العودة إلى حسابي"}</Link></section>;
}
