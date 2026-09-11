import { predictionInterval } from "./forecastConfidenceService.js";
import { seasonalEvents, seasonalBaseline } from "./seasonalService.js";
import { getDataRevision } from "./dataRevisionService.js";
import { forecastQuerySchema, validate } from "../validation/schemas.js";
import { getHistoricalSeries, dayOffset, weekday, median, sum, rounded, safe } from "./historicalSeriesService.js";
import { financialCategories, financialAssumptions } from "./financialService.js";

const costKeys = financialCategories
  .filter((item) => ["variable_cost", "operating_expense"].includes(item.group))
  .map((item) => item.key);
const operatingKeys = financialCategories.filter((item) => item.group === "operating_expense").map((item) => item.key);
const fields = [
  "grossSalesMinor",
  "revenueMinor",
  "orderCount",
  "foodCostsMinor",
  "packagingMinor",
  "commissionsMinor",
  "operatingCostsMinor",
  "grossProfitMinor",
  "contributionProfitMinor",
  "netProfitMinor"
];

export function getForecast(user, query) {
  const parsed = validate(forecastQuerySchema, query),
    history = getHistoricalSeries(user, parsed);
  const dates = Array.from({ length: parsed.horizon }, (_, i) => dayOffset(history.today, i + 1));
  const branches = history.branches.map((branch) => {
    const observed = branch.days.filter((day) => day.observed);
    const events = seasonalEvents({ ...user, restaurant_id: branch.restaurantId }, branch.branchId);
    const categoryTotals = Object.fromEntries(
      financialCategories.map(({ key }) => [
        key,
        branch.days.some((day) => key in day.categories)
          ? sum(branch.days.map((day) => day.categories[key] ?? 0))
          : null
      ])
    );
    const historyRevenue = sum(observed.map((day) => day.revenueMinor));
    const missingCategories = [...costKeys, "sales", "discounts", "refunds"].filter(
      (key) => categoryTotals[key] === null
    );
    const ledgerRevenue = ["sales", "discounts", "refunds"].every((key) => categoryTotals[key] !== null)
      ? safe(BigInt(categoryTotals.sales) - BigInt(categoryTotals.discounts) - BigInt(categoryTotals.refunds))
      : null;
    const costReady =
      observed.length === branch.days.length &&
      missingCategories.length === 0 &&
      historyRevenue > 0 &&
      ledgerRevenue === historyRevenue;
    const daily = dates.map((date) => {
      const seasonal = seasonalBaseline(
        observed.filter((day) => weekday(day.date) === weekday(date)),
        date,
        events
      );
      const baseline = seasonal.days;
      const row = {
        date,
        ...Object.fromEntries(fields.map((key) => [key, null])),
        status: "insufficient_data",
        reason: null,
        seasonalContext: seasonal.events,
        baselineDates: baseline.map((day) => day.date)
      };
      if (
        !branch.lifecycle.opened_on ||
        branch.lifecycle.opened_on > date ||
        (branch.lifecycle.closed_on && branch.lifecycle.closed_on <= date)
      ) {
        row.reason = "branch_not_operating_or_unknown_lifecycle";
        return row;
      }
      if (baseline.length < 4) {
        row.reason = "requires_four_observed_same_weekdays";
        return row;
      }
      row.grossSalesMinor = median(baseline.map((day) => day.grossSalesMinor));
      row.revenueMinor = median(baseline.map((day) => day.revenueMinor));
      row.orderCount = median(baseline.map((day) => day.orderCount));
      row.intervals = {
        revenueMinor: predictionInterval(
          seasonalBaseline(observed, date, events).days,
          row.revenueMinor,
          "revenueMinor"
        ),
        grossSalesMinor: predictionInterval(
          seasonalBaseline(observed, date, events).days,
          row.grossSalesMinor,
          "grossSalesMinor"
        )
      };
      if (seasonal.events.length)
        row.intervals = {
          revenueMinor: {
            status: "unavailable",
            reason: "season_specific_calibration_required",
            lower: null,
            upper: null
          },
          grossSalesMinor: {
            status: "unavailable",
            reason: "season_specific_calibration_required",
            lower: null,
            upper: null
          }
        };
      row.status = "sales_ready";
      if (!costReady || row.revenueMinor < 0) {
        row.reason = "costs_require_complete_reconciled_positive_revenue_history";
        return row;
      }
      const variable = (key) => rounded(BigInt(categoryTotals[key]) * BigInt(row.revenueMinor), historyRevenue);
      row.foodCostsMinor = variable("food_costs");
      row.packagingMinor = variable("packaging");
      row.commissionsMinor = variable("delivery_commissions");
      row.operatingCostsMinor = rounded(
        BigInt(sum(operatingKeys.map((key) => categoryTotals[key]))),
        branch.days.length
      );
      row.grossProfitMinor = safe(BigInt(row.revenueMinor) - BigInt(row.foodCostsMinor));
      row.contributionProfitMinor = safe(
        BigInt(row.grossProfitMinor) - BigInt(row.packagingMinor) - BigInt(row.commissionsMinor)
      );
      row.netProfitMinor = safe(BigInt(row.contributionProfitMinor) - BigInt(row.operatingCostsMinor));
      row.status = "ready";
      return row;
    });
    return {
      branchId: branch.branchId,
      restaurantId: branch.restaurantId,
      branchName: branch.branchName,
      daily,
      totals: aggregate(daily),
      evidence: {
        history: branch.days,
        categoryTotals,
        missingCategories,
        ledgerRevenue,
        importedRevenueMinor: historyRevenue,
        costHistoryComplete: costReady
      }
    };
  });
  const daily = dates.map((date, i) => ({ date, ...aggregate(branches.map((branch) => branch.daily[i])) }));
  if (history.hasUnallocatedLedger) for (const day of daily) for (const key of fields.slice(3)) day[key] = null;
  return {
    hasUnallocatedLedger: history.hasUnallocatedLedger,
    version: "7.5-v1",
    dataRevision: getDataRevision(user),
    language: parsed.language,
    horizon: parsed.horizon,
    scope: history.scope,
    currencyCode: history.currencyCode,
    timezone: history.timezone,
    anchor: history.anchor,
    history: { fromDate: history.startDate, toDate: history.endDate },
    branches,
    daily,
    totals: aggregate(daily),
    labels:
      parsed.language === "zh"
        ? { title: "经营预测", assumption: "基于历史数据的估算，并非保证。" }
        : parsed.language === "en"
          ? { title: "Operating forecast", assumption: "Estimates from recorded history, not guarantees." }
          : { title: "توقعات الأداء", assumption: "هذه تقديرات من البيانات المسجلة، وليست نتائج مضمونة." },
    policy: {
      sales:
        "Median of at least four observed same weekdays, excluding the incomplete anchor day; tomorrow starts after the anchor's local calendar date.",
      costs:
        "Food, packaging and commission scale with historical net-revenue ratios. Operating costs use recorded history total divided by calendar days. All categories must be explicitly present, every historical sales day observed, and total ledger revenue reconciled. Monthly bookings are spread uniformly, not treated as actual daily spend.",
      aggregation:
        "Group values are null if any authorized branch lacks that metric; partial branch totals are never presented as a complete group forecast.",
      limitations: [
        "No future actuals or missing-day zero filling. Operator-recorded seasons restrict same-weekday comparisons; sparse seasons withhold forecasts. Empirical revenue bands have nominal 80% coverage, not guaranteed calibration. Cost/profit and group intervals are unavailable.",
        "Recorded days do not prove every transaction was imported. Forecasts assume continued historical mix and operating costs.",
        ...financialAssumptions
      ]
    }
  };
}
function aggregate(rows) {
  return Object.fromEntries(
    fields.map((key) => [
      key,
      rows.length && rows.every((row) => row[key] !== null && row[key] !== undefined)
        ? sum(rows.map((row) => row[key]))
        : null
    ])
  );
}
