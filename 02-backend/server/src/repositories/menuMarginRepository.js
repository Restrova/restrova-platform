import { db } from "../db.js";

function catalogClauses(user, filters, { includeItemCode = true } = {}) {
  const clauses = ["organization_id=?", "restaurant_id=?"];
  const values = [user.organization_id, user.restaurant_id];

  if (includeItemCode && filters.itemCode) {
    clauses.push("lower(item_code)=lower(?)");
    values.push(filters.itemCode);
  }
  if (filters.status !== "all") {
    clauses.push("active=?");
    values.push(filters.status === "active" ? 1 : 0);
  }
  return { clauses, values };
}

export function countCatalogItems(user, filters) {
  const { clauses, values } = catalogClauses(user, filters);
  return Number(
    db.prepare(`SELECT count(*) count FROM catalog_items WHERE ${clauses.join(" AND ")}`).get(...values).count
  );
}

export function listCatalogItems(user, filters) {
  const { clauses, values } = catalogClauses(user, filters);
  return db
    .prepare(
      `SELECT id,item_code,name,category,active
       FROM catalog_items
       WHERE ${clauses.join(" AND ")}
       ORDER BY lower(name),id
       LIMIT ? OFFSET ?`
    )
    .all(...values, filters.limit, filters.offset);
}

function salesScope(user, filters) {
  const clauses = ["line.organization_id=?", "line.restaurant_id=?"];
  const values = [user.organization_id, user.restaurant_id];

  if (filters.branchId) {
    clauses.push("line.branch_id=?");
    values.push(filters.branchId);
  }
  if (filters.from) {
    clauses.push("julianday(line.created_at)>=julianday(?)");
    values.push(filters.from);
  }
  if (filters.to) {
    clauses.push("julianday(line.created_at)<=julianday(?)");
    values.push(filters.to);
  }
  if (filters.status !== "all") {
    clauses.push("item.active=?");
    values.push(filters.status === "active" ? 1 : 0);
  }
  return { clauses, values };
}

export function listScopedQuantities(user, filters) {
  const { clauses, values } = salesScope(user, filters);
  return db
    .prepare(
      `SELECT line.quantity
       FROM sales_lines line
       JOIN catalog_items item ON item.id=line.catalog_item_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY line.id`
    )
    .all(...values);
}

function placeholders(values) {
  return values.map(() => "?").join(",");
}

export function listSalesLines(user, itemIds, filters) {
  if (!itemIds.length) return [];
  const { clauses, values } = salesScope(user, filters);
  clauses.push(`line.catalog_item_id IN (${placeholders(itemIds)})`);
  values.push(...itemIds);

  return db
    .prepare(
      `SELECT line.id,line.catalog_item_id,line.branch_id,line.external_order_id,line.external_line_id,
              line.created_at,line.channel,line.quantity,line.gross_sales_minor,line.discount_minor,
              line.refund_amount_minor,line.delivery_commission_minor
       FROM sales_lines line
       JOIN catalog_items item ON item.id=line.catalog_item_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY line.catalog_item_id,julianday(line.created_at),line.id`
    )
    .all(...values);
}

export function listCostHistory(user, itemIds, filters) {
  if (!itemIds.length) return [];
  const clauses = ["organization_id=?", "restaurant_id=?", `catalog_item_id IN (${placeholders(itemIds)})`];
  const values = [user.organization_id, user.restaurant_id, ...itemIds];

  if (filters.branchId) {
    clauses.push("(branch_id=? OR branch_id IS NULL)");
    values.push(filters.branchId);
  }
  if (filters.to) {
    clauses.push("julianday(effective_from)<=julianday(?)");
    values.push(filters.to);
  }

  return db
    .prepare(
      `SELECT id,catalog_item_id,branch_id,direct_food_cost_minor,packaging_cost_minor,
              effective_from,created_at
       FROM item_costs
       WHERE ${clauses.join(" AND ")}
       ORDER BY catalog_item_id,branch_id,julianday(effective_from) DESC,id DESC`
    )
    .all(...values);
}
