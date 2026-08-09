import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "../config/appConfig.js";
import { rateLimited } from "../errors/appError.js";

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${clientKey(req)}:${req.baseUrl || req.path}`;
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

  app.use(helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" }
  }));

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.cors.allowedOrigins.has(origin)) return callback(null, true);
      const error = new Error("Origin not allowed");
      error.status = 403;
      error.code = "FORBIDDEN";
      return callback(error);
    },
    credentials: false,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600
  }));

  app.use("/api", apiRateLimit);
  app.use(express.json({ limit: config.requestBodyLimit, strict: true, type: "application/json" }));
}
