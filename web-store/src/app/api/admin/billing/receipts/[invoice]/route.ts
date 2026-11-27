import { serverDb } from "@/lib/db";
import { UUID_RE } from "@/lib/paymob";
import { adminDb } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ invoice: string }> }) {
  const { invoice } = await params;
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  const missing = () => new Response(null, { status: 404, headers });
  if (!UUID_RE.test(invoice)) return missing();
  // Invoice RLS checks manage_billing for this store or platform super-admin.
  const db = await serverDb();
  const { data: row } = await db.from("subscription_invoices").select("store_id,receipt_path").eq("id", invoice).maybeSingle();
  if (!row?.receipt_path || !row.receipt_path.startsWith(row.store_id + "/")) return missing();
  const parts = row.receipt_path.split("/");
  if (parts.length !== 3 || !UUID_RE.test(parts[1]) || !/^[a-f0-9]{64}\.(jpe?g|webp|png)$/i.test(parts[2])) return missing();
  const { data, error } = await adminDb().storage.from("billing-receipts").createSignedUrl(row.receipt_path, 120);
  if (error || !data) return missing();
  return new Response(null, { status: 307, headers: { ...headers, Location: data.signedUrl } });
}
