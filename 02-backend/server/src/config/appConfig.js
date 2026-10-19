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
const importPreviewRateLimitMax = integerEnv("IMPORT_PREVIEW_RATE_LIMIT_MAX", isTest ? 10000 : 20);
const importActionRateLimitMax = integerEnv("IMPORT_ACTION_RATE_LIMIT_MAX", isTest ? 10000 : 60);
const rateLimitWindowMs = integerEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
const importMaxFileSizeBytes = integerEnv("IMPORT_MAX_FILE_SIZE_BYTES", 5_000_000);
const importMaxRows = integerEnv("IMPORT_MAX_ROWS", 10_000);
const importMaxColumns = integerEnv("IMPORT_MAX_COLUMNS", 100);
const importMaxCellLength = integerEnv("IMPORT_MAX_CELL_LENGTH", 10_000);
const importPreviewRows = integerEnv("IMPORT_PREVIEW_ROWS", 20);
const importConfirmationTokenTtlSeconds = integerEnv("IMPORT_CONFIRMATION_TOKEN_TTL_SECONDS", 30 * 60);
const trustProxyHops = integerEnv("TRUST_PROXY_HOPS", 0);
if (trustProxyHops < 0 || trustProxyHops > 3) failStartup("TRUST_PROXY_HOPS must be between 0 and 3.");
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "12h";
const jwtDuration = jwtExpiresIn.match(/^([1-9]\d*)(s|m|h|d)$/);
const jwtLifetimeSeconds = jwtDuration
  ? Number(jwtDuration[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[jwtDuration[2]]
  : 0;
if (!Number.isSafeInteger(jwtLifetimeSeconds) || jwtLifetimeSeconds < 1 || jwtLifetimeSeconds > 86400)
  failStartup("JWT_EXPIRES_IN must be a positive duration with s/m/h/d units, no longer than 24 hours.");
function platformOrigin(hostname) {
  if (!hostname || !/^[a-z0-9.-]+$/i.test(hostname)) return null;
  return `https://${hostname}`;
}

const configuredOrigins = (process.env.CLIENT_ORIGIN || (isProduction ? "" : "http://localhost:5173"))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set(
  [
    ...configuredOrigins,
    platformOrigin(process.env.RENDER_EXTERNAL_HOSTNAME),
    platformOrigin(process.env.RAILWAY_PUBLIC_DOMAIN)
  ].filter(Boolean)
);

if (bcryptCost < 4 || bcryptCost > 15) failStartup("BCRYPT_COST must be an integer between 4 and 15.");
if (rateLimitWindowMs < 1) failStartup("RATE_LIMIT_WINDOW_MS must be a positive integer.");
if (apiRateLimitMax < 1) failStartup("API_RATE_LIMIT_MAX must be a positive integer.");
if (authRateLimitMax < 1) failStartup("AUTH_RATE_LIMIT_MAX must be a positive integer.");
if (importPreviewRateLimitMax < 1) failStartup("IMPORT_PREVIEW_RATE_LIMIT_MAX must be a positive integer.");
if (importActionRateLimitMax < 1) failStartup("IMPORT_ACTION_RATE_LIMIT_MAX must be a positive integer.");
for (const [name, value] of [
  ["IMPORT_MAX_FILE_SIZE_BYTES", importMaxFileSizeBytes],
  ["IMPORT_MAX_ROWS", importMaxRows],
  ["IMPORT_MAX_COLUMNS", importMaxColumns],
  ["IMPORT_MAX_CELL_LENGTH", importMaxCellLength],
  ["IMPORT_PREVIEW_ROWS", importPreviewRows],
  ["IMPORT_CONFIRMATION_TOKEN_TTL_SECONDS", importConfirmationTokenTtlSeconds]
]) {
  if (value < 1) failStartup(`${name} must be a positive integer.`);
}

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
  trustProxyHops,
  jwt: {
    secret: process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex"),
    expiresIn: jwtExpiresIn,
    issuer: process.env.JWT_ISSUER || "ai-restaurant-manager",
    audience: process.env.JWT_AUDIENCE || "restaurant-manager-api"
  },
  bcryptCost,
  cors: {
    allowedOrigins,
    allowLoopbackOrigins: !isProduction && !isTest
  },
  rateLimits: {
    windowMs: rateLimitWindowMs,
    apiMax: apiRateLimitMax,
    authMax: authRateLimitMax,
    importPreviewMax: importPreviewRateLimitMax,
    importActionMax: importActionRateLimitMax
  },
  imports: {
    maxFileSizeBytes: importMaxFileSizeBytes,
    maxRows: importMaxRows,
    maxColumns: importMaxColumns,
    maxCellLength: importMaxCellLength,
    previewRows: importPreviewRows,
    confirmationTokenTtlSeconds: importConfirmationTokenTtlSeconds
  }
};
