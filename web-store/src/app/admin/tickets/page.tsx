import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import { checked, requireAdmin } from "@/lib/db";
import { date } from "@/lib/brand";
import { ticketStatusLabel } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { pagination, nextTicket } from "@/lib/workflow";
import { updateTicket } from "../mutations";
import { Status, Notice, Empty, Pager } from "../ui";

export default async function TicketsPage({
  searchParams,
}: PageProps<"/admin/tickets">) {
  const [params, lang, { db, storeId }] = await Promise.all([
    searchParams,
    getServerLang(),
    requireAdmin(),
  ]);
  const isEn = lang === "en";
  const { from, to, page } = pagination(params.page);
  const result = await db
    .from("support_tickets")
    .select("id,subject,message,status,admin_reply,order_id,created_at", {
      count: "exact",
    })
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, to);
  const rows = checked(result);
  return (
    <>
      <h1>{isEn ? "Support Tickets" : "تذاكر الدعم"}</h1>
      <Notice result={params.result} />
      <section className="card">
        {!rows.length && (
          <Empty>
            {isEn ? "No support tickets yet." : "لا توجد تذاكر دعم."}
          </Empty>
        )}
        {rows.map((tk) => (
          <details key={tk.id}>
            <summary>
              {tk.subject}
              <Status value={tk.status} />
            </summary>
            <p>{date(tk.created_at, lang)}</p>
            <p className="message">{tk.message}</p>
            {tk.order_id && (
              <Link href={"/admin/orders/" + tk.order_id}>
                {isEn ? "View Order" : "عرض الطلب"} #{tk.order_id.slice(0, 8)}
              </Link>
            )}
            <form action={updateTicket}>
              <input type="hidden" name="id" value={tk.id} />
              <input type="hidden" name="previous" value={tk.status} />
              <input
                type="hidden"
                name="previous_reply"
                value={tk.admin_reply}
              />
              <label>
                {isEn ? "Admin Reply" : "رد الإدارة"}
                <textarea name="reply" defaultValue={tk.admin_reply} />
              </label>
              <label>
                {isEn ? "Status" : "الحالة"}
                <select name="status" defaultValue={tk.status}>
                  {[tk.status, ...(nextTicket[tk.status] ?? [])].map((s) => (
                    <option key={s} value={s}>
                      {ticketStatusLabel(s, lang)}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton>
                {isEn ? "Save Reply & Status" : "حفظ الرد والحالة"}
              </SubmitButton>
            </form>
          </details>
        ))}
        <Pager page={page} base="/admin/tickets" count={result.count ?? 0} />
      </section>
    </>
  );
}
