import { normalizeError } from "../errors/appError.js";
import { logError } from "../observability/logger.js";

export function errorHandler(error, _req, res, _next) {
  const appError = normalizeError(error);
  logError(appError, appError.status);

  res.status(appError.status).json({
    error: appError.expose ? appError.message : "Unable to complete request",
    code: appError.code
  });
}
