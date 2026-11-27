import { checked, requireAdmin } from "@/lib/db";
import { getServerLang } from "@/lib/i18n-server";
import { inboxQuery, type Inbox, type TicketDetail } from "@/lib/support-inbox";
import { SupportInbox } from "./support-inbox";
import "./inbox.css";

export default async function TicketsPage({ searchParams }: PageProps<"/admin/tickets">) {
  const [params, lang, { db, storeId }] = await Promise.all([searchParams, getServerLang(), requireAdmin("manage_customers")]);
  const query = inboxQuery(params);
  const [list, detail] = await Promise.all([
    db.rpc("admin_support_inbox", { p_store_id: storeId, p_filter: query.filter, p_priority: query.priority,
      p_q: query.q, p_page: query.page, p_page_size: 20 }),
    query.ticket ? db.rpc("admin_support_detail", { p_store_id: storeId, p_ticket_id: query.ticket }) : null,
  ]);
  if (detail?.error) throw new Error("Could not load the support thread");
  return <SupportInbox key={storeId + query.ticket} lang={lang} storeId={storeId} query={query}
    inbox={checked(list) as Inbox} detail={(detail?.data ?? null) as TicketDetail | null} />;
}
