"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Mail, MailOpen, Send, Search } from "lucide-react";
import { WorkspaceHeading, StatusDot } from "@/components/workspace-data";
import { ticketStatusLabel, type Lang } from "@/lib/i18n";
import { nextTicket } from "@/lib/workflow";
import { inboxHref, inboxFilters, ticketPriorities, type Inbox, type InboxQuery, type TicketDetail, type Priority } from "@/lib/support-inbox";
import { changeTicket } from "./actions";

const priorityNames: Record<Priority, [string, string]> = {
  low: ["Low", "منخفضة"], normal: ["Normal", "عادية"], high: ["High", "عالية"], urgent: ["Urgent", "عاجلة"],
};
export function SupportInbox({ lang, storeId, query, inbox, detail }: {
  lang: Lang; storeId: string; query: InboxQuery; inbox: Inbox; detail: TicketDetail | null;
}) {
  const en = lang === "en";
  const label = (english: string, arabic: string) => en ? english : arabic;
  const priorityName = (p: Priority) => priorityNames[p][en ? 0 : 1];
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState("");
  const [body, setBody] = useState("");
  const [optimisticRead, setOptimisticRead] = useState<boolean | null>(() => detail && !detail.is_read ? true : null);
  const opened = useRef(false);
  const ticket = detail?.id;
  const savedRead = detail?.is_read;
  const saveRead = useCallback((read: boolean) => {
    if (!ticket) return;
    start(async () => {
      try {
        const ok = await changeTicket(storeId, ticket, { kind: "read", read });
        setFeedback(ok ? "" : "error");
      } catch { setFeedback("error"); }
      finally { setOptimisticRead(null); }
    });
  }, [storeId, ticket]);
  useEffect(() => {
    if (!ticket || opened.current) return;
    opened.current = true;
    if (!savedRead) saveRead(true);
  }, [ticket, savedRead, saveRead]);
  function markRead(read: boolean) {
    setOptimisticRead(read);
    saveRead(read);
  }
  const read = optimisticRead ?? savedRead;
  const unread = Math.max(0, inbox.unread_count + (optimisticRead == null || optimisticRead === savedRead ? 0 : optimisticRead ? -1 : 1));
  const href = (values: Partial<InboxQuery>) => inboxHref({ ...query, page: inbox.page, ticket: "", ...values });
  const stamp = (value: string) => new Intl.DateTimeFormat(en ? "en-GB" : "ar-EG", {
    dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
  }).format(new Date(value));
  function submit(form: FormData, reply: boolean) {
    if (!ticket || pending) return;
    const status = String(form.get("status"));
    start(async () => {
      try {
        const ok = await changeTicket(storeId, ticket, reply ? { kind: "reply", body, status }
          : { kind: "update", priority: String(form.get("priority")), status });
        setFeedback(ok ? "saved" : "error");
        if (ok && reply) setBody("");
      } catch { setFeedback("error"); }
    });
  }
  const statusOptions = detail && [detail.status, ...(nextTicket[detail.status] ?? [])].map(s =>
    <option key={s} value={s}>{ticketStatusLabel(s, lang)}</option>);
  const last = Math.max(1, Math.ceil(inbox.total_count / inbox.page_size));
  return <div className="ws-page support-inbox" data-selected={Boolean(detail)}>
    <WorkspaceHeading title={label("Support inbox", "صندوق الدعم")} />
    <div className="si-layout">
      <section className="si-list" aria-label={label("Ticket list", "قائمة التذاكر")}>
        <header><h2>{label("Tickets", "التذاكر")}</h2><span>{label("Unread", "غير مقروءة")} <bdi dir="ltr">{unread}</bdi></span></header>
        <form key={[query.q,query.filter,query.priority].join("|")} action="/admin/tickets" className="si-filters">
          <label className="si-search"><Search size={16} /><span className="ws-sr">{label("Search tickets", "بحث التذاكر")}</span>
            <input type="search" name="q" dir="auto" defaultValue={query.q} maxLength={100} placeholder={label("Search tickets", "بحث التذاكر")}/></label>
          <label><span className="ws-sr">{label("Filter tickets", "تصفية التذاكر")}</span><select name="filter" defaultValue={query.filter}>
            {inboxFilters.map(f => <option key={f} value={f}>{f === "all" ? label("All tickets","كل التذاكر") : f === "unread" ? label("Unread","غير مقروءة") : ticketStatusLabel(f,lang)}</option>)}</select></label>
          <label><span className="ws-sr">{label("Filter priority","تصفية الأولوية")}</span><select name="priority" defaultValue={query.priority}>
            <option value="all">{label("All priorities","كل الأولويات")}</option>{ticketPriorities.map(p => <option key={p} value={p}>{priorityName(p)}</option>)}</select></label>
          <button className="ws-button">{label("Filter","تصفية")}</button>
        </form>
        <ul>{inbox.rows.map(row => <li key={row.id}><Link href={href({ ticket: row.id })} prefetch={false} aria-current={row.id === ticket ? "page" : undefined}>
          <strong dir="auto">{!(row.id === ticket ? read : row.is_read) && <i className="si-unread" aria-label={label("Unread","غير مقروءة")} role="img"/>}{row.subject}</strong>
          <span className="si-snippet" dir="auto">{row.snippet}</span>
          <span className="si-meta"><span data-priority={row.priority}>{priorityName(row.priority)}</span>{row.order_id && <bdi dir="ltr">#{row.order_id.slice(0,8)}</bdi>}
          <time dateTime={row.last_message_at}><bdi dir="ltr">{stamp(row.last_message_at)}</bdi></time></span>
        </Link></li>)}</ul>
        {query.ticket && !detail && <p role="status">{label("Ticket unavailable.","التذكرة غير متاحة.")}</p>}
        {!inbox.rows.length && <p>{label("No matching tickets.","لا توجد تذاكر مطابقة.")}</p>}
        {last > 1 && <nav className="si-pager" aria-label={label("Ticket pages","صفحات التذاكر")}>
          {inbox.page > 1 && <Link href={href({ page: inbox.page - 1 })}>{label("Previous","السابق")}</Link>}
          <bdi dir="ltr">{inbox.page} / {last}</bdi>{inbox.page < last && <Link href={href({ page: inbox.page + 1 })}>{label("Next","التالي")}</Link>}</nav>}
      </section>
      <section className="si-thread" aria-label={label("Conversation","المحادثة")}>
        {detail ? <>
          <Link href={href({})} className="si-back"><ArrowLeft className="pt-directional" size={16}/>{label("Back to inbox","العودة إلى التذاكر")}</Link>
          <div className="si-heading"><h2 dir="auto">{detail.subject}</h2><StatusDot status={detail.status}>{ticketStatusLabel(detail.status,lang)}</StatusDot></div>
          {(detail.customer_name || detail.customer_email) && <p><bdi dir="auto">{detail.customer_name}</bdi> <bdi dir="ltr">{detail.customer_email}</bdi></p>}
          {detail.order_id && <Link href={"/admin/orders/"+detail.order_id}>{label("View order","عرض الطلب")} <bdi dir="ltr">#{detail.order_id.slice(0,8)}</bdi></Link>}
          <div className="si-toolbar"><form key={detail.priority + detail.status} onSubmit={event => { event.preventDefault(); submit(new FormData(event.currentTarget), false); }}>
            <label>{label("Priority","الأولوية")}<select name="priority" defaultValue={detail.priority}>{ticketPriorities.map(p => <option key={p} value={p}>{priorityName(p)}</option>)}</select></label>
            <label>{label("Status","الحالة")}<select name="status" defaultValue={detail.status}>{statusOptions}</select></label>
            <button className="ws-button" disabled={pending}>{label("Save","حفظ")}</button>
          </form><button className="ws-button" disabled={pending} onClick={() => markRead(!read)}>{read ? <Mail size={15}/> : <MailOpen size={15}/>}
            {read ? label("Mark unread","تمييز كغير مقروءة") : label("Mark read","تمييز كمقروءة")}</button></div>
          <ol className="si-messages">{detail.messages.map(m => <li key={m.id} data-role={m.sender_role}>
            <div><strong>{m.sender_role === "merchant" ? label("Merchant","التاجر") : m.sender_role === "customer" ? label("Customer","العميل") : label("System","النظام")}</strong>
              <time dateTime={m.created_at}><bdi dir="ltr">{stamp(m.created_at)}</bdi></time></div><p dir="auto">{m.body}</p></li>)}</ol>
          {detail.status !== "closed" && <form className="si-compose" onSubmit={event => { event.preventDefault(); submit(new FormData(event.currentTarget), true); }}>
            <label>{label("Reply","الرد")}<textarea name="body" readOnly={pending} value={body} onChange={e => setBody(e.target.value)} dir="auto" required maxLength={4000} rows={3}/></label>
            <div><label>{label("Status after reply","الحالة بعد الرد")}<select key={detail.status} name="status" defaultValue={detail.status === "open" ? "in_progress" : detail.status}>{statusOptions}</select></label>
            <button className="ws-primary" disabled={pending || !body.trim()}><Send size={16}/>{label("Send reply","إرسال الرد")}</button></div>
          </form>}
          <p role="status" aria-live="polite">{pending ? label("Saving…","جارٍ الحفظ…") : feedback === "saved" ? label("Saved.","تم الحفظ.") : feedback === "error" ? label("Could not save. Try again.","تعذّر الحفظ. حاول مجدداً.") : ""}</p>
        </> : <p>{label("Select a ticket to read its conversation.","اختر تذكرة للاطلاع على المحادثة.")}</p>}
      </section>
    </div>
  </div>;
}
