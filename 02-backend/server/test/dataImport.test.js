import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db.js";
import { dataConnectionStatus, importRestaurantData, parseCsv, previewRestaurantData } from "../src/dataImport.js";

const restaurantId = db.prepare("SELECT id FROM restaurants ORDER BY id LIMIT 1").get().id;
const branchId = db.prepare("SELECT id FROM branches WHERE restaurant_id=? ORDER BY id LIMIT 1").get(restaurantId).id;

test("CSV parser handles quoted commas", () => {
  const result = parseCsv('name,price,cost\n"Burger, Deluxe",18,7');
  assert.equal(result.rows[0].name, "Burger, Deluxe");
});

test("menu import validates and stores restaurant-scoped economics", () => {
  const name = `Import Test ${Date.now()}`;
  try {
    const csv = `name,price,cost,active\n${name},22.5,8.25,true`;
    assert.equal(previewRestaurantData("menu_items", csv).rows, 1);
    assert.throws(() => importRestaurantData("menu_items", csv, restaurantId, { branchId }), /confirm=true/);
    const result = importRestaurantData("menu_items", csv, restaurantId, { branchId, confirm: true });
    assert.equal(result.imported, 1);
    const item = db.prepare("SELECT * FROM menu_items WHERE restaurant_id=? AND name=?").get(restaurantId, name);
    assert.equal(item.price, 22.5);
    assert.equal(item.cost, 8.25);
  } finally {
    db.prepare("DELETE FROM menu_items WHERE restaurant_id=? AND name=?").run(restaurantId, name);
  }
});

test("import rejects missing required columns", () => {
  assert.throws(() => previewRestaurantData("inventory", "item_name,quantity\nFlour,10"), /Missing required columns: threshold/);
});

test("order import is duplicate-safe and does not double dish revenue for quantity", () => {
  const name = `Qty Test ${Date.now()}`;
  const csv = `created_at,total_price,cost,item_name,quantity,source_key\n${new Date().toISOString()},40,16,${name},2,qty-${name}`;
  try {
    const first = importRestaurantData("orders", csv, restaurantId, { branchId, confirm: true });
    const second = importRestaurantData("orders", csv, restaurantId, { branchId, confirm: true });
    assert.equal(first.imported, 1);
    assert.equal(second.imported, 0);
    assert.equal(second.skipped_duplicates, 1);
    const order = db.prepare("SELECT items FROM orders WHERE restaurant_id=? AND source_key=?").get(restaurantId, `qty-${name}`);
    const item = JSON.parse(order.items)[0];
    assert.equal(item.quantity, 2);
    assert.equal(item.price, 20);
  } finally {
    db.prepare("DELETE FROM orders WHERE restaurant_id=? AND source_key=?").run(restaurantId, `qty-${name}`);
  }
});

test("connection status reports all supported data sources", () => {
  const status = dataConnectionStatus(restaurantId);
  assert.deepEqual(Object.keys(status), ["orders", "refunds", "menu_items", "inventory", "staff_shifts"]);
});
