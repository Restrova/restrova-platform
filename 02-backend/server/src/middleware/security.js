import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "../config/appConfig.js";
import { rateLimited } from "../errors/appError.js";

const loopbackOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
// Ephemeral sandbox preview hosts look like https://<port>-<sandbox-id>.e2b.app.
// The sandbox id changes every time the environment is recreated, so an exact
// allowlist entry can never stay current (a stale entry 403'd logins after a
// sandbox restart). ALLOW_PREVIEW_ORIGINS=true opts in to pattern matching;
// production keeps the strict exact-origin behaviour either way.
const previewOriginPattern = /^https:\/\/\d{1,5}-[a-z0-9][a-z0-9-]*\.e2b\.app$/;

export function isCorsOriginAllowed(origin, corsConfig = config.cors) {
  if (!origin) return true;
  if (corsConfig.allowedOrigins.has(origin)) return true;
  if (Boolean(corsConfig.allowLoopbackOrigins) && loopbackOriginPattern.test(origin)) return true;
  if (Boolean(corsConfig.allowPreviewOrigins) && previewOriginPattern.test(origin)) return true;
  return false;
}

// A request whose Origin matches the host it was sent to is same-origin:
// CORS does not apply to it by definition. Browsers send Origin on module
// scripts and POST/PUT/PATCH fetches even for same-origin requests, so these
// MUST NOT be rejected by the CORS allowlist (this previously 403'd the whole
// built frontend and every browser POST when CLIENT_ORIGIN was not set —
// found in the Phase 4 production-like test).
//
// Note on Host spoofing: on managed platforms the proxy sets Host, and the
// API uses bearer tokens only (no cookies), so a spoofed Host/Origin pair
// grants no additional access — the attacker could call the API directly.
export function isSameOrigin(origin, req) {
  if (!origin || !req) return false;
  const host = req.headers?.host || req.get?.("host");
  if (!host) return false;
  return origin === `${req.protocol}://${host}` || origin === `https://${host}`;
}

function clientKey(req) {
  return req.user?.owner_id ? `user:${req.user.owner_id}` : req.ip || req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map();
  // Expired buckets that are never hit again must still be removed, otherwise
  // the map grows without bound (one entry per client/endpoint combination).
  const sweepExpiredBuckets = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };
  const sweeper = setInterval(sweepExpiredBuckets, Math.min(windowMs, 60_000));
  sweeper.unref?.();
  return (req, res, next) => {
    const now = Date.now();
    // Normalize numeric path segments so /users/7/role and /users/8/role share
    // one bucket: keeps the key cardinality bounded and prevents rotating
    // resource ids from multiplying a client's request budget.
    const endpoint = String(req.route?.path || req.path || req.baseUrl).replace(/\/\d+(?=\/|$)/g, "/:id");
    const key = `${clientKey(req)}:${req.baseUrl || ""}:${endpoint}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(Math.max(max - 1, 0)));
      return next();
    }
    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(max - bucket.count, 0)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) return next(rateLimited(message));
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

  const corsMiddleware = cors({
    origin(origin, callback) {
      if (isCorsOriginAllowed(origin)) return callback(null, true);
      const error = new Error("Origin not allowed");
      error.status = 403;
      error.code = "FORBIDDEN";
      return callback(error);
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Auth-Token"],
    maxAge: 600
  });
  app.use((req, res, next) => {
    // Same-origin requests (frontend served by this server) skip CORS checks;
    // cross-origin requests go through the allowlist above.
    if (isSameOrigin(req.headers.origin, req)) return next();
    return corsMiddleware(req, res, next);
  });

  app.use("/api", apiRateLimit);
  app.use(express.json({ limit: config.requestBodyLimit, strict: true, type: "application/json" }));
}
