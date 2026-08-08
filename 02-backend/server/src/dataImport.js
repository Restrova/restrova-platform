import { db } from "./db.js";
import crypto from "node:crypto";

const requiredColumns = {
  orders: ["created_at", "total_price", "cost"],
  refunds: ["amount", "created_at"],
  menu_items: ["name", "price", "cost"],
  inventory: ["item_name", "quantity", "threshold"],
  staff_shifts: ["employee_name", "role", "start_at", "end_at", "hourly_rate"]
};

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

export function parseCsv(csv) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("The CSV must contain a header and at least one data row.");
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const rows = lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) throw new Error(`Row ${rowIndex + 2} has ${values.length} values; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
  return { headers, rows };
}

const number = (value, field, row) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Row ${row}: ${field} must be a non-negative number.`);
  return parsed;
};
const date = (value, field, row) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Row ${row}: ${field} must be a valid date.`);
  return parsed.toISOString();
};

const rowKey = (type, branchId, row) => crypto.createHash("sha256").update(JSON.stringify({ type, branchId, row })).digest("hex");

export function previewRestaurantData(type, csv) {
  if (!requiredColumns[type]) throw new Error("Unsupported import type.");
  const { headers, rows } = parseCsv(csv);
  const missing = requiredColumns[type].filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);
  if (rows.length > 10000) throw new Error("A single import cannot exceed 10,000 rows.");
  return { type, rows: rows.length, headers, sample: rows.slice(0, 5), requires_confirmation: true };
}

export function importRestaurantData(type, csv, restaurantId, { branchId, confirm = false } = {}) {
  if (!confirm) throw new Error("Preview this CSV first, then import with confirm=true.");
  const preview = previewRestaurantData(type, csv);
  const { rows } = parseCsv(csv);
  if (!branchId) throw new Error("A branch is required for live imports.");

  const run = db.transaction(() => {
    let imported = 0;
    let skipped_duplicates = 0;
    rows.forEach((row, index) => {
      const line = index + 2;
      const sourceKey = row.source_key || row.external_id || row.id || rowKey(type, branchId, row);
      if (type === "orders") {
        const totalPrice = number(row.total_price, "total_price", line);
        const totalCost = number(row.cost, "cost", line);
        const quantity = number(row.quantity || 1, "quantity", line) || 1;
        const items = row.items?.trim() || JSON.stringify([{ name: row.item_name || "Imported sale", quantity, price: +(totalPrice / quantity).toFixed(4), cost: +(totalCost / quantity).toFixed(4) }]);
        try { JSON.parse(items); } catch { throw new Error(`Row ${line}: items must be valid JSON when provided.`); }
        const result = db.prepare("INSERT OR IGNORE INTO orders(restaurant_id,branch_id,items,total_price,cost,discount,commission,other_cost,created_at,source_key) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(restaurantId, branchId, items, totalPrice, totalCost, number(row.discount || 0, "discount", line), number(row.commission || 0, "commission", line), number(row.other_cost || 0, "other_cost", line), date(row.created_at, "created_at", line), sourceKey);
        if (!result.changes) { skipped_duplicates++; return; }
      } else if (type === "refunds") {
        const result = db.prepare("INSERT OR IGNORE INTO refunds(restaurant_id,branch_id,order_id,amount,reason,created_at,source_key) VALUES (?,?,?,?,?,?,?)")
          .run(restaurantId, branchId, row.order_id ? number(row.order_id, "order_id", line) : null, number(row.amount, "amount", line), row.reason || null, date(row.created_at, "created_at", line), sourceKey);
        if (!result.changes) { skipped_duplicates++; return; }
      } else if (type === "menu_items") {
        const existing = db.prepare("SELECT id FROM menu_items WHERE restaurant_id=? AND lower(name)=lower(?)").get(restaurantId, row.name);
        if (existing) db.prepare("UPDATE menu_items SET price=?,cost=?,active=? WHERE id=?").run(number(row.price, "price", line), number(row.cost, "cost", line), row.active?.toLowerCase() === "false" ? 0 : 1, existing.id);
        else db.prepare("INSERT INTO menu_items(restaurant_id,name,price,cost,active) VALUES (?,?,?,?,?)").run(restaurantId, row.name, number(row.price, "price", line), number(row.cost, "cost", line), row.active?.toLowerCase() === "false" ? 0 : 1);
      } else if (type === "inventory") {
        const existing = db.prepare("SELECT id FROM inventory WHERE restaurant_id=? AND branch_id=? AND lower(item_name)=lower(?)").get(restaurantId, branchId, row.item_name);
        if (existing) db.prepare("UPDATE inventory SET quantity=?,threshold=? WHERE id=?").run(number(row.quantity, "quantity", line), number(row.threshold, "threshold", line), existing.id);
        else db.prepare("INSERT INTO inventory(restaurant_id,branch_id,item_name,quantity,threshold) VALUES (?,?,?,?,?)").run(restaurantId, branchId, row.item_name, number(row.quantity, "quantity", line), number(row.threshold, "threshold", line));
      } else {
        const start = date(row.start_at, "start_at", line); const end = date(row.end_at, "end_at", line);
        if (end <= start) throw new Error(`Row ${line}: end_at must be after start_at.`);
        db.prepare("INSERT INTO staff_shifts(restaurant_id,branch_id,employee_name,role,start_at,end_at,hourly_rate) VALUES (?,?,?,?,?,?,?)").run(restaurantId, branchId, row.employee_name, row.role, start, end, number(row.hourly_rate, "hourly_rate", line));
      }
      imported++;
    });
    return { imported, skipped_duplicates };
  });
  return { type, ...run(), preview, imported_at: new Date().toISOString() };
}

export function dataConnectionStatus(restaurantId, branchId) {
  const count = (table) => {
    const sql = branchId ? `SELECT count(*) count FROM ${table} WHERE restaurant_id=? AND branch_id=?` : `SELECT count(*) count FROM ${table} WHERE restaurant_id=?`;
    return db.prepare(sql).get(...(branchId ? [restaurantId, branchId] : [restaurantId])).count;
  };
  return {
    orders: count("orders"),
    refunds: count("refunds"),
    menu_items: count("menu_items"),
    inventory: count("inventory"),
    staff_shifts: count("staff_shifts")
  };
}
