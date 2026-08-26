import { forbidden, notFound, validationError } from "../errors/appError.js";
import * as financialRepository from "../repositories/financialRepository.js";
import { financialReportQuerySchema, validate } from "../validation/schemas.js";
import { calculateFinancialMetricsFromEntries } from "./financialService.js";
import { financialMetricChanges, resolveFinancialPeriodRanges } from "./financialPeriodService.js";

const additiveMetricKeys = [
  "grossSalesMinor",
  "discountsMinor",
  "refundsMinor",
  "revenueMinor",
  "cogsMinor",
  "grossProfitMinor",
  "contributionProfitMinor",
  "operatingExpensesMinor",
  "operatingProfitMinor",
  "netProfitMinor",
  "orderCount",
  "totalCostsMinor"
];

function resolveScope(user, parsed) {
  const scope = parsed.scope || (user.role === "branch_manager" ? "branch" : "restaurant");
  if (user.role === "branch_manager" && scope !== "branch") {
    throw forbidden("Branch managers can only access their assigned branch report.");
  }
  if (user.role === "viewer" && scope === "organization") {
    throw forbidden("Organization financial reports require owner access.");
  }
  if (scope === "organization") {
    if (parsed.restaurantId || parsed.branchId) {
      throw validationError("Organization reports cannot include restaurantId or branchId.");
    }
    return { scope, restaurants: financialRepository.listReportingRestaurants(user.organization_id) };
  }

  if (scope === "restaurant") {
    if (parsed.branchId) throw validationError("Restaurant reports cannot include branchId.");
    const restaurantId = parsed.restaurantId || user.restaurant_id;
    if (user.role !== "owner" && restaurantId !== user.restaurant_id) throw notFound("Restaurant not found");
    const restaurant = financialRepository.findReportingRestaurant(user.organization_id, restaurantId);
    if (!restaurant) throw notFound("Restaurant not found");
    return { scope, restaurants: [restaurant] };
  }

  if (user.role === "branch_manager" && parsed.branchId && parsed.branchId !== user.branch_id) {
    throw notFound("Branch not found");
  }
  const branchId = user.role === "branch_manager" ? user.branch_id : parsed.branchId;
  if (!branchId) throw validationError("Branch reports require branchId.");
  const branch = financialRepository.findReportingBranch(user.organization_id, branchId);
  if (!branch || (user.role === "branch_manager" && branch.id !== user.branch_id)) throw notFound("Branch not found");
  if (user.role !== "owner" && branch.restaurant_id !== user.restaurant_id) throw notFound("Branch not found");
  if (parsed.restaurantId && parsed.restaurantId !== branch.restaurant_id) {
    throw validationError("branchId does not belong to restaurantId.");
  }
  const restaurant = financialRepository.findReportingRestaurant(user.organization_id, branch.restaurant_id);
  return { scope, restaurants: [restaurant], branch };
}

function calculation(user, filters, range, scope) {
  const entries = financialRepository.listEntriesForReport(user.organization_id, { ...filters, ...range });
  return calculateFinancialMetricsFromEntries(
    entries,
    {
      organizationId: user.organization_id,
      restaurantId: scope.restaurantId ?? null,
      branchId: scope.branchId ?? null,
      currencyCode: user.currency.toUpperCase(),
      from: range.from,
      to: range.to
    },
    { includeScopeLineage: true }
  );
}

function calculationBundle(user, filters, ranges, scope) {
  const current = calculation(user, filters, ranges.current, scope);
  const comparison = ranges.comparison ? calculation(user, filters, ranges.comparison, scope) : null;
  return { current, comparison, changes: financialMetricChanges(current, comparison) };
}

function reconcile(parent, children) {
  const discrepancies = Object.fromEntries(
    additiveMetricKeys.map((key) => [
      key,
      parent.metrics[key] - children.reduce((sum, child) => sum + child.metrics[key], 0)
    ])
  );
  return {
    entryCountDifference:
      parent.completeness.entryCount - children.reduce((sum, child) => sum + child.completeness.entryCount, 0),
    metricDifferences: discrepancies,
    reconciled:
      Object.values(discrepancies).every((difference) => difference === 0) &&
      parent.completeness.entryCount === children.reduce((sum, child) => sum + child.completeness.entryCount, 0)
  };
}

function reconciliationBundle(parent, children) {
  return {
    current: reconcile(
      parent.current,
      children.map((child) => child.current)
    ),
    comparison:
      parent.comparison && children.every((child) => child.comparison)
        ? reconcile(
            parent.comparison,
            children.map((child) => child.comparison)
          )
        : null
  };
}

function buildRestaurant(user, restaurant, selectedBranch, ranges) {
  const branchRows = selectedBranch
    ? [selectedBranch]
    : financialRepository.listReportingBranches(user.organization_id, restaurant.id);
  const branches = branchRows.map((branch) => ({
    id: branch.id,
    name: branch.name,
    code: branch.code,
    city: branch.city,
    financials: calculationBundle(user, { restaurantId: restaurant.id, branchId: branch.id }, ranges, {
      restaurantId: restaurant.id,
      branchId: branch.id
    })
  }));

  if (selectedBranch) return { id: restaurant.id, name: restaurant.name, branches };

  const financials = calculationBundle(user, { restaurantId: restaurant.id }, ranges, { restaurantId: restaurant.id });
  const unallocated = calculationBundle(user, { restaurantId: restaurant.id, unallocatedOnly: true }, ranges, {
    restaurantId: restaurant.id
  });
  return {
    id: restaurant.id,
    name: restaurant.name,
    financials,
    unallocated,
    branches,
    reconciliation: reconciliationBundle(financials, [unallocated, ...branches.map((branch) => branch.financials)])
  };
}

export function getFinancialReport(user, query) {
  const parsed = validate(financialReportQuerySchema, query);
  const resolved = resolveScope(user, parsed);
  const ranges = resolveFinancialPeriodRanges(parsed, user.timezone);
  const restaurants = resolved.restaurants.map((restaurant) =>
    buildRestaurant(user, restaurant, resolved.branch, ranges)
  );

  let financials;
  let reconciliation = null;
  if (resolved.scope === "organization") {
    financials = calculationBundle(user, {}, ranges, {});
    reconciliation = reconciliationBundle(
      financials,
      restaurants.map((restaurant) => restaurant.financials)
    );
  } else if (resolved.scope === "restaurant") {
    financials = restaurants[0].financials;
    reconciliation = restaurants[0].reconciliation;
  } else {
    financials = restaurants[0].branches[0].financials;
  }

  return {
    reportVersion: "3.4-v1",
    scope: resolved.scope,
    currencyCode: user.currency.toUpperCase(),
    timezone: user.timezone,
    period: {
      preset: ranges.preset,
      comparisonKind: ranges.comparisonKind,
      anchor: ranges.anchor,
      current: ranges.current,
      comparison: ranges.comparison
    },
    financials,
    restaurants,
    reconciliation
  };
}
