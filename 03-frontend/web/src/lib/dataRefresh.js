export const dataTabId = crypto.randomUUID();
export const dataChangedEvent = "restrova:data-changed";
export function announceDataChange(detail) {
  window.dispatchEvent(new CustomEvent(dataChangedEvent, { detail }));
  // A small revision notification only; never broadcast restaurant records or tokens.
  try {
    const channel = new BroadcastChannel("restrova-data");
    channel.postMessage({ ...detail, originTabId: dataTabId });
    channel.close();
  } catch {
    /* Same-tab refresh still works. */
  }
}
