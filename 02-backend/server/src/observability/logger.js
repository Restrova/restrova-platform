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
  else console.info(line);
}

export function logInfo(event, fields = {}) {
  write("info", event, fields);
}

export function logError(error, status) {
  write("error", "request_error", {
    status,
    type: error?.code || error?.name || "unknown_error"
  });
}

export function requestLogger(req, res, next) {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
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
