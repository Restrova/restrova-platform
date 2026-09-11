import { db } from "../db.js";
import { validationError } from "../errors/appError.js";
import { getFinancialReport } from "./financialReportService.js";
import { resolveFinancialDateRange, resolveFinancialPeriodRanges } from "./financialPeriodService.js";
import { financialCategories } from "./financialService.js";
import { branchOperationsQuerySchema, validate } from "../validation/schemas.js";

const dayMs = 86400000;
const fields = ["grossSalesMinor", "discountsMinor", "refundsMinor", "revenueMinor", "commissionMinor"];
const categoryKeys = financialCategories.map(({ key }) => key);

function integer(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw validationError("Operational amount exceeds the supported integer range.");
  return result;
}

function ratio(value, baseline) {
  if (baseline <= 0) return null;
  const numerator = BigInt(value) * 10000n;
  const divisor = BigInt(baseline);
  const absolute = numerator < 0n ? -numerator : numerator;
  const result = Number(((absolute + divisor / 2n) / divisor) * (numerator < 0n ? -1n : 1n));
  return Number.isSafeInteger(result) ? result : null;
}

function delta(current, previous) {
  if (current == null || previous == null) return null;
  const change = integer(BigInt(current) - BigInt(previous));
  return { current, previous, change, changeBps: ratio(change, previous) };
}

function localFormatter(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  });
}

function localStamp(value, formatter) {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part])
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, hour: Number(parts.hour), weekday: new Date(`${date}T12:00:00Z`).getUTCDay() };
}

function fullDays(range, timezone, anchor, formatter) {
  if (!range) return [];
  const first = localStamp(range.from, formatter).date;
  const last = localStamp(range.to, formatter).date;
  const span = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / dayMs);
  if (span > 400) throw validationError("Operational comparisons support up to 400 calendar days per period.");
  const days = [];
  const cutoff = Date.parse(anchor);
  for (let offset = 0; offset <= span; offset += 1) {
    const date = new Date(Date.parse(`${first}T00:00:00Z`) + offset * dayMs).toISOString().slice(0, 10);
    const bounds = resolveFinancialDateRange(date, timezone).current;
    if (
      Date.parse(bounds.from) >= Date.parse(range.from) &&
      Date.parse(bounds.to) <= Date.parse(range.to) &&
      Date.parse(bounds.to) < cutoff
    ) {
      days.push({ date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay() });
    }
  }
  return days;
}

function alignDays(period, timezone, formatter) {
  const current = fullDays(period.current, timezone, period.anchor, formatter);
  const comparison = fullDays(period.comparison, timezone, period.anchor, formatter);
  const matched = { current: [], comparison: [] };
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const now = current.filter((day) => day.weekday === weekday);
    const before = comparison.filter((day) => day.weekday === weekday);
    const count = Math.min(now.length, before.length);
    if (count) {
      matched.current.push(...now.slice(-count).map((day) => day.date));
      matched.comparison.push(...before.slice(-count).map((day) => day.date));
    }
  }
  matched.current.sort();
  matched.comparison.sort();
  return {
    ...matched,
    currentFullDays: current.length,
    comparisonFullDays: comparison.length,
    policy: "latest_equal_weekday_counts_completed_calendar_days"
  };
}

function totals(rows) {
  const sums = { grossSalesMinor: 0n, discountsMinor: 0n, refundsMinor: 0n, revenueMinor: 0n, commissionMinor: 0n };
  const orders = new Set();
  for (const row of rows) {
    sums.grossSalesMinor += BigInt(row.gross_sales_minor);
    sums.discountsMinor += BigInt(row.discount_minor);
    sums.refundsMinor += BigInt(row.refund_amount_minor);
    sums.commissionMinor += BigInt(row.delivery_commission_minor);
    orders.add(`${row.restaurant_id}:${row.branch_id}:${row.external_order_id}`);
  }
  sums.revenueMinor = sums.grossSalesMinor - sums.discountsMinor - sums.refundsMinor;
  const metrics = Object.fromEntries(fields.map((key) => [key, integer(sums[key])]));
  return {
    ...metrics,
    revenueAfterCommissionMinor: integer(sums.revenueMinor - sums.commissionMinor),
    orderCount: orders.size,
    lineCount: rows.length,
    discountRateBps: ratio(metrics.discountsMinor, metrics.grossSalesMinor),
    refundRateBps: ratio(metrics.refundsMinor, metrics.grossSalesMinor),
    commissionRateBps: ratio(metrics.commissionMinor, metrics.grossSalesMinor),
    lineage: rows.map((row) => ({
      salesLineId: row.id,
      restaurantId: row.restaurant_id,
      branchId: row.branch_id,
      orderId: row.external_order_id,
      lineId: row.external_line_id
    }))
  };
}

