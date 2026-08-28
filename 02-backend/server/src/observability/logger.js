import crypto from "node:crypto";
import { config } from "../config/appConfig.js";

function write(level, event, fields = {}) {
  if (config.isTest) return;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    source: "restrova-platform",
    environment: config.nodeEnv,
    event,
    ...fields
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(event, fields = {}) {
  write("info", event, fields);
}

export function logWarn(event, fields = {}) {
  write("warn", event, typeof fields === "string" ? { message: fields } : fields);
}

export function logError(error, status, fields = {}) {
  write("error", "request_error", {
    ...fields,
    status,
    type: error?.code || error?.name || "unknown_error"
  });
}

export function requestLogger(req, res, next) {
  // Client-supplied ids are only accepted in a safe format and capped length
  // so a spoofed header cannot inject log content or grow memory (Low/L-1).
  const clientRequestId = String(req.headers["x-request-id"] || "").slice(0, 64);
  const requestId = /^[A-Za-z0-9-_]+$/.test(clientRequestId) ? clientRequestId : crypto.randomUUID();
  const started = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    logInfo("http_request", {
      requestId,
      method: req.method,
      route: req.route?.path || req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2))
    });
  });
  next();
}
