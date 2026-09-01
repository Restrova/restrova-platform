import { executeTool } from "../tools.js";
import { toolScope } from "./branchService.js";
import { getFinancialDashboard } from "./financialDashboardService.js";
import { getMenuMargins } from "./menuMarginService.js";

function majorUnits(amountMinor, currencyCode) {
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode
  }).resolvedOptions().maximumFractionDigits;
  return amountMinor / 10 ** digits;
}

function importedScope(user) {
  if (user.role === "branch_manager") {
    return { scope: "branch", branchId: user.branch_id };
  }
  return { scope: "organization" };
}

function importedDashboard(user) {
  const financial = getFinancialDashboard(user, {
    ...importedScope(user),
    period: "month",
    comparison: "none"
  });
  if (!financial.summary.completeness.hasData) return null;

  const currency = financial.currencyCode;
  const summary = financial.summary;
  const menu = getMenuMargins(
    user,
    {
      ...(user.role === "branch_manager" ? { branchId: user.branch_id } : {}),
      from: financial.period.current.from,
      to: financial.period.current.to,
      limit: 100,
      offset: 0
    },
    { allItems: true }
  );
  const topDishes = menu.items
    .filter((item) => item.completeness.hasSalesData)
    .sort((left, right) => right.metrics.itemRevenueMinor - left.metrics.itemRevenueMinor)
    .slice(0, 3)
    .map((item) => ({
      name: item.name,
      units: item.metrics.quantitySold,
      revenue: majorUnits(item.metrics.itemRevenueMinor, currency),
      profit:
        item.metrics.contributionProfitMinor == null
          ? null
          : majorUnits(item.metrics.contributionProfitMinor, currency),
      margin_percent: item.metrics.contributionMarginBps == null ? null : item.metrics.contributionMarginBps / 100
    }));

  return {
    currency,
    source: "imports",
    period: financial.period.current,
    sales: {
      revenue: majorUnits(summary.revenue.grossSalesMinor, currency),
      net_revenue: majorUnits(summary.revenue.revenueMinor, currency),
      profit: majorUnits(summary.profit.netProfitMinor, currency),
      margin_percent: summary.marginsBps.netMarginBps == null ? 0 : summary.marginsBps.netMarginBps / 100,
      orders: summary.orders.orderCount
    },
    inventory: executeTool("get_inventory_status", {}, toolScope(user)),
    topDishes
  };
}

export function getDashboard(user) {
  const imported = importedDashboard(user);
  if (imported) return imported;

  const scope = toolScope(user);
  return {
    currency: user.currency,
    source: "legacy",
    sales: executeTool("get_daily_sales", {}, scope),
    inventory: executeTool("get_inventory_status", {}, scope),
    topDishes: executeTool("get_top_dishes", {}, scope).slice(0, 3)
  };
}