function groupRows(rows, keys, classify) {
  return keys.map((key) => ({ key, ...totals(rows.filter((row) => classify(row) === key)) }));
}

function recordedMetrics(financial) {
  if (!financial) return null;
  const has = (...keys) => keys.every((key) => financial.completeness.presentCategories.includes(key));
  const revenueKnown = has("sales", "discounts", "refunds");
  const costsKnown = has(...categoryKeys.filter((key) => !["sales", "discounts", "refunds"].includes(key)));
  return {
    revenueMinor: revenueKnown ? financial.metrics.revenueMinor : null,
    grossSalesMinor: has("sales") ? financial.metrics.grossSalesMinor : null,
    orderCount: has("sales") ? financial.metrics.orderCount : null,
    foodCostsMinor: has("food_costs") ? financial.metrics.cogsMinor : null,
    totalCostsMinor: costsKnown ? financial.metrics.totalCostsMinor : null,
    netProfitMinor: revenueKnown && costsKnown ? financial.metrics.netProfitMinor : null,
    netMarginBps: revenueKnown && costsKnown ? financial.metrics.netMarginBps : null
  };
}

function compareStores(branches, rows, period, alignment) {
  const nowDays = new Set(alignment.current);
  const beforeDays = new Set(alignment.comparison);
  const both = [...alignment.current, ...alignment.comparison].sort();
  const eligible = [];
  const excluded = [];
  for (const branch of branches) {
    const identity = {
      branchId: branch.id,
      restaurantId: branch.restaurantId,
      branchName: branch.name,
      branchCode: branch.code
    };
    const reasons = [];
    if (!period.comparison) reasons.push("comparison_disabled");
    else if (!both.length) reasons.push("no_matching_completed_days");
    if (!branch.lifecycle?.opened_on) reasons.push("opening_date_unknown");
    else if (both.length && branch.lifecycle.opened_on > both[0]) reasons.push("opened_during_or_after_comparison");
    if (both.length && branch.lifecycle?.closed_on && branch.lifecycle.closed_on <= both.at(-1))
      reasons.push("closed_before_period_end");
    const ownRows = rows.filter((row) => row.branch_id === branch.id);
    const current = ownRows.filter((row) => nowDays.has(row.local.date));
    const previous = ownRows.filter((row) => beforeDays.has(row.local.date));
    const currentObserved = new Set(current.map((row) => row.local.date));
    const previousObserved = new Set(previous.map((row) => row.local.date));
    const missingCurrentDates = alignment.current.filter((date) => !currentObserved.has(date));
    const missingComparisonDates = alignment.comparison.filter((date) => !previousObserved.has(date));
    if (missingCurrentDates.length) reasons.push("missing_current_sales_days");
    if (missingComparisonDates.length) reasons.push("missing_comparison_sales_days");
    if (reasons.length)
      excluded.push({ ...identity, reasons, missingCurrentDates, missingComparisonDates, lifecycle: branch.lifecycle });
    else {
      const currentTotals = totals(current);
      const previousTotals = totals(previous);
      eligible.push({
        ...identity,
        current: currentTotals,
        comparison: previousTotals,
        revenueChange: delta(currentTotals.revenueMinor, previousTotals.revenueMinor)
      });
    }
  }
  const ids = new Set(eligible.map((branch) => branch.branchId));
  const current = totals(rows.filter((row) => ids.has(row.branch_id) && nowDays.has(row.local.date)));
  const comparison = totals(rows.filter((row) => ids.has(row.branch_id) && beforeDays.has(row.local.date)));
  return {
    status: eligible.length ? "ready" : "insufficient_comparable_data",
    alignment,
    eligible,
    excluded,
    current: eligible.length ? current : null,
    comparison: eligible.length ? comparison : null,
    revenueChange: eligible.length ? delta(current.revenueMinor, comparison.revenueMinor) : null
  };
}

