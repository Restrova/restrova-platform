import { db } from "../db.js";

export function createOrganizationForOwner(user, parsed) {
  const id = Number(db.prepare("INSERT INTO organizations(name,currency,timezone,language) VALUES (?,?,?,?)").run(parsed.name, parsed.currency.toUpperCase(), parsed.timezone, parsed.language).lastInsertRowid);
  db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)").run(id, user.owner_id, "owner", null);
  return db.prepare("SELECT * FROM organizations WHERE id=?").get(id);
}

export function createRestaurantForOrganization(user, parsed) {
  const id = Number(db.prepare("INSERT INTO restaurants(name,owner_id,organization_id,currency,timezone,language,business_type) VALUES (?,?,?,?,?,?,?)").run(parsed.name, user.owner_id, user.organization_id, user.currency, user.timezone, user.language, parsed.businessType).lastInsertRowid);
  return db.prepare("SELECT id,name,currency,timezone,language,business_type FROM restaurants WHERE id=?").get(id);
}
