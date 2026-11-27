const tones = {
  active: "good", verified: "good", completed: "good", delivered: "good", succeeded: "good", closed: "good", paid: "good", refunded: "good",
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

export function directoryHref(path: "/admin/orders" | "/admin/products", options: {
  q?: string; status?: string; page?: number; inspect?: string; categories?: boolean;
} = {}) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.status) params.set("status", options.status);
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

