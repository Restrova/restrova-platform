import { db } from "../db.js";

export function getLifecycle(branchId) {
  return db.prepare("SELECT * FROM branch_lifecycle WHERE branch_id=?").get(branchId) || {};
}

export function saveLifecycle(user, branchId, { openedOn, closedOn }) {
  db.prepare(
    `INSERT INTO branch_lifecycle(branch_id,opened_on,closed_on,updated_by) VALUES (?,?,?,?)
    ON CONFLICT(branch_id) DO UPDATE SET opened_on=excluded.opened_on,closed_on=excluded.closed_on,
    updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`
  ).run(branchId, openedOn, closedOn, user.owner_id);
}

export function findBranchInScope(user, branchId) {
  return db
    .prepare("SELECT * FROM branches WHERE id=? AND organization_id=? AND restaurant_id=?")
    .get(branchId, user.organization_id, user.restaurant_id);
}

export function getDefaultBranchId(user) {
  if (user.role === "branch_manager") return user.branch_id;
  return (
    db.prepare("SELECT id FROM branches WHERE restaurant_id=? ORDER BY id LIMIT 1").get(user.restaurant_id)?.id || null
  );
}

export function listBranchesForUser(user) {
  return db
    .prepare(
      `
    SELECT id,name,code,city,address,phone,pos_system,operating_day_start,operating_day_end,
      (SELECT opened_on FROM branch_lifecycle WHERE branch_id=branches.id) AS opened_on,
      (SELECT closed_on FROM branch_lifecycle WHERE branch_id=branches.id) AS closed_on
    FROM branches
    WHERE organization_id=? AND restaurant_id=?
      AND (? <> 'branch_manager' OR id=?)
    ORDER BY code
  `
    )
    .all(user.organization_id, user.restaurant_id, user.role, user.branch_id);
}

export function createBranch(user, parsed) {
  const id = Number(
    db
      .prepare(
        "INSERT INTO branches(organization_id,restaurant_id,name,code,city,address,phone,pos_system,operating_day_start,operating_day_end) VALUES (?,?,?,?,?,?,?,?,?,?)"
      )
      .run(
        user.organization_id,
        user.restaurant_id,
        parsed.name,
        parsed.code,
        parsed.city,
        parsed.address || null,
        parsed.phone || null,
        parsed.posSystem || null,
        parsed.operatingDayStart,
        parsed.operatingDayEnd
      ).lastInsertRowid
  );
  return db.prepare("SELECT * FROM branches WHERE id=?").get(id);
}

export function updateBranch(branchId, parsed) {
  const current = db.prepare("SELECT * FROM branches WHERE id=?").get(branchId);
  db.prepare(
    "UPDATE branches SET name=?,code=?,city=?,address=?,phone=?,pos_system=?,operating_day_start=?,operating_day_end=? WHERE id=?"
  ).run(
    parsed.name ?? current.name,
    parsed.code ?? current.code,
    parsed.city ?? current.city,
    parsed.address ?? current.address,
    parsed.phone ?? current.phone,
    parsed.posSystem ?? current.pos_system,
    parsed.operatingDayStart ?? current.operating_day_start,
    parsed.operatingDayEnd ?? current.operating_day_end,
    branchId
  );
  return db.prepare("SELECT * FROM branches WHERE id=?").get(branchId);
}
