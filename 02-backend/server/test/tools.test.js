import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db.js";
import { executeTool } from "../src/tools.js";

const restaurantId = db.prepare("SELECT id FROM restaurants ORDER BY id LIMIT 1").get().id;

function ensureCurrentMonthMenuFixture() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const currentOrders = db
    .prepare("SELECT count(*) count FROM orders WHERE restaurant_id=? AND created_at>=?")
    .get(restaurantId, since).count;
  if (currentOrders > 0) return;
  const branchId =
    db.prepare("SELECT id FROM branches WHERE restaurant_id=? ORDER BY id LIMIT 1").get(restaurantId)?.id || null;
  db.prepare(
    "INSERT OR IGNORE INTO orders(restaurant_id,branch_id,items,total_price,cost,created_at,source_key) VALUES (?,?,?,?,?,?,?)"
  ).run(
    restaurantId,
    branchId,
    JSON.stringify([{ name: "Security Test Low Margin Dish", quantity: 2, price: 10, cost: 9 }]),
    20,
    18,
    new Date().toISOString(),
    `test-current-menu-${restaurantId}`
  );
}

ensureCurrentMonthMenuFixture();

test("daily sales totals reconcile", () => {
  const result = executeTool("get_daily_sales", {}, restaurantId);
  assert.equal(result.profit, +(result.revenue - result.cost).toFixed(2));
  assert.ok(result.margin_percent >= 0 && result.margin_percent <= 100);
});

test("profit summary is restaurant-scoped and structured", () => {
  const result = executeTool("get_profit_summary", { range: "week" }, restaurantId);
  assert.equal(result.range, "week");
  assert.equal(typeof result.revenue, "number");
  assert.equal(typeof result.orders, "number");
});

test("top dishes are ranked by revenue", () => {
  const result = executeTool("get_top_dishes", {}, restaurantId);
  assert.ok(result.length > 0);
  for (let i = 1; i < result.length; i++) assert.ok(result[i - 1].revenue >= result[i].revenue);
});

test("inventory exposes status and alert count", () => {
  const result = executeTool("get_inventory_status", {}, restaurantId);
  assert.equal(result.low_stock_count, result.items.filter((item) => item.status === "low").length);
});

test("staffing produces a concrete recommendation", () => {
  const result = executeTool("suggest_staffing", { level: "busy", date_time: new Date().toISOString() }, restaurantId);
  assert.match(result.recommendation, /Schedule|Add|sufficient/);
});

test("refund summary returns structured anomaly evidence", () => {
  const result = executeTool("get_refund_summary", { range: "week" }, restaurantId);
  assert.equal(result.range, "week");
  assert.equal(typeof result.refunds, "number");
  assert.equal(typeof result.refunded_amount, "number");
  assert.ok(Array.isArray(result.top_reasons));
});
