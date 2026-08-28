import { forbidden } from "../errors/appError.js";
import { authenticateBearerHeader, roleRank } from "../services/authService.js";

// Preview-environment compatibility: some reverse proxies strip the standard
// Authorization header from proxied requests. The client therefore also sends
// the token in X-Auth-Token; accept either one.
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.trim()) return authHeader;
  const customHeader = req.headers["x-auth-token"];
  if (customHeader && customHeader.trim()) {
    return /^Bearer\s+/i.test(customHeader) ? customHeader : `Bearer ${customHeader}`;
  }
  return "";
}

export function auth(req, _res, next) {
  try {
    req.user = authenticateBearerHeader(extractBearerToken(req));
    next();
  } catch (error) {
    next(error);
  }
}

export const requireRole = (role) => (req, _res, next) => {
  if (roleRank[req.user.role] < roleRank[role]) return next(forbidden("Permission denied"));
  return next();
};

export const requireOwner = requireRole("owner");

export function requireManagerWrite(req, _res, next) {
  if (!["owner", "branch_manager"].includes(req.user.role)) return next(forbidden("Viewer access is read-only"));
  return next();
}
