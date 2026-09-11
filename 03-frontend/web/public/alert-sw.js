self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    /* Display a generic notification if the payload is malformed. */
  }
  event.waitUntil(
    self.registration.showNotification(String(data.title || "Restrova").slice(0, 200), {
      body: String(data.body || "Restrova alert").slice(0, 500),
      tag: `restrova-alert-${String(data.alertId || "new")}`
    })
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/app/alerts"));
});
