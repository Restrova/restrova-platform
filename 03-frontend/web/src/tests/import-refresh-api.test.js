import { afterEach, expect, it, vi } from "vitest";
import { api } from "../lib/api.js";
import { dataChangedEvent } from "../lib/dataRefresh.js";
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("publishes a revision only after successful confirmation of either supported import flow", async () => {
  const receive = vi.fn();
  window.addEventListener(dataChangedEvent, receive);
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ dataRevision: { organizationId: 1, restaurantId: 2, revision: 3 } }), {
          status: 200
        })
      )
    );
    await api("/data/import-jobs/9/confirm", { method: "POST", body: JSON.stringify({ confirmationToken: "test" }) });
    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive.mock.calls[0][0].detail.revision).toBe(3);
    fetch.mockResolvedValue(new Response(JSON.stringify({ error: "rejected" }), { status: 409 }));
    await expect(api("/data/import-jobs/10/confirm", { method: "POST" })).rejects.toThrow();
    expect(receive).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response(JSON.stringify({ status: "cancelled" }), { status: 200 }));
    await api("/data/import-jobs/10/cancel", { method: "POST" });
    expect(receive).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response(JSON.stringify({ dataRevision: { revision: 4 } }), { status: 201 }));
    await api("/data/import", { method: "POST" });
    expect(receive).toHaveBeenCalledTimes(2);
  } finally {
    window.removeEventListener(dataChangedEvent, receive);
  }
});
