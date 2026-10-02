import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "../config/appConfig.js";
import { rateLimited } from "../errors/appError.js";

const loopbackOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isCorsOriginAllowed(origin, corsConfig = config.cors) {
  if (!origin) return true;
  if (corsConfig.allowedOrigins.has(origin)) return true;
  return Boolean(corsConfig.allowLoopbackOrigins && loopbackOriginPattern.test(origin));
}

function clientKey(req) {
  return req.user?.owner_id ? `user:${req.user.owner_id}` : req.ip || req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter({ windowMs, max, message, maxBuckets = 10000, now = Date.now }) {
  if (
    !Number.isInteger(windowMs) ||
    windowMs < 1 ||
    !Number.isInteger(max) ||
    max < 1 ||
    !Number.isInteger(maxBuckets) ||
    maxBuckets < 1
  )
    throw new Error("Invalid rate limit configuration");
  const buckets = new Map();
  let nextPruneAt = 0;
  return (req, res, next) => {
    const time = now();
    if (time >= nextPruneAt) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= time) buckets.delete(key);
      nextPruneAt = time + Math.min(windowMs, 60000);
    }
    // One bucket per client per limiter: varying a path/query cannot bypass the limit.
    const key = clientKey(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      if (!bucket && buckets.size >= maxBuckets) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((nextPruneAt - time) / 1000))));
        return next(rateLimited(message));
      }
      bucket = { count: 0, resetAt: time + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(max - bucket.count, 0)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - time) / 1000))));
      return next(rateLimited(message));
    }
    return next();
  };
}

export const apiRateLimit = createRateLimiter({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.apiMax,
  message: "Too many requests. Please try again later."
});

export const authRateLimit = createRateLimiter({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.authMax,
  message: "Too many authentication attempts. Please try again later."
});

export const importPreviewRateLimit = createRateLimiter({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.importPreviewMax,
  message: "Too many import previews. Please try again later."
});

export const importActionRateLimit = createRateLimiter({
  windowMs: config.rateLimits.windowMs,
  max: config.rateLimits.importActionMax,
  message: "Too many import actions. Please try again later."
});

export function configureSecurity(app) {
  app.disable("x-powered-by");
  if (config.isProduction) app.set("trust proxy", 1);

  const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'", "data:"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    imgSrc: ["'self'", "data:"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"]
  };
  if (config.isProduction) cspDirectives.upgradeInsecureRequests = [];

  app.use(
    helmet({
      contentSecurityPolicy: { directives: cspDirectives },
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "no-referrer" }
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (isCorsOriginAllowed(origin)) return callback(null, true);
        const error = new Error("Origin not allowed");
        error.status = 403;
        error.code = "FORBIDDEN";
        return callback(error);
      },
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600
    })
  );

  app.use("/api", apiRateLimit);
  app.use(express.json({ limit: config.requestBodyLimit, strict: true, type: "application/json" }));
}
