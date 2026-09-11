import { db } from "../db.js";
export function recordDataRevision(user) {
  db.prepare(
    "INSERT INTO data_revisions(organization_id,restaurant_id,revision) VALUES (?,?,1) ON CONFLICT(organization_id,restaurant_id) DO UPDATE SET revision=revision+1,updated_at=CURRENT_TIMESTAMP"
  ).run(user.organization_id, user.restaurant_id);
  return getDataRevision(user);
}
export function getDataRevision(user) {
  const row = db
    .prepare("SELECT revision,updated_at FROM data_revisions WHERE organization_id=? AND restaurant_id=?")
    .get(user.organization_id, user.restaurant_id);
  return {
    revision: row?.revision || 0,
    updatedAt: row?.updated_at || null,
    restaurantId: user.restaurant_id,
    organizationId: user.organization_id
  };
}
