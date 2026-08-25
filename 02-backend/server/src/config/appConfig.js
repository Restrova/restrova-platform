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
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN || (isProduction ? "" : "http://localhost:5173"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

if (bcryptCost < 4 || bcryptCost > 15) failStartup("BCRYPT_COST must be an integer between 4 and 15.");
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
