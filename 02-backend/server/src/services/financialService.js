import { notFound, validationError } from "../errors/appError.js";
import * as financialRepository from "../repositories/financialRepository.js";
import { assertBranchAccess } from "./branchService.js";
import { financialEntryCreateSchema, financialEntryQuerySchema, validate } from "../validation/schemas.js";

export const financialCategories = [
  { key: "sales", group: "income" },
  { key: "discounts", group: "revenue_deduction" },
  { key: "refunds", group: "revenue_deduction" },
  { key: "food_costs", group: "variable_cost" },
  { key: "packaging", group: "variable_cost" },
  { key: "delivery_commissions", group: "variable_cost" },
  { key: "labor", group: "operating_expense" },
  { key: "rent", group: "operating_expense" },
  { key: "utilities", group: "operating_expense" },
  { key: "marketing", group: "operating_expense" },
  { key: "miscellaneous_operating_expenses", group: "operating_expense" }
];

function assertPeriodOrder(entry) {
  if (entry.periodStart && new Date(entry.periodStart) > new Date(entry.periodEnd)) {
    throw validationError("Financial period start must not be after its end.");
  }
}

function assertRequestedBranch(user, branchId) {
  if (!branchId) return;
  if (!assertBranchAccess(user, branchId)) throw notFound("Branch not found");
}

export function getFinancialModel() {
  return {
    version: 1,
    amountStorage: "integer_minor_units",
    currencySource: "authenticated_organization",
    categories: financialCategories
  };
}

export function createFinancialEntry(user, body) {
  const parsed = validate(financialEntryCreateSchema, body);
  assertRequestedBranch(user, parsed.branchId);
  assertPeriodOrder(parsed);
  return financialRepository.insertEntry(user, parsed);
}

export function listFinancialEntries(user, query) {
  const parsed = validate(financialEntryQuerySchema, query);
  assertRequestedBranch(user, parsed.branchId);
  if (parsed.from && parsed.to && new Date(parsed.from) > new Date(parsed.to)) {
    throw validationError("Financial query start must not be after its end.");
  }
  return financialRepository.listEntries(user, parsed);
}
