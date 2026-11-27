"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/db";
import { isRecordId } from "@/lib/workspace-directory";
import { supportInput, ticketPriorities } from "@/lib/support-inbox";
import { nextTicket } from "@/lib/workflow";

type Change = { kind: "read"; read: boolean } | { kind: "update"; priority: string; status: string } | { kind: "reply"; body: string; status: string };
export async function changeTicket(store: string, ticket: string, change: Change) {
  const { db, storeId } = await requireAdmin("manage_customers");
  if (store !== storeId || !isRecordId(ticket) || !change) return false;
  const args = { p_store_id: storeId, p_ticket_id: ticket };
  let result;
  if (change.kind === "read" && typeof change.read === "boolean") {
    result = await db.rpc("admin_support_mark_read", { ...args, p_read: change.read });
  } else if (change.kind === "update" && ticketPriorities.some(p => p === change.priority) && Object.hasOwn(nextTicket, change.status)) {
    result = await db.rpc("admin_support_update", { ...args, p_priority: change.priority, p_status: change.status });
  } else if (change.kind === "reply" && supportInput(change.body, 4000) && Object.hasOwn(nextTicket, change.status)) {
    result = await db.rpc("admin_support_reply", { ...args, p_body: change.body.trim(), p_status: change.status });
  } else return false;
  if (result.error) return false;
  revalidatePath("/admin/tickets");
  if (change.kind !== "read") revalidatePath("/account");
  return true;
}
