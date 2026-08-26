import { notFound, validationError } from "../errors/appError.js";
import * as financialRepository from "../repositories/financialRepository.js";
import {
  financialCalculationQuerySchema,
  financialEntryCreateSchema,
  financialEntryQuerySchema,
  validate
} from "../validation/schemas.js";
import { assertBranchAccess } from "./branchService.js";

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

function assertQueryPeriod(filters) {
  if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) {
    throw validationError("Financial query start must not be after its end.");
  }
}

function toSafeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw validationError(`${label} exceeds the supported integer range.`);
  return number;
}

function roundRatio(numerator, denominator, scale = 1n) {
  if (denominator === 0n) return null;
  const scaled = numerator * scale;
  const sign = scaled < 0n !== denominator < 0n ? -1n : 1n;
  const absoluteNumerator = scaled < 0n ? -scaled : scaled;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  return toSafeInteger(sign * ((absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator), "Ratio");
}

function categoryTotals(entries) {
  const totals = Object.fromEntries(financialCategories.map(({ key }) => [key, 0n]));
  for (const entry of entries) totals[entry.category] += BigInt(entry.amount_minor);
  return totals;
}

function buildLineage(entries) {
  const references = Object.fromEntries(financialCategories.map(({ key }) => [key, []]));
  const seen = Object.fromEntries(financialCategories.map(({ key }) => [key, new Set()]));
  for (const entry of entries) {
    const sourceKey = `${entry.source_type}:${entry.source_reference}`;
    if (seen[entry.category].has(sourceKey)) continue;
    seen[entry.category].add(sourceKey);
    references[entry.category].push({
      sourceType: entry.source_type,
      sourceReference: entry.source_reference
    });
  }
  return references;
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
  assertQueryPeriod(parsed);
  return financialRepository.listEntries(user, parsed);
}

export function calculateFinancialMetrics(user, query) {
  const parsed = validate(financialCalculationQuerySchema, query);
  assertRequestedBranch(user, parsed.branchId);
  assertQueryPeriod(parsed);
  const entries = financialRepository.listEntriesForCalculation(user, parsed);
  const totals = categoryTotals(entries);

  const grossSales = totals.sales;
  const revenue = grossSales - totals.discounts - totals.refunds;
  const cogs = totals.food_costs;
  const grossProfit = revenue - cogs;
  const contributionProfit = grossProfit - totals.packaging - totals.delivery_commissions;
  const operatingExpenses =
    totals.labor + totals.rent + totals.utilities + totals.marketing + totals.miscellaneous_operating_expenses;
  const operatingProfit = contributionProfit - operatingExpenses;
  const netProfit = operatingProfit;
  const totalCosts = cogs + totals.packaging + totals.delivery_commissions + operatingExpenses;
  const orderCount = new Set(
    entries.filter((entry) => entry.category === "sales").map((entry) => entry.source_reference)
  ).size;
  const recordedCategories = new Set(entries.map((entry) => entry.category));
  const presentCategories = financialCategories.map(({ key }) => key).filter((key) => recordedCategories.has(key));
  const missingCategories = financialCategories.map(({ key }) => key).filter((key) => !recordedCategories.has(key));

  return {
    formulaVersion: "3.2-v1",
    scope: {
      organizationId: user.organization_id,
      restaurantId: user.restaurant_id,
      branchId: user.role === "branch_manager" ? user.branch_id : parsed.branchId || null,
      currencyCode: user.currency.toUpperCase()
    },
    period: { from: parsed.from || null, to: parsed.to || null },
    metrics: {
      grossSalesMinor: toSafeInteger(grossSales, "Gross sales"),
      discountsMinor: toSafeInteger(totals.discounts, "Discounts"),
      refundsMinor: toSafeInteger(totals.refunds, "Refunds"),
      revenueMinor: toSafeInteger(revenue, "Revenue"),
      cogsMinor: toSafeInteger(cogs, "COGS"),
      grossProfitMinor: toSafeInteger(grossProfit, "Gross profit"),
      grossMarginBps: roundRatio(grossProfit, revenue, 10000n),
      contributionProfitMinor: toSafeInteger(contributionProfit, "Contribution profit"),
      contributionMarginBps: roundRatio(contributionProfit, revenue, 10000n),
      operatingExpensesMinor: toSafeInteger(operatingExpenses, "Operating expenses"),
      operatingProfitMinor: toSafeInteger(operatingProfit, "Operating profit"),
      netProfitMinor: toSafeInteger(netProfit, "Net profit"),
      netMarginBps: roundRatio(netProfit, revenue, 10000n),
      orderCount,
      averageOrderValueMinor: orderCount ? roundRatio(revenue, BigInt(orderCount)) : null,
      totalCostsMinor: toSafeInteger(totalCosts, "Total costs"),
      costPerOrderMinor: orderCount ? roundRatio(totalCosts, BigInt(orderCount)) : null
    },
    completeness: {
      hasData: entries.length > 0,
      entryCount: entries.length,
      presentCategories,
      missingCategories
    },
    lineage: buildLineage(entries),
    assumptions: [
      "COGS includes direct food costs only.",
      "Packaging and delivery commissions are contribution costs.",
      "Net profit equals operating profit until tax, interest, depreciation, and amortization categories are modeled.",
      "Order count is the number of distinct sales source references."
    ]
  };
}
