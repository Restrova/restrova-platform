import { notFound } from "../errors/appError.js";
import { dataConnectionStatus, importRestaurantData, previewRestaurantData } from "../dataImport.js";
import { branchIdFromRequest, defaultBranchId } from "./branchService.js";
import { importConfirmSchema, importPreviewSchema, validate } from "../validation/schemas.js";

export function getDataStatus(user, query = {}) {
  const branchId = branchIdFromRequest(user, { query });
  if (query.branchId && !branchId) throw notFound("Branch not found");
  return dataConnectionStatus(user.restaurant_id, branchId || defaultBranchId(user));
}

export function previewImport(body) {
  const parsed = validate(importPreviewSchema, body);
  return previewRestaurantData(parsed.type, parsed.csv);
}

export function confirmImport(user, body) {
  const parsed = validate(importConfirmSchema, body);
  const branchId = branchIdFromRequest(user, { body });
  if (!branchId) throw notFound("Branch not found");
  return importRestaurantData(parsed.type, parsed.csv, user.restaurant_id, { branchId, confirm: parsed.confirm });
}
