import { config } from "../config/appConfig.js";

export function logInfo(event, fields = {}) {
  if (config.isTest) return;
  console.info(JSON.stringify({ source: "restaurant-ai", event, ...fields }));
}

export function logError(error, status) {
  if (config.isTest) return;
  console.error(JSON.stringify({
    source: "restaurant-ai",
    event: "request_error",
    status,
    type: error?.code || error?.name || "unknown_error"
  }));
}
