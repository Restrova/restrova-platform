import * as financialRepository from "../repositories/financialRepository.js";
import { calculateFinancialMetricsFromEntries } from "./financialService.js";
import { getFinancialReport } from "./financialReportService.js";

const hourMilliseconds = 60 * 60 * 1000;
const dayMilliseconds = 24 * hourMilliseconds;

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function localToInstant(parts, timezone) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0
  );
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = localParts(new Date(guess), timezone);
    const observedWallTime = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    const difference = target - observedWallTime;
    guess += difference;
    if (difference === 0) break;
  }
  return new Date(guess);
}

function nextCalendarBoundary(cursor, timezone, granularity, step) {
  const local = localParts(cursor, timezone);
  if (granularity === "day") {
    return localToInstant({ year: local.year, month: local.month, day: local.day + step }, timezone);
  }
  if (granularity === "month") {
    return localToInstant({ year: local.year, month: local.month + step, day: 1 }, timezone);
  }
  return localToInstant({ year: local.year + step, month: 1, day: 1 }, timezone);
}

function trendConfiguration(period) {
  const duration = new Date(period.current.to).getTime() - new Date(period.current.from).getTime() + 1;
  if (
    ["today", "yesterday"].includes(period.preset) ||
    (period.preset === "custom" && duration <= 2 * dayMilliseconds)
  ) {
    return { granularity: "hour", step: 1 };
  }
  if (["week", "month"].includes(period.preset) || (period.preset === "custom" && duration <= 62 * dayMilliseconds)) {
    return { granularity: "day", step: 1 };
  }
  if (["quarter", "year"].includes(period.preset) || duration <= 730 * dayMilliseconds) {
    return { granularity: "month", step: 1 };
  }
  return {
    granularity: "year",
    step: Math.max(1, Math.ceil(duration / (365.25 * dayMilliseconds * 120)))
  };
}

function trendLabel(date, timezone, granularity) {
  const local = localParts(date, timezone);
  const year = String(local.year).padStart(4, "0");
  const month = String(local.month).padStart(2, "0");
  const day = String(local.day).padStart(2, "0");
  const hour = String(local.hour).padStart(2, "0");
  if (granularity === "year") return year;
  if (granularity === "month") return `${year}-${month}`;
  if (granularity === "day") return `${year}-${month}-${day}`;
  return `${year}-${month}-${day}T${hour}:00`;
}

function trendRanges(period, timezone) {
  const configuration = trendConfiguration(period);
  const finalExclusive = new Date(new Date(period.current.to).getTime() + 1);
  const ranges = [];
  let cursor = new Date(period.current.from);

  while (cursor < finalExclusive) {
    const proposedNext =
      configuration.granularity === "hour"
        ? new Date(cursor.getTime() + configuration.step * hourMilliseconds)
        : nextCalendarBoundary(cursor, timezone, configuration.granularity, configuration.step);
    const safeNext = proposedNext > cursor ? proposedNext : new Date(cursor.getTime() + hourMilliseconds);
    const next = safeNext < finalExclusive ? safeNext : finalExclusive;
    ranges.push({
      label: trendLabel(cursor, timezone, configuration.granularity),
      from: cursor.toISOString(),
      to: new Date(next.getTime() - 1).toISOString()
    });
    cursor = next;
  }

  return { ...configuration, ranges };
}

function reportFilters(report) {
  if (report.scope === "organization") return {};
  if (report.scope === "restaurant") return { restaurantId: report.financials.current.scope.restaurantId };
  return {
    restaurantId: report.financials.current.scope.restaurantId,
    branchId: report.financials.current.scope.branchId
  };
}

function scopeFromReport(user, report, range) {
  return {
    organizationId: user.organization_id,
    restaurantId: report.financials.current.scope.restaurantId,
    branchId: report.financials.current.scope.branchId,
    currencyCode: report.currencyCode,
    from: range.from,
    to: range.to
  };
}

function currentEntries(user, report) {
  return financialRepository.listEntriesForReport(user.organization_id, {
    ...reportFilters(report),
    ...report.period.current
  });
}

