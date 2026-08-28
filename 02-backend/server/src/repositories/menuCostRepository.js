import { db } from "../db.js";

function catalogClauses(user, filters) {
  const clauses = ["organization_id=?", "restaurant_id=?"];
  const values = [user.organization_id, user.restaurant_id];

  if (filters.itemCode) {
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
      `SELECT id,item_code,name,category,selling_price_minor,active,updated_at
       FROM catalog_items
       WHERE ${clauses.join(" AND ")}
       ORDER BY lower(name),id
       LIMIT ? OFFSET ?`
    )
    .all(...values, filters.limit, filters.offset);
}

function itemPlaceholders(itemIds) {
  return itemIds.map(() => "?").join(",");
}

export function listApplicableCosts(user, itemIds, { branchId, asOf }) {
  if (!itemIds.length) return [];
  const branchClause = branchId ? "(branch_id=? OR branch_id IS NULL)" : "branch_id IS NULL";
  const values = [user.organization_id, user.restaurant_id, ...itemIds];
  if (branchId) values.push(branchId);
  values.push(asOf);
  const branchOrder = branchId ? "CASE WHEN branch_id=? THEN 0 ELSE 1 END," : "";
  if (branchId) values.push(branchId);

  return db
    .prepare(
      `SELECT id,catalog_item_id,branch_id,direct_food_cost_minor,packaging_cost_minor,effective_from,created_at
       FROM item_costs
       WHERE organization_id=? AND restaurant_id=?
         AND catalog_item_id IN (${itemPlaceholders(itemIds)})
         AND ${branchClause}
         AND julianday(effective_from)<=julianday(?)
       ORDER BY catalog_item_id,${branchOrder}julianday(effective_from) DESC,id DESC`
    )
    .all(...values);
}

export function listDeliveryCommissionEvidence(user, itemIds, { branchId, asOf, commissionFrom }) {
  if (!itemIds.length) return [];
  const clauses = [
    "organization_id=?",
    "restaurant_id=?",
    `catalog_item_id IN (${itemPlaceholders(itemIds)})`,
    "channel='delivery'",
    "julianday(created_at)<=julianday(?)"
  ];
  const values = [user.organization_id, user.restaurant_id, ...itemIds, asOf];

  if (branchId) {
    clauses.push("branch_id=?");
    values.push(branchId);
  }
  if (commissionFrom) {
    clauses.push("julianday(created_at)>=julianday(?)");
    values.push(commissionFrom);
  }

  return db
    .prepare(
      `SELECT catalog_item_id,count(*) line_count,min(id) first_line_id,max(id) last_line_id,
              sum(gross_sales_minor) gross_sales_minor,
              sum(delivery_commission_minor) delivery_commission_minor,
              min(created_at) first_sale_at,max(created_at) last_sale_at
       FROM sales_lines
       WHERE ${clauses.join(" AND ")}
       GROUP BY catalog_item_id
       ORDER BY catalog_item_id`
    )
    .all(...values);
}
