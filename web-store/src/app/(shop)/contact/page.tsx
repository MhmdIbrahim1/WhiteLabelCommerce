import { MessageCircle } from "lucide-react";
import { settings } from "@/lib/shop";
import { normalizePhone } from "@/lib/phone";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { sendTicket } from "./action";

export default async function Contact({ searchParams }: PageProps<"/contact">) {
  const [s, lang, params] = await Promise.all([
    settings(),
    getServerLang(),
    searchParams,
  ]);
  const isEn = lang === "en";
  const phone = normalizePhone(s.whatsapp);
  const { sent } = params;
  return (
    <>
      <h1>{t(lang, "contactTitle")}</h1>
      <div className="details-grid">
        <section className="panel">
          <h2>{isEn ? "Send a Support Message" : "أرسل رسالة للدعم"}</h2>
          <form action={sendTicket}>
            {typeof params.order === "string" && <input type="hidden" name="order" value={params.order} />}
            <label>
              {t(lang, "contactSubject")}
              <input name="subject" required maxLength={160} />
            </label>
            <label>
              {t(lang, "contactMessage")}
              <textarea name="message" rows={6} required maxLength={4000} />
            </label>
            <button>{t(lang, "contactSend")}</button>
            {sent && (
              <p role="status">
                {sent === "yes"
                  ? isEn
                    ? "We received your message."
                    : "استلمنا رسالتك."
                  : isEn
                    ? "Could not send message. Please try again."
                    : "تعذر إرسال الرسالة. أعد المحاولة."}
              </p>
            )}
          </form>
        </section>
        {/^\d{8,15}$/.test(phone) && (
          <section className="panel">
            <h2>{isEn ? "Store WhatsApp" : "واتساب المتجر"}</h2>
            <a className="cta" href={"https://wa.me/" + phone}>
              <MessageCircle size={18} /> {t(lang, "contactWhatsApp")}
            </a>
          </section>
        )}
      </div>
    </>
  );
}
