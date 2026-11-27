type Payload = Record<string, unknown>;

// Both URLs belong to this mounted storefront, even on hosts that share a cookie jar.
export function createCartHeartbeat(storeId: string, slug: string) {
  const api = "/s/" + encodeURIComponent(slug) + "/api";
  const abandonedUrl = api + "/abandoned-cart";
  const notificationUrl = api + "/notifications/cart-heartbeat";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: AbortController | undefined;
  let recovery: AbortController | undefined;

  function cancelHeartbeat() {
    clearTimeout(timer);
    timer = undefined;
    heartbeat?.abort();
    heartbeat = undefined;
  }

  async function post(url: string, payload: Payload, signal: AbortSignal) {
    try {
      await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, storeId }), signal,
      });
    } catch { /* Cart storage remains available offline. */ }
  }

  return {
    schedule(payload: () => { notification: Payload; abandoned: Payload }) {
      cancelHeartbeat();
      timer = setTimeout(async () => {
        timer = undefined;
        const current = new AbortController();
        heartbeat = current;
        const { notification, abandoned } = payload();
        await Promise.all([
          post(notificationUrl, notification, current.signal),
          post(abandonedUrl, abandoned, current.signal),
        ]);
        if (heartbeat === current) heartbeat = undefined;
      }, 1500);
    },
    async recover(payload: Payload) {
      cancelHeartbeat();
      recovery?.abort();
      const current = new AbortController();
      recovery = current;
      await post(abandonedUrl, { ...payload, action: "recover" }, current.signal);
      if (recovery === current) recovery = undefined;
    },
    cancel() {
      cancelHeartbeat();
      recovery?.abort();
      recovery = undefined;
    },
  };
}
