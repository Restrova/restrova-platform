import { forbidden } from "../errors/appError.js";
import { authenticateBearerHeader, roleRank } from "../services/authService.js";

export function auth(req, _res, next) {
  try {
    req.user = authenticateBearerHeader(req.headers.authorization || "");
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
