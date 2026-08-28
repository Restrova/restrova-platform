import { db } from "../db.js";

export function listRestaurantsForOrganization(user) {
  return db
    .prepare(
      "SELECT id,name,currency,timezone,language,business_type FROM restaurants WHERE organization_id=? ORDER BY id"
    )
    .all(user.organization_id);
}

export function createOrganizationForOwner(user, parsed) {
  const id = Number(
    db
      .prepare("INSERT INTO organizations(name,currency,timezone,language) VALUES (?,?,?,?)")
      .run(parsed.name, parsed.currency.toUpperCase(), parsed.timezone, parsed.language).lastInsertRowid
  );
  db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)").run(
    id,
    user.owner_id,
    "owner",
    null
  );
  return db.prepare("SELECT * FROM organizations WHERE id=?").get(id);
}

export function createRestaurantForOrganization(user, parsed) {
  // H4: a new restaurant always starts with the required base state — a
  // default branch — so dashboards, chat sessions and financial scope work
  // immediately instead of running on branchId = null.
  const create = db.transaction(() => {
    const id = Number(
      db
        .prepare(
          "INSERT INTO restaurants(name,owner_id,organization_id,currency,timezone,language,business_type) VALUES (?,?,?,?,?,?,?)"
        )
        .run(
          parsed.name,
          user.owner_id,
          user.organization_id,
          user.currency,
          user.timezone,
          user.language,
          parsed.businessType
        ).lastInsertRowid
    );
    const branch = db
      .prepare(
        "INSERT INTO branches(organization_id,restaurant_id,name,code,city,operating_day_start,operating_day_end) VALUES (?,?,?,?,?,?,?)"
      )
      .run(
        user.organization_id,
        id,
        `${parsed.name} — Main`,
        `MAIN-${id}`,
        parsed.city || "",
        "00:00",
        "23:59"
      ).lastInsertRowid;
    return { id, branchId: Number(branch) };
  });
  const { id, branchId } = create();
  return {
    ...db.prepare("SELECT id,name,currency,timezone,language,business_type FROM restaurants WHERE id=?").get(id),
    defaultBranch: db.prepare("SELECT id,name,code,city FROM branches WHERE id=?").get(branchId)
  };
}
