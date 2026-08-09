export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR"
};

export class AppError extends Error {
  constructor(code, message, status = 500, { expose = true, cause } = {}) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.expose = expose;
  }
}

export const authRequired = () => new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required", 401);
export const forbidden = (message = "Permission denied") => new AppError(ErrorCodes.FORBIDDEN, message, 403);
export const validationError = (message = "Invalid request") => new AppError(ErrorCodes.VALIDATION_ERROR, message, 400);
export const notFound = (message = "Resource not found") => new AppError(ErrorCodes.RESOURCE_NOT_FOUND, message, 404);
export const conflict = (message = "Conflict") => new AppError(ErrorCodes.CONFLICT, message, 409);
export const rateLimited = (message = "Too many requests. Please try again later.") =>
  new AppError(ErrorCodes.RATE_LIMITED, message, 429);
export const internalError = (cause) =>
  new AppError(ErrorCodes.INTERNAL_ERROR, "Unable to complete request", 500, { expose: false, cause });

export function normalizeError(error) {
  if (error instanceof AppError) return error;
  if (error?.code && error?.status && Object.values(ErrorCodes).includes(error.code))
    return new AppError(error.code, error.message || "Unable to complete request", error.status);
  if (error?.name === "ZodError") return validationError("Invalid request");
  if (error?.type === "entity.too.large") return new AppError(ErrorCodes.VALIDATION_ERROR, "Payload too large", 413);
  if (error instanceof SyntaxError && error.status === 400 && "body" in error)
    return validationError("Malformed JSON body");
  if (/already registered/i.test(error?.message || "")) return conflict(error.message);
  if (/UNIQUE constraint/i.test(error?.message || "")) return conflict("A duplicate record already exists.");
  if (
    /Preview this CSV|branch is required|Unsupported import|Missing required columns|must be/i.test(
      error?.message || ""
    )
  )
    return validationError(error.message);
  return internalError(error);
}
