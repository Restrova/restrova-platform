import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext.jsx";
import { dataChangedEvent, dataTabId } from "../lib/dataRefresh.js";
export function ImportDataBridge() {
  const client = useQueryClient(),
    auth = useAuth(),
    organizationId = auth.organization?.id,
    refreshDataSession = auth.refreshDataSession;
  useEffect(() => {
    const receive = (detail) => {
      if (detail?.organizationId && String(detail.organizationId) !== String(organizationId)) return;
      client.invalidateQueries();
      refreshDataSession?.();
    };
    const handler = (event) => receive(event.detail);
    window.addEventListener(dataChangedEvent, handler);
    let channel;
    try {
      channel = new BroadcastChannel("restrova-data");
      channel.onmessage = (event) => {
        if (event.data?.originTabId === dataTabId) return;
        if (event.data?.organizationId && String(event.data.organizationId) !== String(organizationId)) return;
        window.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: event.data }));
      };
    } catch {
      /* Cross-tab support is optional. */
    }
    return () => {
      window.removeEventListener(dataChangedEvent, handler);
      channel?.close();
    };
  }, [client, organizationId, refreshDataSession]);
  return null;
}
