const tones = {
  active: "good", verified: "good", completed: "good", delivered: "good", succeeded: "good", closed: "good", paid: "good", refunded: "good",
  review: "waiting", refund_pending: "waiting", unpaid: "neutral",
  draft: "neutral", expired: "neutral",
  pending: "waiting", pending_dns: "waiting", queued: "waiting", open: "waiting", trialing: "waiting", trial: "waiting",
  processing: "progress", confirmed: "progress", shipped: "progress", building: "progress", in_progress: "progress", approved: "progress", received: "progress",
  cancelled: "danger", canceled: "danger", past_due: "danger", failed: "danger", error: "danger", suspended: "danger", rejected: "danger",
} as const;

export function statusTone(status: string) {
  return Object.hasOwn(tones, status) ? tones[status as keyof typeof tones] : "neutral";
}

export function searchText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export const paymentFilters = ["paid", "unpaid", "pending", "failed", "refund_pending", "refunded", "cod_pending", "voided", "review"] as const;

function calendarDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return "";
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function orderFilters(params: { payment?: unknown; from?: unknown; to?: unknown }) {
  const payment = paymentFilters.find(option => option === params.payment) ?? "";
  let from = calendarDate(params.from);
  let to = calendarDate(params.to);
  // Keep both intended calendar boundaries when a bookmarked range is reversed.
  if (from && to && from > to) [from, to] = [to, from];
  return { payment, from, to };
}

export function directoryHref(path: "/admin/orders" | "/admin/products", options: {
  q?: string; status?: string; payment?: string; from?: string; to?: string; page?: number; inspect?: string; categories?: boolean;
} = {}) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.status) params.set("status", options.status);
  if (options.payment) params.set("payment", options.payment);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  if (options.inspect) params.set("inspect", options.inspect);
  if (options.categories) params.set("categories", "1");
  return params.size ? path + "?" + params : path;
}

export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
}

// UUIDs sort by their bytes. A prefix range also finds the shortened ID printed in the table.
export function orderIdBounds(query: string) {
  const prefix = query.replace(/^#/, "").replaceAll("-", "").toLowerCase();
  if (!/^[\da-f]{1,32}$/.test(prefix)) return null;
  const uuid = (fill: string) => prefix.padEnd(32, fill).replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  return { first: uuid("0"), last: uuid("f") };
}