function buildTrends(user, report, entries) {
  const configuration = trendRanges(report.period, report.timezone);

  return {
    granularity: configuration.granularity,
    step: configuration.step,
    points: configuration.ranges.map((range) => {
      const from = new Date(range.from).getTime();
      const to = new Date(range.to).getTime();
      const bucketEntries = entries.filter((entry) => {
        const occurredAt = new Date(entry.occurred_at).getTime();
        return occurredAt >= from && occurredAt <= to;
      });
      const calculation = calculateFinancialMetricsFromEntries(bucketEntries, scopeFromReport(user, report, range), {
        includeScopeLineage: true
      });
      return {
        ...range,
        metrics: calculation.metrics,
        completeness: calculation.completeness,
        lineage: calculation.lineage
      };
    })
  };
}

function costBreakdown(metrics, entries) {
  const categoryTotal = (category) =>
    entries.filter((entry) => entry.category === category).reduce((sum, entry) => sum + entry.amount_minor, 0);
  return {
    foodCostsMinor: metrics.cogsMinor,
    packagingCostsMinor: categoryTotal("packaging"),
    deliveryCommissionsMinor: categoryTotal("delivery_commissions"),
    laborCostsMinor: categoryTotal("labor"),
    rentCostsMinor: categoryTotal("rent"),
    utilitiesCostsMinor: categoryTotal("utilities"),
    marketingCostsMinor: categoryTotal("marketing"),
    miscellaneousOperatingExpensesMinor: categoryTotal("miscellaneous_operating_expenses"),
    totalCostsMinor: metrics.totalCostsMinor
  };
}

function branchRows(report) {
  return report.restaurants.flatMap((restaurant) =>
    restaurant.branches.map((branch) => ({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code,
      city: branch.city,
      metrics: branch.financials.current.metrics,
      completeness: branch.financials.current.completeness,
      lineage: branch.financials.current.lineage
    }))
  );
}

function rankBranches(report) {
  const rows = branchRows(report).sort((left, right) => {
    if (left.completeness.hasData !== right.completeness.hasData) return left.completeness.hasData ? -1 : 1;
    if (left.metrics.netProfitMinor !== right.metrics.netProfitMinor) {
      return right.metrics.netProfitMinor - left.metrics.netProfitMinor;
    }
    if (left.metrics.revenueMinor !== right.metrics.revenueMinor) {
      return right.metrics.revenueMinor - left.metrics.revenueMinor;
    }
    return left.branchId - right.branchId;
  });

  let previousProfit = null;
  let previousRank = null;
  let rankedCount = 0;
  const items = rows.map((row) => {
    let rank = null;
    if (row.completeness.hasData) {
      rankedCount += 1;
      rank = previousProfit === row.metrics.netProfitMinor ? previousRank : rankedCount;
      previousProfit = row.metrics.netProfitMinor;
      previousRank = rank;
    }
    return { rank, ...row };
  });

  return {
    metric: "netProfitMinor",
    unallocatedCostsExcluded: true,
    items
  };
}

export function getFinancialDashboard(user, query) {
  const report = getFinancialReport(user, query);
  const current = report.financials.current;
  const comparison = report.financials.comparison;
  const entries = currentEntries(user, report);

  return {
    dashboardVersion: "3.5-v1",
    scope: report.scope,
    currencyCode: report.currencyCode,
    timezone: report.timezone,
    period: report.period,
    summary: {
      revenue: {
        grossSalesMinor: current.metrics.grossSalesMinor,
        discountsMinor: current.metrics.discountsMinor,
        refundsMinor: current.metrics.refundsMinor,
        revenueMinor: current.metrics.revenueMinor
      },
      costs: costBreakdown(current.metrics, entries),
      profit: {
        grossProfitMinor: current.metrics.grossProfitMinor,
        contributionProfitMinor: current.metrics.contributionProfitMinor,
        operatingProfitMinor: current.metrics.operatingProfitMinor,
        netProfitMinor: current.metrics.netProfitMinor
      },
      marginsBps: {
        grossMarginBps: current.metrics.grossMarginBps,
        contributionMarginBps: current.metrics.contributionMarginBps,
        netMarginBps: current.metrics.netMarginBps
      },
      orders: {
        orderCount: current.metrics.orderCount,
        averageOrderValueMinor: current.metrics.averageOrderValueMinor,
        costPerOrderMinor: current.metrics.costPerOrderMinor
      },
      completeness: current.completeness,
      lineage: current.lineage
    },
    comparison: comparison
      ? {
          metrics: comparison.metrics,
          changes: report.financials.changes,
          completeness: comparison.completeness,
          lineage: comparison.lineage
        }
      : null,
    trends: buildTrends(user, report, entries),
    branchRanking: rankBranches(report),
    reconciliation: report.reconciliation,
    assumptions: current.assumptions
  };
}
