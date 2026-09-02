import { getBranchPerformance } from "./branchPerformanceService.js";
import { financialCategories } from "./financialService.js";

export const branchRankingVersion = "5.2-v1";

const revenueCategories = ["sales", "discounts", "refunds"];
const profitCategories = financialCategories.map(({ key }) => key);

function identity(branch) {
  return {
    restaurantId: branch.restaurantId,
    restaurantName: branch.restaurantName,
    branchId: branch.branchId,
    branchName: branch.branchName,
    branchCode: branch.branchCode
  };
}

function compareIdentity(left, right) {
  return left.restaurantId - right.restaurantId || left.branchId - right.branchId;
}

function missingRecords(branch, period, requiredCategories) {
  const present = new Set(branch.completeness[period]?.presentCategories || []);
  const categories = requiredCategories.filter((category) => !present.has(category));
  return categories.length ? [{ code: "missing_category_records", period, categories }] : [];
}

function revenueGrowth(branch) {
  if (!branch.growth.comparisonAvailable) {
    return { value: null, reasons: [{ code: "comparison_disabled" }] };
  }
  const reasons = [
    ...missingRecords(branch, "current", revenueCategories),
    ...missingRecords(branch, "comparison", revenueCategories)
  ];
  const previous = branch.growth.revenue.previous;
  if (previous <= 0) reasons.push({ code: "positive_comparison_revenue_required" });
  if (reasons.length) return { value: null, reasons };

  // Subtract and scale as integers before rounding; large valid money amounts can
  // overflow Number precision even when each individual amount is safe.
  const scaled = (BigInt(branch.metrics.revenue.revenueMinor) - BigInt(previous)) * 10000n;
  const denominator = BigInt(previous);
  const absolute = scaled < 0n ? -scaled : scaled;
  const rounded = ((absolute + denominator / 2n) / denominator) * (scaled < 0n ? -1n : 1n);
  const value = Number(rounded);
  return Number.isSafeInteger(value)
    ? { value, reasons: [] }
    : { value: null, reasons: [{ code: "growth_outside_supported_integer_range" }] };
}

function metricValues(branch) {
  const profitReasons = missingRecords(branch, "current", profitCategories);
  const marginReasons = [...profitReasons];
  if (branch.metrics.revenue.revenueMinor <= 0) marginReasons.push({ code: "positive_current_revenue_required" });
  return {
    netProfitMinor: { value: branch.metrics.profit.netProfitMinor, reasons: profitReasons },
    netMarginBps: { value: branch.metrics.marginsBps.netMarginBps, reasons: marginReasons },
    revenueGrowthBps: revenueGrowth(branch),
    cogsMinor: {
      value: branch.metrics.costs.cogsMinor,
      reasons: missingRecords(branch, "current", ["food_costs"])
    }
  };
}

function ranking(branches, { metric, order, unit, positiveLeader = false }) {
  const eligible = [];
  const excluded = [];
  for (const branch of branches) {
    const { value, reasons } = branch.rankingMetrics[metric];
    if (reasons.length) excluded.push({ ...identity(branch), reasons });
    else eligible.push({ ...identity(branch), value });
  }

  eligible.sort((left, right) => {
    if (left.value === right.value) return compareIdentity(left, right);
    return (left.value < right.value ? -1 : 1) * (order === "asc" ? 1 : -1);
  });
  let previousValue;
  let rank;
  const items = eligible.map((item, index) => {
    if (index === 0 || item.value !== previousValue) rank = index + 1;
    previousValue = item.value;
    return { rank, ...item };
  });
  const status =
    items.length < 2
      ? "insufficient_comparable_branches"
      : positiveLeader && items[0].value <= 0
        ? "no_positive_growth"
        : "ready";
  return {
    metric,
    order,
    unit,
    status,
    eligibleCount: items.length,
    excludedCount: excluded.length,
    leaders: status === "ready" ? items.filter((item) => item.rank === 1) : [],
    items,
    excluded
  };
}

export function getBranchRankings(user, query) {
  // Reuse the report's scope validation and period resolution. Never rank an
  // organization-wide result and filter it afterwards for a restricted user.
  const performance = getBranchPerformance(user, query);
  const branches = performance.branches
    .map((branch) => {
      const rankingMetrics = metricValues(branch);
      return {
        ...identity(branch),
        city: branch.city,
        metrics: branch.metrics,
        growthEvidence: {
          currentRevenueMinor: branch.metrics.revenue.revenueMinor,
          comparisonRevenueMinor: branch.growth.revenue?.previous ?? null
        },
        rankingMetrics: Object.fromEntries(
          Object.entries(rankingMetrics).map(([key, result]) => [
            key,
            { ...result, value: result.reasons.length ? null : result.value }
          ])
        ),
        completeness: branch.completeness,
        lineage: branch.lineage
      };
    })
    .sort(compareIdentity);

  return {
    rankingVersion: branchRankingVersion,
    sourcePerformanceVersion: performance.performanceVersion,
    sourceFormulaVersion: performance.sourceFormulaVersion,
    scope: performance.scope,
    currencyCode: performance.currencyCode,
    timezone: performance.timezone,
    period: performance.period,
    policy: {
      tieMethod: "competition_rank",
      tieOrder: ["restaurantId", "branchId"],
      minimumComparableBranches: 2,
      unallocatedCostsExcluded: true,
      requiredCategories: {
        netProfitMinor: profitCategories,
        netMarginBps: profitCategories,
        revenueGrowthBps: revenueCategories,
        cogsMinor: ["food_costs"]
      }
    },
    rankings: {
      bestPerforming: ranking(branches, { metric: "netProfitMinor", order: "desc", unit: "minor_units" }),
      worstPerforming: ranking(branches, { metric: "netProfitMinor", order: "asc", unit: "minor_units" }),
      fastestGrowing: ranking(branches, {
        metric: "revenueGrowthBps",
        order: "desc",
        unit: "basis_points",
        positiveLeader: true
      }),
      highestMargin: ranking(branches, { metric: "netMarginBps", order: "desc", unit: "basis_points" }),
      highestFoodCost: ranking(branches, { metric: "cogsMinor", order: "desc", unit: "minor_units" })
    },
    branches,
    assumptions: [
      ...performance.assumptions,
      "Performance means net profit from the modeled ledger, not a composite business score.",
      "Profit and margin rankings require records for every modeled category; an explicit zero is valid evidence, an absent category is not.",
      "Revenue growth requires sales, discount and refund records in both periods and positive comparison revenue.",
      "Growth and margin ties use rounded integer basis points; equal values share competition ranks (1, 1, 3).",
      "Leaders require at least two eligible branches within the authorized scope; fastest growth requires a positive rounded growth rate.",
      "Highest food cost means the recorded food-cost amount, not cost percentage, waste or inefficiency.",
      "Category coverage does not establish that every transaction or day in the period has been recorded.",
      "Comparisons use the requested periods; same-store and new/closed branch adjustments are not applied."
    ]
  };
}
