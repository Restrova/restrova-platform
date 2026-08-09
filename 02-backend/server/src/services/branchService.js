import { notFound } from "../errors/appError.js";
import * as branchRepository from "../repositories/branchRepository.js";
import { branchCreateSchema, branchUpdateSchema, validate } from "../validation/schemas.js";

export function assertBranchAccess(user, branchId) {
  const branch = branchRepository.findBranchInScope(user, branchId);
  if (!branch) return null;
  if (user.role === "branch_manager" && user.branch_id !== branch.id) return null;
  return branch;
}

export function defaultBranchId(user) {
  return branchRepository.getDefaultBranchId(user);
}

export function branchIdFromRequest(user, requestData = {}) {
  const requested = requestData.body?.branchId || requestData.query?.branchId;
  const branchId = requested ? Number(requested) : defaultBranchId(user);
  if (!branchId || !assertBranchAccess(user, branchId)) return null;
  return branchId;
}

export function toolScope(user) {
  return {
    restaurantId: user.restaurant_id,
    branchId: defaultBranchId(user),
    role: user.role,
    ownerId: user.owner_id,
    currency: user.currency,
    timezone: user.timezone
  };
}

export function listBranches(user) {
  return branchRepository.listBranchesForUser(user);
}

export function createBranch(user, body) {
  return branchRepository.createBranch(user, validate(branchCreateSchema, body));
}

export function updateBranch(user, branchId, body) {
  if (!assertBranchAccess(user, branchId)) throw notFound("Branch not found");
  return branchRepository.updateBranch(branchId, validate(branchUpdateSchema, body));
}
