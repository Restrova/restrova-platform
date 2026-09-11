import { afterEach, expect, it, vi } from "vitest";
import { subscribeToAlerts } from "../lib/push.js";
afterEach(() => vi.unstubAllGlobals());
it("registers and subscribes after explicit permission without exposing a private key", async () => {
  const subscription = {
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/example", keys: { auth: "a", p256dh: "b" } })
  };
  const subscribe = vi.fn().mockResolvedValue(subscription),
    register = vi.fn().mockResolvedValue({ pushManager: { getSubscription: async () => null, subscribe } });
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });
  vi.stubGlobal("navigator", { serviceWorker: { register, ready: Promise.resolve() } });
  expect(await subscribeToAlerts("AQID")).toEqual(subscription.toJSON());
  expect(register).toHaveBeenCalledWith("/alert-sw.js");
  expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: Uint8Array.from([1, 2, 3]) });
});
it("permission denial never registers a service worker or subscription", async () => {
  const register = vi.fn();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("denied") });
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  await expect(subscribeToAlerts("AQID")).rejects.toThrow("permission");
  expect(register).not.toHaveBeenCalled();
});
