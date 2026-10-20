import { db } from "../db.js";

export function getAuthContext(ownerId, organizationId, restaurantId) {
  const membership = db
    .prepare(
      `
    SELECT u.id owner_id,u.email,u.name,ou.id membership_id,ou.role,ou.branch_id,o.id organization_id,o.name organization_name,o.currency,o.timezone,o.language,r.id restaurant_id,r.name restaurant_name
    FROM organization_users ou
    JOIN owners u ON u.id=ou.owner_id
    JOIN organizations o ON o.id=ou.organization_id
    JOIN restaurants r ON r.organization_id=o.id
    WHERE u.id=?
      AND (? IS NULL OR o.id=?)
      AND (? IS NULL OR r.id=?)
      AND (ou.role <> 'branch_manager' OR EXISTS (
        SELECT 1 FROM branches b
        WHERE b.id=ou.branch_id AND b.organization_id=o.id AND b.restaurant_id=r.id
      ))
    ORDER BY ou.id
    LIMIT 1
  `
    )
    .get(ownerId, organizationId || null, organizationId || null, restaurantId || null, restaurantId || null);
  return membership || null;
}

export function createAuthSession(sessionId, context, issuedAt, expiresAt) {
  return db.transaction(() => {
    db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?").run(issuedAt);
    db.prepare(
      `INSERT INTO auth_sessions(id,membership_id,owner_id,organization_id,restaurant_id,issued_at,expires_at)
       VALUES (?,?,?,?,?,?,?)`
    ).run(
      sessionId,
      context.membership_id,
      context.owner_id,
      context.organization_id,
      context.restaurant_id,
      issuedAt,
      expiresAt
    );
  })();
}

export function findActiveAuthSession(token, now) {
  return db
    .prepare(
      `SELECT membership_id FROM auth_sessions
       WHERE id=? AND owner_id=? AND organization_id=? AND restaurant_id=?
         AND revoked_at IS NULL AND expires_at>?`
    )
    .get(token.jti, token.ownerId, token.organizationId, token.restaurantId, now);
}

export function revokeAuthSession(sessionId) {
  db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL").run(
    Math.floor(Date.now() / 1000),
    sessionId
  );
}

export function findOwnerByEmail(email) {
  return db.prepare("SELECT * FROM owners WHERE lower(email)=lower(?)").get(email);
}

export function isEmailRegistered(email) {
  return Boolean(db.prepare("SELECT id FROM owners WHERE lower(email)=lower(?)").get(email));
}

export function createRegistration(parsed, passwordHash) {
  return db.transaction(() => {
    const ownerId = Number(
      db
        .prepare("INSERT INTO owners(email,password_hash,name) VALUES (?,?,?)")
        .run(parsed.email, passwordHash, parsed.name).lastInsertRowid
    );
    const organizationId = Number(
      db
        .prepare("INSERT INTO organizations(name,currency,timezone,language) VALUES (?,?,?,?)")
        .run(parsed.organizationName, parsed.currency.toUpperCase(), parsed.timezone, parsed.language).lastInsertRowid
    );
    const restaurantId = Number(
      db
        .prepare(
          "INSERT INTO restaurants(name,owner_id,organization_id,currency,timezone,language,business_type) VALUES (?,?,?,?,?,?,?)"
        )
        .run(
          parsed.restaurantName,
          ownerId,
          organizationId,
          parsed.currency.toUpperCase(),
          parsed.timezone,
          parsed.language,
          "yemeni"
        ).lastInsertRowid
    );
    db.prepare(
      "INSERT INTO branches(organization_id,restaurant_id,name,code,city,operating_day_start,operating_day_end) VALUES (?,?,?,?,?,?,?)"
    ).run(
      organizationId,
      restaurantId,
      parsed.branchName,
      parsed.branchCode,
      parsed.city,
      parsed.operatingDayStart,
      parsed.operatingDayEnd
    );
    db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)").run(
      organizationId,
      ownerId,
      "owner",
      null
    );
    return getAuthContext(ownerId, organizationId, restaurantId);
  })();
}
