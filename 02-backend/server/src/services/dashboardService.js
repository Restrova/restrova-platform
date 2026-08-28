import { notFound } from "../errors/appError.js";
import { executeTool } from "../tools.js";
import { branchIdFromRequest, toolScope } from "./branchService.js";

export function getDashboard(user, query = {}) {
  // Branch scoping: an explicitly requested branch must belong to the owner's
  // organization and restaurant; anything else is rejected, never ignored.
  const branchId = branchIdFromRequest(user, { query });
  if (query.branchId && !branchId) throw notFound("Branch not found");
  const scope = toolScope(user, branchId);
  return {
    currency: user.currency,
    sales: executeTool("get_daily_sales", {}, scope),
    inventory: executeTool("get_inventory_status", {}, scope),
    topDishes: executeTool("get_top_dishes", {}, scope).slice(0, 3)
  };
}
