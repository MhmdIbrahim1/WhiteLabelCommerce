const priorities = ["low", "normal", "high", "urgent"] as const;
export const ticketPriorities = priorities;
export const inboxFilters = ["all", "unread", "open", "in_progress", "closed"] as const;
export type Priority = typeof priorities[number];
export type InboxFilter = typeof inboxFilters[number];
export type TicketStatus = "open" | "in_progress" | "closed";
export type InboxQuery = { q: string; filter: InboxFilter; priority: Priority | "all"; page: number; ticket: string };
export function inboxQuery(params: Record<string, unknown>): InboxQuery {
  const page = Number(params.page);
  return {
    q: typeof params.q === "string" ? params.q.trim().slice(0,100) : "",
    filter: inboxFilters.find(v => v === params.filter) ?? "all",
    priority: priorities.find(v => v === params.priority) ?? "all",
    page: typeof params.page === "string" && Number.isSafeInteger(page) && page > 0 && page <= 1000000 ? page : 1,
    ticket: typeof params.ticket === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.ticket) ? params.ticket : "",
  };
}
export function inboxHref({ q, filter, priority, page, ticket }: InboxQuery) {
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (filter !== "all") query.set("filter", filter);
  if (priority !== "all") query.set("priority", priority);
  if (page > 1) query.set("page", String(page));
  if (ticket) query.set("ticket", ticket);
  return "/admin/tickets" + (query.size ? "?" + query : "");
}
export function supportInput(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && Array.from(trimmed).length <= max ? trimmed : null;
}
export function supportOutcome(error: { message: string } | null) {
  if (!error) return "yes";
  if (error.message === "rate_limit_exceeded") return "rate_limit";
  if (error.message === "invalid_support_message") return "invalid";
  return "no";
}
export type TicketRow = { id: string; subject: string; status: TicketStatus; priority: Priority; is_read: boolean;
  order_id: string | null; created_at: string; last_message_at: string; snippet: string };
export type Inbox = { rows: TicketRow[]; total_count: number; unread_count: number; page: number; page_size: number };
export type TicketDetail = Omit<TicketRow, "snippet"> & { customer_name: string | null; customer_email: string | null;
  messages: { id: string; sender_role: "customer" | "merchant" | "system"; body: string; created_at: string }[] };
