import { db } from "../db.js";

export function getAuthContext(ownerId, organizationId, restaurantId) {
  const membership = db.prepare(`
    SELECT u.id owner_id,u.email,u.name,ou.role,ou.branch_id,o.id organization_id,o.name organization_name,o.currency,o.timezone,o.language,r.id restaurant_id,r.name restaurant_name
    FROM organization_users ou
    JOIN owners u ON u.id=ou.owner_id
    JOIN organizations o ON o.id=ou.organization_id
    JOIN restaurants r ON r.organization_id=o.id
    WHERE u.id=?
      AND (? IS NULL OR o.id=?)
      AND (? IS NULL OR r.id=?)
    ORDER BY ou.id
    LIMIT 1
  `).get(ownerId, organizationId || null, organizationId || null, restaurantId || null, restaurantId || null);
  if (membership) return membership;
  const legacy = db.prepare("SELECT o.id owner_id,o.email,o.name,r.id restaurant_id,r.name restaurant_name,r.organization_id FROM owners o JOIN restaurants r ON r.owner_id=o.id WHERE o.id=? LIMIT 1").get(ownerId);
  if (!legacy) return null;
  return { ...legacy, role: "owner", branch_id: null, organization_id: legacy.organization_id, organization_name: legacy.restaurant_name, currency: "CNY", timezone: "Asia/Shanghai", language: "ar" };
}

export function findOwnerByEmail(email) {
  return db.prepare("SELECT * FROM owners WHERE email=?").get(email);
}

export function isEmailRegistered(email) {
  return Boolean(db.prepare("SELECT id FROM owners WHERE lower(email)=lower(?)").get(email));
}

export function createRegistration(parsed, passwordHash) {
  return db.transaction(() => {
    const ownerId = Number(db.prepare("INSERT INTO owners(email,password_hash,name) VALUES (?,?,?)").run(parsed.email, passwordHash, parsed.name).lastInsertRowid);
    const organizationId = Number(db.prepare("INSERT INTO organizations(name,currency,timezone,language) VALUES (?,?,?,?)").run(parsed.organizationName, parsed.currency.toUpperCase(), parsed.timezone, parsed.language).lastInsertRowid);
    const restaurantId = Number(db.prepare("INSERT INTO restaurants(name,owner_id,organization_id,currency,timezone,language,business_type) VALUES (?,?,?,?,?,?,?)").run(parsed.restaurantName, ownerId, organizationId, parsed.currency.toUpperCase(), parsed.timezone, parsed.language, "yemeni").lastInsertRowid);
    db.prepare("INSERT INTO branches(organization_id,restaurant_id,name,code,city,operating_day_start,operating_day_end) VALUES (?,?,?,?,?,?,?)").run(organizationId, restaurantId, parsed.branchName, parsed.branchCode, parsed.city, parsed.operatingDayStart, parsed.operatingDayEnd);
    db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)").run(organizationId, ownerId, "owner", null);
    return getAuthContext(ownerId, organizationId, restaurantId);
  })();
}