function detectOpportunities(sameStore, scorecards) {
  const opportunities = [];
  for (const branch of sameStore.eligible) {
    const evidence = { current: branch.current, comparison: branch.comparison, dates: sameStore.alignment };
    const add = (type, severity, values, thresholdBps) =>
      opportunities.push({
        id: `${branch.branchId}:${type}`,
        branchId: branch.branchId,
        branchName: branch.branchName,
        type,
        severity,
        thresholdBps,
        values,
        evidence,
        expectedImpactMinor: null
      });
    const growth = branch.revenueChange.changeBps;
    if (growth !== null && growth <= -1000) add("falling_sales", "warning", branch.revenueChange, -1000);
    if (branch.current.refundRateBps >= 500)
      add(
        "high_refunds",
        "warning",
        { current: branch.current.refundRateBps, previous: branch.comparison.refundRateBps },
        500
      );
    if (
      branch.current.discountRateBps >= 1000 &&
      branch.comparison.discountRateBps != null &&
      branch.current.discountRateBps - branch.comparison.discountRateBps >= 300
    ) {
      add(
        "abnormal_discounts",
        "warning",
        { current: branch.current.discountRateBps, previous: branch.comparison.discountRateBps },
        300
      );
    }
    const peers = sameStore.eligible.filter(
      (peer) => peer.branchId !== branch.branchId && peer.comparison.revenueMinor > 0
    );
    if (peers.length >= 2 && growth !== null) {
      const peerCurrent = integer(peers.reduce((sum, peer) => sum + BigInt(peer.current.revenueMinor), 0n));
      const peerPrevious = integer(peers.reduce((sum, peer) => sum + BigInt(peer.comparison.revenueMinor), 0n));
      const peerGrowth = ratio(integer(BigInt(peerCurrent) - BigInt(peerPrevious)), peerPrevious);
      if (peerGrowth !== null && growth <= peerGrowth - 1000)
        add(
          "underperformance",
          "info",
          { current: growth, peerGrowth, peerBranchIds: peers.map((peer) => peer.branchId) },
          1000
        );
    }
    // Ledger costs are booked at timestamps, not allocated to unmatched days.
    // Compare them only when alignment retained both entire requested periods.
    const card = scorecards.find((item) => item.branchId === branch.branchId);
    if (
      card?.fullPeriodComparable &&
      card.current?.foodCostsMinor != null &&
      card.comparison?.foodCostsMinor != null &&
      card.current.revenueMinor === branch.current.revenueMinor &&
      card.comparison.revenueMinor === branch.comparison.revenueMinor
    ) {
      const currentRate = ratio(card.current.foodCostsMinor, branch.current.revenueMinor);
      const previousRate = ratio(card.comparison.foodCostsMinor, branch.comparison.revenueMinor);
      if (currentRate !== null && previousRate !== null && currentRate >= previousRate + 300) {
        add("rising_costs", "warning", { current: currentRate, previous: previousRate }, 300);
        opportunities.at(-1).evidence.costLineage = card.lineage;
      }
    }
  }
  return opportunities.sort((a, b) => a.branchId - b.branchId || a.type.localeCompare(b.type));
}

