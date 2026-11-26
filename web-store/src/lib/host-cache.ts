export type StoreRoute = { id: string; slug: string; primaryDomain: string | null };
type Entry = { route: StoreRoute | null; revision: string; expires: number };
export type RouteReply = {
  route_revision: string; unchanged: boolean; store_id: string | null; slug: string | null; primary_domain: string | null;
};

// Map insertion order is the LRU list. Reads never extend the original TTL.
export class HostRouteCache {
  private entries = new Map<string, Entry>();
  private capacity: number;
  private now: () => number;

  constructor(capacity = 512, now = Date.now) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("Invalid host cache capacity");
    this.capacity = capacity;
    this.now = now;
  }

  async resolve(key: string, check: (knownRevision: string | null) => Promise<RouteReply>): Promise<StoreRoute | null> {
    const entry = this.entries.get(key);
    const fresh = entry && entry.expires > this.now() ? entry : undefined;
    const reply = await check(fresh?.revision ?? null);
    if (reply.unchanged && !fresh) throw new Error("Missing cached route");
    const route = reply.unchanged && fresh ? fresh.route : reply.store_id && reply.slug
      ? { id: reply.store_id, slug: reply.slug, primaryDomain: reply.primary_domain }
      : null;

    // A slower request must not replace an entry populated after it started.
    if (this.entries.get(key) === entry) {
      this.entries.delete(key);
      this.entries.set(key, reply.unchanged && fresh ? fresh : {
        route, revision: reply.route_revision, expires: this.now() + (route ? 60_000 : 15_000),
      });
      if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    }
    return route;
  }
}
