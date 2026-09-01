import { executeTool } from "../tools.js";
import { toolScope } from "./branchService.js";
import { hasFinancialData } from "./importedAnalyticsService.js";

export function getDashboard(user, query = {}) {
  const scope = toolScope(user, query.branchId);
  const imported = hasFinancialData(scope.restaurantId);
  const sales = executeTool(
    imported ? "get_profit_summary" : "get_daily_sales",
    imported ? { range: "month" } : {},
    scope
  );
  return {
    currency: user.currency,
    source: imported ? "imports" : "legacy",
    period: sales.period,
    branchName: sales.branch_name,
    sales,
    inventory: executeTool("get_inventory_status", {}, scope),
    topDishes: executeTool("get_top_dishes", {}, scope).slice(0, 3)
  };
}
