import { MessageCircle } from "lucide-react";
import { settings } from "@/lib/shop";
import { normalizePhone } from "@/lib/phone";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { sendTicket } from "./action";

export default async function Contact({ searchParams }: PageProps<"/contact">) {
  const [s, params] = await Promise.all([settings(), searchParams]);
  const lang = await getServerLang(s.uiConfig.defaultLanguage);
  const isEn = lang === "en";
  const phone = normalizePhone(s.whatsapp);
  const { sent } = params;
  const feedback = sent === "yes" ? (isEn ? "We received your message." : "استلمنا رسالتك.")
    : sent === "rate_limit" ? (isEn ? "Too many support requests. Try again in 15 minutes." : "أرسلت عدة طلبات دعم. حاول مجدداً بعد 15 دقيقة.")
    : sent === "invalid" ? (isEn ? "Enter a subject of up to 160 characters and a message of up to 4,000 characters." : "أدخل موضوعاً حتى 160 حرفاً ورسالة حتى 4000 حرف.")
    : sent === "no" ? (isEn ? "Could not send your message. Please try again." : "تعذر إرسال رسالتك. أعد المحاولة.") : "";
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
            {feedback && <p role="status">{feedback}</p>}
          </form>
        </section>
        {/^\d{8,15}$/.test(phone) && (
          <section className="panel">
            <h2>{isEn ? "Store WhatsApp" : "واتساب المتجر"}</h2>
            <a className="cta" href={"https://wa.me/" + phone}>
              <MessageCircle strokeWidth={1.5} size={18} /> {t(lang, "contactWhatsApp")}
            </a>
          </section>
        )}
      </div>
    </>
  );
}
