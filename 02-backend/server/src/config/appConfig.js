import crypto from "node:crypto";

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const isTest = nodeEnv === "test";

function integerEnv(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value)) throw new Error(`Configuration error: ${name} must be an integer.`);
  return value;
}

function failStartup(message) {
  throw new Error(`Configuration error: ${message}`);
}

const bcryptCost = integerEnv("BCRYPT_COST", isTest ? 4 : 12);
const apiRateLimitMax = integerEnv("API_RATE_LIMIT_MAX", isTest ? 10000 : 300);
const authRateLimitMax = integerEnv("AUTH_RATE_LIMIT_MAX", isTest ? 10000 : 20);
const rateLimitWindowMs = integerEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN || (isProduction ? "" : "http://localhost:5173"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

if (bcryptCost < 4 || bcryptCost > 15) failStartup("BCRYPT_COST must be an integer between 4 and 15.");
if (apiRateLimitMax < 1) failStartup("API_RATE_LIMIT_MAX must be a positive integer.");
if (authRateLimitMax < 1) failStartup("AUTH_RATE_LIMIT_MAX must be a positive integer.");

if (isProduction) {
  const weakSecrets = new Set(["secret", "changeme", "change-me", "replace-this-in-production", "your-strong-secret"]);
  const jwtSecret = process.env.JWT_SECRET || "";
  if (!jwtSecret) failStartup("JWT_SECRET is required in production.");
  if (jwtSecret.length < 32 || weakSecrets.has(jwtSecret.toLowerCase()))
    failStartup("JWT_SECRET must be a strong non-placeholder value of at least 32 characters.");
  if (bcryptCost < 12) failStartup("BCRYPT_COST must be at least 12 in production.");
}

export const config = {
  nodeEnv,
  isProduction,
  isTest,
  port: process.env.PORT || 4000,
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || "3mb",
  jwt: {
    secret: process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex"),
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
    issuer: process.env.JWT_ISSUER || "ai-restaurant-manager",
    audience: process.env.JWT_AUDIENCE || "restaurant-manager-api"
  },
  bcryptCost,
  cors: {
    allowedOrigins
  },
  rateLimits: {
    windowMs: rateLimitWindowMs,
    apiMax: apiRateLimitMax,
    authMax: authRateLimitMax
  }
};
