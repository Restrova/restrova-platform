import { notFound, validationError } from "../errors/appError.js";
import * as branchRepository from "../repositories/branchRepository.js";
import { branchCreateSchema, branchUpdateSchema, validate } from "../validation/schemas.js";
import { db } from "../db.js";

function lifecycleInput(parsed, current = {}) {
  const openedOn = parsed.openedOn === undefined ? (current.opened_on ?? null) : parsed.openedOn;
  const closedOn = parsed.closedOn === undefined ? (current.closed_on ?? null) : parsed.closedOn;
  if (closedOn && (!openedOn || closedOn <= openedOn)) {
    throw validationError("Closing date must be after opening date.");
  }
  return { openedOn, closedOn };
}

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

export function toolScope(user, requestedBranchId) {
  const branchId = requestedBranchId === undefined ? defaultBranchId(user) : Number(requestedBranchId);
  if (!Number.isSafeInteger(branchId) || branchId <= 0) throw validationError("A valid branch is required.");
  if (!assertBranchAccess(user, branchId)) throw notFound("Branch not found");
  return {
    restaurantId: user.restaurant_id,
    branchId,
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
  const parsed = validate(branchCreateSchema, body);
  const lifecycle = lifecycleInput(parsed);
  return db.transaction(() => {
    const branch = branchRepository.createBranch(user, parsed);
    branchRepository.saveLifecycle(user, branch.id, lifecycle);
    return { ...branch, opened_on: lifecycle.openedOn, closed_on: lifecycle.closedOn };
  })();
}

export function updateBranch(user, branchId, body) {
  if (!assertBranchAccess(user, branchId)) throw notFound("Branch not found");
  const parsed = validate(branchUpdateSchema, body);
  const lifecycle = lifecycleInput(parsed, branchRepository.getLifecycle(branchId));
  return db.transaction(() => {
    const branch = branchRepository.updateBranch(branchId, parsed);
    if (parsed.openedOn !== undefined || parsed.closedOn !== undefined) {
      branchRepository.saveLifecycle(user, branchId, lifecycle);
    }
    return { ...branch, opened_on: lifecycle.openedOn, closed_on: lifecycle.closedOn };
  })();
}
