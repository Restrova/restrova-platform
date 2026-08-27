import { db } from "../db.js";

const selectColumns = `
  id,organization_id,restaurant_id,branch_id,category,amount_minor,currency_code,
  occurred_at,period_start,period_end,source_type,source_reference,description,
  evidence_json,created_by,created_at
`;

function serialize(row) {
  if (!row) return null;
  return { ...row, evidence: JSON.parse(row.evidence_json), evidence_json: undefined };
}

export function insertEntry(user, entry) {
  const scopeKey = entry.branchId ? `branch:${entry.branchId}` : "restaurant";
  const id = Number(
    db
      .prepare(
        `INSERT INTO financial_ledger_entries(
          organization_id,restaurant_id,branch_id,category,amount_minor,currency_code,
          occurred_at,period_start,period_end,source_type,source_reference,description,
          evidence_json,created_by,scope_key
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        user.organization_id,
        user.restaurant_id,
        entry.branchId || null,
        entry.category,
        entry.amountMinor,
        user.currency.toUpperCase(),
        entry.occurredAt,
        entry.periodStart || null,
        entry.periodEnd || null,
        entry.sourceType,
        entry.sourceReference,
        entry.description || null,
        JSON.stringify(entry.evidence),
        user.owner_id,
        scopeKey
      ).lastInsertRowid
  );
  return serialize(db.prepare(`SELECT ${selectColumns} FROM financial_ledger_entries WHERE id=?`).get(id));
}

export function listEntries(user, filters) {
  const clauses = ["organization_id=?", "restaurant_id=?"];
  const parameters = [user.organization_id, user.restaurant_id];

  if (user.role === "branch_manager") {
    clauses.push("branch_id=?");
    parameters.push(user.branch_id);
  } else if (filters.branchId) {
    clauses.push("branch_id=?");
    parameters.push(filters.branchId);
  }
  if (filters.category) {
    clauses.push("category=?");
    parameters.push(filters.category);
  }
  if (filters.from) {
    clauses.push("julianday(occurred_at)>=julianday(?)");
    parameters.push(filters.from);
  }
  if (filters.to) {
    clauses.push("julianday(occurred_at)<=julianday(?)");
    parameters.push(filters.to);
  }

  parameters.push(filters.limit);
  return db
    .prepare(
      `SELECT ${selectColumns}
       FROM financial_ledger_entries
       WHERE ${clauses.join(" AND ")}
       ORDER BY occurred_at DESC,id DESC
       LIMIT ?`
    )
    .all(...parameters)
    .map(serialize);
}

export function listEntriesForCalculation(user, filters) {
  const clauses = ["organization_id=?", "restaurant_id=?"];
  const parameters = [user.organization_id, user.restaurant_id];

  if (user.role === "branch_manager") {
    clauses.push("branch_id=?");
    parameters.push(user.branch_id);
  } else if (filters.branchId) {
    clauses.push("branch_id=?");
    parameters.push(filters.branchId);
  }
  if (filters.from) {
    clauses.push("julianday(occurred_at)>=julianday(?)");
    parameters.push(filters.from);
  }
  if (filters.to) {
    clauses.push("julianday(occurred_at)<=julianday(?)");
    parameters.push(filters.to);
  }

  return db
    .prepare(
      `SELECT organization_id,restaurant_id,branch_id,category,amount_minor,source_type,source_reference
       FROM financial_ledger_entries
       WHERE ${clauses.join(" AND ")}
       ORDER BY occurred_at,id`
    )
    .all(...parameters);
}

export function listReportingRestaurants(organizationId) {
  return db.prepare("SELECT id,name FROM restaurants WHERE organization_id=? ORDER BY id").all(organizationId);
}

export function findReportingRestaurant(organizationId, restaurantId) {
  return db
    .prepare("SELECT id,name FROM restaurants WHERE organization_id=? AND id=?")
    .get(organizationId, restaurantId);
}

export function listReportingBranches(organizationId, restaurantId) {
  return db
    .prepare(
      `SELECT id,restaurant_id,name,code,city
       FROM branches
       WHERE organization_id=? AND restaurant_id=?
       ORDER BY code,id`
    )
    .all(organizationId, restaurantId);
}

export function findReportingBranch(organizationId, branchId) {
  return db
    .prepare(
      `SELECT id,restaurant_id,name,code,city
       FROM branches
       WHERE organization_id=? AND id=?`
    )
    .get(organizationId, branchId);
}

export function listEntriesForReport(organizationId, filters) {
  const clauses = ["organization_id=?"];
  const parameters = [organizationId];

  if (filters.restaurantId) {
    clauses.push("restaurant_id=?");
    parameters.push(filters.restaurantId);
  }
  if (filters.branchId) {
    clauses.push("branch_id=?");
    parameters.push(filters.branchId);
  } else if (filters.unallocatedOnly) {
    clauses.push("branch_id IS NULL");
  }
  if (filters.from) {
    clauses.push("julianday(occurred_at)>=julianday(?)");
    parameters.push(filters.from);
  }
  if (filters.to) {
    clauses.push("julianday(occurred_at)<=julianday(?)");
    parameters.push(filters.to);
  }

  return db
    .prepare(
      `SELECT organization_id,restaurant_id,branch_id,category,amount_minor,occurred_at,source_type,source_reference
       FROM financial_ledger_entries
       WHERE ${clauses.join(" AND ")}
       ORDER BY restaurant_id,branch_id,occurred_at,id`
    )
    .all(...parameters);
}
