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

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { deep_link: deepLink, ...data },
      tag: data.category || "store_notification",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.deep_link) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
