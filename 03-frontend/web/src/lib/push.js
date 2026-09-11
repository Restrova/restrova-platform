export async function subscribeToAlerts(publicKey) {
  if (
    !publicKey ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error("Push unavailable");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Push permission not granted");
  const registration = await navigator.serviceWorker.register("/alert-sw.js");
  await navigator.serviceWorker.ready;
  const key = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(key + "=".repeat((4 - (key.length % 4)) % 4)), (char) => char.charCodeAt(0));
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
  return subscription.toJSON();
}
