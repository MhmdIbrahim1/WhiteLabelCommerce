import Link from "next/link";
import { notFound } from "next/navigation";
import { checked, serverDb } from "@/lib/db";
import { formatDate, ticketStatusLabel, type Lang } from "@/lib/i18n";
import { UUID_RE } from "@/lib/paymob";
import { storeHref } from "@/lib/tenant";

type Message = { id: string; sender_role: string; body: string; created_at: string | null };

async function readThread(storeId: string, ticketId: string) {
  const db = await serverDb();
  const messages: Message[] = [];
  const batchSize = 100;
  for (let offset = 0; ; offset += batchSize) {
    const batch = checked(await db.from("support_ticket_messages").select("id,sender_role,body,created_at")
      .eq("store_id", storeId).eq("ticket_id", ticketId).order("created_at").order("id")
      .range(offset, offset + batchSize - 1));
    messages.push(...batch);
    if (batch.length < batchSize) return messages;
  }
}

export async function CustomerTickets({ lang, userId, storeId, basePath, ticketId }: {
  lang: Lang; userId: string; storeId: string; basePath: string; ticketId: string;
}) {
  const en = lang === "en";
  const db = await serverDb();
  const listUrl = storeHref(basePath, "/account/tickets");
  if (!ticketId) {
    const tickets = checked(await db.from("support_tickets").select("id,subject,status,created_at")
      .eq("store_id", storeId).eq("customer_id", userId).order("created_at", { ascending: false }).limit(50));
    return <>
      <Link className="section-more-link" href={storeHref(basePath, "/contact")}>{en ? "Contact support" : "تواصل مع الدعم"}</Link>
      {tickets.length ? <ul className="account-ticket-list">{tickets.map(ticket =>
        <li key={ticket.id}><Link href={listUrl + "?ticket=" + ticket.id}>
          <strong dir="auto">{ticket.subject}</strong>
          <span>{ticketStatusLabel(ticket.status, lang)} · <time dateTime={ticket.created_at}><bdi dir="ltr">{formatDate(ticket.created_at, lang)}</bdi></time></span>
        </Link></li>)}</ul> : <p>{en ? "You have no support tickets." : "لا توجد تذاكر دعم."}</p>}
    </>;
  }

  if (!UUID_RE.test(ticketId)) notFound();
  const { data: ticket, error } = await db.from("support_tickets").select("subject,status,message,admin_reply,created_at")
    .eq("id", ticketId).eq("store_id", storeId).eq("customer_id", userId).maybeSingle();
  if (error) throw new Error("Support ticket unavailable");
  if (!ticket) notFound();
  const messages = await readThread(storeId, ticketId);
  if (messages.length === 0) {
    messages.push({ id: "original", sender_role: "customer", body: ticket.message, created_at: ticket.created_at });
  }
  if (ticket.admin_reply && !messages.some(message => message.sender_role === "merchant")) {
    messages.push({ id: "legacy-reply", sender_role: "merchant", body: ticket.admin_reply, created_at: null });
  }
  const dateTime = new Intl.DateTimeFormat(en ? "en-GB" : "ar-EG", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo",
  });
  return <div className="account-thread">
    <Link className="section-more-link" href={listUrl}>{en ? "All tickets" : "كل التذاكر"}</Link>
    <header><h2 dir="auto">{ticket.subject}</h2><span>{ticketStatusLabel(ticket.status, lang)}</span></header>
    <ol aria-label={en ? "Conversation" : "المحادثة"}>{messages.map(message => <li key={message.id}>
      <div><strong>{message.sender_role === "customer" ? (en ? "You" : "أنت")
        : message.sender_role === "merchant" ? (en ? "Store support" : "دعم المتجر") : (en ? "System" : "النظام")}</strong>
        {message.created_at && <time dateTime={message.created_at}><bdi dir="ltr">{dateTime.format(new Date(message.created_at))}</bdi></time>}
      </div>
      <p dir="auto">{message.body}</p>
    </li>)}</ol>
  </div>;
}
