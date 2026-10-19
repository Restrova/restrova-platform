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

export function logError(error, status, fields = {}) {
  write("error", "request_error", {
    ...fields,
    status,
    type: error?.code || error?.name || "unknown_error"
  });
}

export function requestLogger(req, res, next) {
  const suppliedId = req.headers["x-request-id"];
  const requestId =
    typeof suppliedId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(suppliedId) ? suppliedId : crypto.randomUUID();
  const started = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    logInfo("http_request", {
      requestId,
      method: req.method,
      // Unknown paths may contain user-supplied secrets too. Log only registered route templates.
      route: req.route?.path || "unmatched",
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2))
    });
  });
  next();
}
