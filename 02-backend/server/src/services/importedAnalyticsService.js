import { db } from "../db.js";
import { calculateFinancialMetrics } from "./financialService.js";
import { resolveFinancialDateRange, resolveFinancialPeriodRanges } from "./financialPeriodService.js";
import { getMenuMargins } from "./menuMarginService.js";

export function majorUnits(amountMinor, currency) {
  if (amountMinor == null) return null;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  return amountMinor / 10 ** digits;
}

export function hasFinancialData(restaurantId) {
  return Boolean(db.prepare("SELECT 1 FROM financial_ledger_entries WHERE restaurant_id=? LIMIT 1").get(restaurantId));
}

export function importedAnalytics(name, args, context) {
  if (
    ![
      "get_daily_sales",
      "get_profit_summary",
      "get_top_dishes",
      "get_low_performance_items",
      "get_refund_summary"
    ].includes(name)
  )
    return null;
  // Select the source independently of the requested period/branch. An empty range must never expose demo data.
  if (!hasFinancialData(context.restaurantId)) return null;
  const restaurant = db
    .prepare(
      "SELECT r.organization_id,o.currency,o.timezone FROM restaurants r JOIN organizations o ON o.id=r.organization_id WHERE r.id=?"
    )
    .get(context.restaurantId);
  const user = {
    organization_id: restaurant.organization_id,
    restaurant_id: context.restaurantId,
    branch_id: context.branchId,
    role: context.role || "viewer",
    currency: restaurant.currency,
    timezone: restaurant.timezone
  };
  const range = args.range || (name === "get_daily_sales" ? "today" : "month");
  const period =
    args.fromDate && args.toDate
      ? resolveFinancialPeriodRanges(
          {
            period: "custom",
            comparison: "none",
            from: resolveFinancialDateRange(args.fromDate, user.timezone).current.from,
            to: resolveFinancialDateRange(args.toDate, user.timezone).current.to
          },
          user.timezone
        )
      : args.date
        ? resolveFinancialDateRange(args.date, user.timezone)
        : resolveFinancialPeriodRanges(
            { period: range, comparison: "none", ...(args.anchor ? { anchor: args.anchor } : {}) },
            user.timezone
          );
  const filters = { ...(context.branchId ? { branchId: context.branchId } : {}), ...period.current };
  const financial = calculateFinancialMetrics(user, filters);
  const branch = context.branchId
    ? db.prepare("SELECT name FROM branches WHERE restaurant_id=? AND id=?").get(context.restaurantId, context.branchId)
    : null;
  const coverage = db
    .prepare(
      `SELECT MIN(occurred_at) AS first,MAX(occurred_at) AS last FROM financial_ledger_entries WHERE restaurant_id=? AND category='sales'${context.branchId ? " AND branch_id=?" : ""}`
    )
    .get(...(context.branchId ? [context.restaurantId, context.branchId] : [context.restaurantId]));
  const metadata = {
    source: "imports",
    currency: user.currency,
    timezone: user.timezone,
    branch_id: context.branchId || null,
    branch_name: branch?.name || null,
    range,
    period: period.current,
    coverage,
    has_data: financial.completeness.hasData,
    has_sales: financial.completeness.presentCategories.includes("sales"),
    missing_categories: financial.completeness.missingCategories
  };
  const menu = () =>
    getMenuMargins(user, { ...filters, status: "all", limit: 100, offset: 0 }, { allItems: true }).items.filter(
      (item) => item.completeness.hasSalesData
    );
  if (name === "get_top_dishes" || name === "get_low_performance_items") {
    let items = menu().map((item) => ({
      name: item.name,
      units: item.metrics.quantitySold,
      revenue: majorUnits(item.metrics.itemRevenueMinor, user.currency),
      profit: majorUnits(item.metrics.contributionProfitMinor, user.currency),
      margin_percent: item.metrics.contributionMarginBps == null ? null : item.metrics.contributionMarginBps / 100,
      currency: user.currency
    }));
    items =
      name === "get_top_dishes"
        ? items.sort((a, b) => b.revenue - a.revenue).slice(0, 5)
        : items
            .filter((item) => item.margin_percent == null || item.margin_percent < 35 || item.units < 5)
            .sort((a, b) => (a.margin_percent ?? -Infinity) - (b.margin_percent ?? -Infinity));
    items.metadata = metadata;
    return items;
  }
  const metrics = financial.metrics;
  const amount = (key) => majorUnits(metrics[key], user.currency);
  if (name === "get_refund_summary") {
    const refunds = db
      .prepare(
        `SELECT COUNT(DISTINCT branch_id || ':' || external_order_id) AS count FROM sales_lines WHERE restaurant_id=?${context.branchId ? " AND branch_id=?" : ""} AND refund_amount_minor>0 AND julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?)`
      )
      .get(
        ...(context.branchId ? [context.restaurantId, context.branchId] : [context.restaurantId]),
        filters.from,
        filters.to
      );
    return { ...metadata, refunds: refunds.count, refunded_amount: amount("refundsMinor"), top_reasons: [] };
  }
  const costComplete =
    metadata.has_sales &&
    !menu().some((item) => !item.completeness.hasCompleteCosts) &&
    financial.completeness.presentCategories.includes("food_costs");
  return {
    ...metadata,
    date:
      args.date || new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(new Date(period.current.from)),
    revenue: amount("grossSalesMinor"),
    net_revenue: amount("revenueMinor"),
    discounts: amount("discountsMinor"),
    refunded_amount: amount("refundsMinor"),
    cost: amount("totalCostsMinor"),
    profit: costComplete ? amount("netProfitMinor") : null,
    margin_percent: costComplete && metrics.netMarginBps != null ? metrics.netMarginBps / 100 : null,
    orders: metrics.orderCount,
    peak_hour: null,
    cost_complete: costComplete,
    profit_label: "estimated profit after recorded costs"
  };
}
