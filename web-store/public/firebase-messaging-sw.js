/* Firebase Cloud Messaging Service Worker for WhiteLabelCommerce Web Push */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "Notification", body: event.data.text() } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || "WhiteLabelCommerce";
  const body = notification.body || data.body || "";
  const deepLink = data.deep_link || "/";
  const notificationId = data.notification_id || null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: {
        deep_link: deepLink,
        notification_id: notificationId,
        ...data,
      },
      tag: notificationId || data.category || "store_notification",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const rawUrl = data.deep_link || "/";
  const notificationId = data.notification_id || null;

  let targetUrl = rawUrl;
  if (notificationId && !targetUrl.includes("notif_id=")) {
    const sep = targetUrl.includes("?") ? "&" : "?";
    targetUrl = `${targetUrl}${sep}notif_id=${encodeURIComponent(notificationId)}`;
  }

  const markReadPromise = notificationId
    ? fetch("/api/notifications/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notificationId }),
      }).catch(() => {})
    : Promise.resolve();

  const openPromise = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    });

  event.waitUntil(Promise.all([markReadPromise, openPromise]));
});
