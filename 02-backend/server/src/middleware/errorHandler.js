import { normalizeError } from "../errors/appError.js";
import { logError } from "../observability/logger.js";

export function errorHandler(error, req, res, _next) {
  const appError = normalizeError(error);
  if (error?.type === "entity.too.large" && req.originalUrl?.includes("/data/import-jobs/preview")) {
    appError.message = "File exceeds the maximum allowed upload size.";
  }
  logError(appError, appError.status, {
    requestId: req.requestId,
    route: req.originalUrl?.split("?")[0],
    organizationId: req.user?.organization_id,
    userId: req.user?.owner_id
  });

  res.status(appError.status).json({
    error: appError.expose ? appError.message : "Unable to complete request",
    code: appError.code
  });
}
