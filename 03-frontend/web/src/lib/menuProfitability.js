import { api } from "./api.js";

export function buildMenuQuery({ branchId, from, to, limit = 500 } = {}) {
  const query = new URLSearchParams({ status: "active", limit: String(limit) });
  if (branchId) query.set("branchId", branchId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  return query.toString();
}

export function buildCostQuery({ branchId, asOf, limit = 500 } = {}) {
  const query = new URLSearchParams({ status: "active", limit: String(limit) });
  if (branchId) query.set("branchId", branchId);
  if (asOf) query.set("asOf", asOf);
  return query.toString();
}

export async function getMenuProfitability(filters) {
  const matrixQuery = buildMenuQuery(filters);
  const currentCostQuery = buildCostQuery({ branchId: filters.branchId, asOf: filters.to });
  const previousCostQuery = buildCostQuery({ branchId: filters.branchId, asOf: filters.from });
  const [matrix, currentCosts, previousCosts] = await Promise.all([
    api(`/menu/engineering-matrix?${matrixQuery}`),
    api(`/menu/costs?${currentCostQuery}`),
    api(`/menu/costs?${previousCostQuery}`)
  ]);
  const previousByCode = new Map(previousCosts.items.map((item) => [item.itemCode, item]));
  const currentByCode = new Map(currentCosts.items.map((item) => [item.itemCode, item]));
  const items = matrix.items.map((item) => {
    const current = currentByCode.get(item.itemCode)?.metrics;
    const previous = previousByCode.get(item.itemCode)?.metrics;
    const currentDirectCost =
      current?.foodCostMinor == null || current?.packagingMinor == null
        ? null
        : current.foodCostMinor + current.packagingMinor;
    const previousDirectCost =
      previous?.foodCostMinor == null || previous?.packagingMinor == null
        ? null
        : previous.foodCostMinor + previous.packagingMinor;
    return {
      ...item,
      costChangeMinor:
        currentDirectCost == null || previousDirectCost == null ? null : currentDirectCost - previousDirectCost
    };
  });
  return { ...matrix, items };
}

export function rankMenuItems(items) {
  const descending = (key) => [...items].sort((a, b) => (b.metrics[key] ?? -Infinity) - (a.metrics[key] ?? -Infinity));
  const ascending = (key) => [...items].sort((a, b) => (a.metrics[key] ?? Infinity) - (b.metrics[key] ?? Infinity));
  return {
    mostProfitable: descending("contributionProfitMinor")[0] || null,
    leastProfitable: ascending("contributionProfitMinor")[0] || null,
    highestRevenue: descending("itemRevenueMinor")[0] || null,
    highestVolume: descending("quantitySoldMicros")[0] || null,
    worstMargins: ascending("contributionMarginBps"),
    risingCosts: [...items]
      .filter((item) => item.costChangeMinor > 0)
      .sort((a, b) => b.costChangeMinor - a.costChangeMinor)
  };
}
