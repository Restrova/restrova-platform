import { db } from "../db.js";

export function findOwnerIdentityByEmail(email) {
  return db.prepare("SELECT id,email,name FROM owners WHERE lower(email)=lower(?)").get(email);
}

export function createOwnerIdentity(email, passwordHash, name) {
  const id = Number(db.prepare("INSERT INTO owners(email,password_hash,name) VALUES (?,?,?)").run(email, passwordHash, name).lastInsertRowid);
  return db.prepare("SELECT id,email,name FROM owners WHERE id=?").get(id);
}

export function upsertOrganizationUser(organizationId, ownerId, role, branchId) {
  db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?) ON CONFLICT(organization_id,owner_id) DO UPDATE SET role=excluded.role,branch_id=excluded.branch_id")
    .run(organizationId, ownerId, role, branchId || null);
}

export function listUsers(organizationId) {
  return db.prepare(`
    SELECT u.id,u.email,u.name,ou.role,ou.branch_id,b.name branch_name
    FROM organization_users ou
    JOIN owners u ON u.id=ou.owner_id
    LEFT JOIN branches b ON b.id=ou.branch_id
    WHERE ou.organization_id=?
    ORDER BY ou.role,u.email
  `).all(organizationId);
}

export function findMembership(organizationId, ownerId) {
  return db.prepare("SELECT id FROM organization_users WHERE organization_id=? AND owner_id=?").get(organizationId, ownerId);
}

export function updateMembershipRole(membershipId, role, branchId) {
  db.prepare("UPDATE organization_users SET role=?,branch_id=? WHERE id=?").run(role, role === "branch_manager" ? branchId : null, membershipId);
}
