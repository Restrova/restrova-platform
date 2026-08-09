import { executeTool } from "../tools.js";
import { toolScope } from "./branchService.js";

export function getDashboard(user) {
  const scope = toolScope(user);
  return {
    currency: user.currency,
    sales: executeTool("get_daily_sales", {}, scope),
    inventory: executeTool("get_inventory_status", {}, scope),
    topDishes: executeTool("get_top_dishes", {}, scope).slice(0, 3)
  };
}
