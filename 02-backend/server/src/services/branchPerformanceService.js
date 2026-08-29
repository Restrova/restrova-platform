import { getFinancialReport } from "./financialReportService.js";

export const branchPerformanceVersion = "5.1-v1";

function ratioBps(numerator, denominator) {
  if (!denominator) return null;
  const scaled = BigInt(numerator) * 10000n;
  const divisor = BigInt(denominator);
  const sign = scaled < 0n !== divisor < 0n ? -1n : 1n;
  const absoluteScaled = scaled < 0n ? -scaled : scaled;
  const absoluteDivisor = divisor < 0n ? -divisor : divisor;
  return Number(sign * ((absoluteScaled + absoluteDivisor / 2n) / absoluteDivisor));
}

function growthMetric(current, previous) {
  if (previous === null || previous === undefined) return null;
  return {
    current,
    previous,
    change: current - previous,
    changeBps: previous === 0 ? null : ratioBps(current - previous, Math.abs(previous)),
    limitation: previous === 0 ? "percentage_growth_unavailable_with_zero_baseline" : null
  };
}

function performanceMetrics(metrics) {
  return {
    revenue: {
      grossSalesMinor: metrics.grossSalesMinor,
      revenueMinor: metrics.revenueMinor
    },
    profit: {
      grossProfitMinor: metrics.grossProfitMinor,
      contributionProfitMinor: metrics.contributionProfitMinor,
      operatingProfitMinor: metrics.operatingProfitMinor,
      netProfitMinor: metrics.netProfitMinor
    },
    marginsBps: {
      grossMarginBps: metrics.grossMarginBps,
      contributionMarginBps: metrics.contributionMarginBps,
      netMarginBps: metrics.netMarginBps
    },
    orders: {
      orderCount: metrics.orderCount,
      averageOrderValueMinor: metrics.averageOrderValueMinor
    },
    costs: {
      cogsMinor: metrics.cogsMinor,
      operatingExpensesMinor: metrics.operatingExpensesMinor,
      totalCostsMinor: metrics.totalCostsMinor,
      costPerOrderMinor: metrics.costPerOrderMinor
    },
    refunds: {
      refundsMinor: metrics.refundsMinor,
      refundRateBps: ratioBps(metrics.refundsMinor, metrics.grossSalesMinor)
    },
    discounts: {
      discountsMinor: metrics.discountsMinor,
      discountRateBps: ratioBps(metrics.discountsMinor, metrics.grossSalesMinor)
    }
  };
}

function branchPerformance(restaurant, branch) {
  const current = branch.financials.current;
  const comparison = branch.financials.comparison;
  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    branchId: branch.id,
    branchName: branch.name,
    branchCode: branch.code,
    city: branch.city,
    metrics: performanceMetrics(current.metrics),
    growth: {
      comparisonAvailable: Boolean(comparison),
      revenue: growthMetric(current.metrics.revenueMinor, comparison?.metrics.revenueMinor),
      netProfit: growthMetric(current.metrics.netProfitMinor, comparison?.metrics.netProfitMinor),
      orders: growthMetric(current.metrics.orderCount, comparison?.metrics.orderCount)
    },
    completeness: {
      current: current.completeness,
      comparison: comparison?.completeness || null
    },
    lineage: {
      current: current.lineage,
      comparison: comparison?.lineage || null
    }
  };
}

export function getBranchPerformance(user, query) {
  const report = getFinancialReport(user, query);
  const branches = report.restaurants.flatMap((restaurant) =>
    restaurant.branches.map((branch) => branchPerformance(restaurant, branch))
  );
  return {
    performanceVersion: branchPerformanceVersion,
    sourceFormulaVersion: report.financials.current.formulaVersion,
    scope: report.scope,
    currencyCode: report.currencyCode,
    timezone: report.timezone,
    period: report.period,
    branches,
    completeness: {
      totalBranches: branches.length,
      branchesWithCurrentData: branches.filter((branch) => branch.completeness.current.hasData).length,
      branchesWithComparisonData: branches.filter((branch) => branch.completeness.comparison?.hasData).length
    },
    assumptions: [
      "Revenue equals recorded sales minus recorded discounts and refunds.",
      "Net profit equals operating profit until taxes and financing costs are modeled.",
      "Growth compares the selected period with the explicitly resolved comparison period.",
      "Percentage growth is unavailable when the comparison value is zero; the absolute change remains available.",
      "Restaurant-level unallocated costs are not assigned to branches without an explicit allocation rule."
    ]
  };
}