export function getBranchOperations(user, query) {
  const parsed = validate(branchOperationsQuerySchema, query);
  if (parsed.fromDate || parsed.toDate) {
    if (!parsed.fromDate || !parsed.toDate || parsed.from || parsed.to || parsed.period !== "custom") {
      throw validationError("Custom date filters require both fromDate and toDate, without from or to timestamps.");
    }
    parsed.from = resolveFinancialDateRange(parsed.fromDate, user.timezone).current.from;
    parsed.to = resolveFinancialDateRange(parsed.toDate, user.timezone).current.to;
  }
  const formatter = localFormatter(user.timezone);
  const ranges = resolveFinancialPeriodRanges(parsed, user.timezone);
  const alignment = alignDays(ranges, user.timezone, formatter);
  const report = getFinancialReport(user, { ...parsed, anchor: ranges.anchor }); // Resolve tenant/role/scope before fetching any operational rows.
  const branches = report.restaurants.flatMap((restaurant) =>
    restaurant.branches.map((branch) => ({ ...branch, restaurantId: restaurant.id }))
  );
  const lifecycleQuery = db.prepare(
    "SELECT opened_on,closed_on,updated_by,updated_at FROM branch_lifecycle WHERE branch_id=?"
  );
  const salesQuery =
    db.prepare(`SELECT id,restaurant_id,branch_id,external_order_id,external_line_id,created_at,channel,aggregator_name,
    gross_sales_minor,discount_minor,refund_amount_minor,delivery_commission_minor
    FROM sales_lines WHERE organization_id=? AND restaurant_id=? AND branch_id=?
    AND ((julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?))
      OR (julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?))) ORDER BY created_at,id LIMIT 50001`);
  // Bound ranges before any potentially large query.
  const rows = [];
  for (const branch of branches) {
    branch.lifecycle = lifecycleQuery.get(branch.id) || null;
    const branchRows = salesQuery.all(
      user.organization_id,
      branch.restaurantId,
      branch.id,
      report.period.current.from,
      report.period.current.to,
      report.period.comparison?.from ?? null,
      report.period.comparison?.to ?? null
    );
    if (rows.length + branchRows.length > 50000) {
      throw validationError("Select a shorter operational period with at most 50,000 sales lines.");
    }
    for (const row of branchRows) rows.push({ ...row, local: localStamp(row.created_at, formatter) });
  }
  const currentRows = rows.filter(
    (row) =>
      Date.parse(row.created_at) >= Date.parse(report.period.current.from) &&
      Date.parse(row.created_at) <= Date.parse(report.period.current.to)
  );
  const isFullPeriod = (range, days) =>
    range &&
    days.length &&
    resolveFinancialDateRange(days[0], report.timezone).current.from === range.from &&
    resolveFinancialDateRange(days.at(-1), report.timezone).current.to === range.to &&
    Math.round((Date.parse(`${days.at(-1)}T00:00:00Z`) - Date.parse(`${days[0]}T00:00:00Z`)) / dayMs) + 1 ===
      days.length;
  const scorecards = branches.map((branch) => {
    const current = recordedMetrics(branch.financials.current);
    const comparison = recordedMetrics(branch.financials.comparison);
    return {
      branchId: branch.id,
      restaurantId: branch.restaurantId,
      branchName: branch.name,
      branchCode: branch.code,
      current,
      comparison,
      deltas: Object.fromEntries(Object.keys(current).map((key) => [key, delta(current[key], comparison?.[key])])),
      completeness: {
        current: branch.financials.current.completeness,
        comparison: branch.financials.comparison?.completeness ?? null
      },
      lineage: {
        current: branch.financials.current.lineage,
        comparison: branch.financials.comparison?.lineage ?? null
      },
      lifecycle: branch.lifecycle,
      fullPeriodComparable: Boolean(
        isFullPeriod(report.period.current, alignment.current) &&
        isFullPeriod(report.period.comparison, alignment.comparison)
      )
    };
  });
  const sameStore = compareStores(branches, rows, report.period, alignment);
  const channelFor = (row) => (row.channel === "delivery" && row.aggregator_name ? "aggregator" : row.channel);
  const aggregatorKeys = [...new Set(currentRows.map((row) => row.aggregator_name).filter(Boolean))].sort();
  const total = totals(currentRows);
  return {
    operationsVersion: "5.7-v1",
    scope: report.scope,
    currencyCode: report.currencyCode,
    timezone: report.timezone,
    period: report.period,
    scorecards,
    sameStore,
    timeAnalysis: {
      totals: total,
      weekdays: groupRows(currentRows, [0, 1, 2, 3, 4, 5, 6], (row) => row.local.weekday),
      hours: groupRows(
        currentRows,
        Array.from({ length: 24 }, (_, index) => index),
        (row) => row.local.hour
      ),
      dayparts: groupRows(currentRows, ["breakfast", "lunch", "dinner", "late_night"], (row) =>
        row.local.hour >= 5 && row.local.hour < 12
          ? "breakfast"
          : row.local.hour < 17 && row.local.hour >= 12
            ? "lunch"
            : row.local.hour >= 17 && row.local.hour < 22
              ? "dinner"
              : "late_night"
      ),
      daypartHours: { breakfast: [5, 12], lunch: [12, 17], dinner: [17, 22], late_night: [22, 5] }
    },
    channels: {
      totals: total,
      groups: groupRows(currentRows, ["dine_in", "takeaway", "delivery", "aggregator"], channelFor),
      aggregators: groupRows(currentRows, aggregatorKeys, (row) => row.aggregator_name)
    },
    opportunities: detectOpportunities(sameStore, scorecards),
    policy: {
      money: "integer_minor_units",
      revenueSource: "confirmed_sales_lines",
      scorecardSource: "financial_ledger_entries",
      closedOnExclusive: true,
      currentPartialDaysExcludedFromComparison: true,
      thresholds: {
        fallingSalesBps: -1000,
        refundRateBps: 500,
        minimumDiscountRateBps: 1000,
        discountIncreaseBps: 300,
        foodCostRateIncreaseBps: 300,
        peerGrowthGapBps: 1000
      },
      limitations: [
        "No sales record is missing evidence, not proof of a zero-sales day.",
        "Same-store eligibility requires a documented opening date and sales evidence on every matched date; temporary closures and holiday effects are not modeled.",
        "Time and channel totals cover confirmed item-level imports only. Scorecards cover the financial ledger, including manual entries.",
        "Bucket order counts are distinct within each bucket; orders split across times or channels may appear in more than one bucket.",
        "Revenue after commission is not profit. No savings or causal explanations are estimated.",
        "Observed sales dates do not prove that all transactions were imported."
      ]
    }
  };
}
