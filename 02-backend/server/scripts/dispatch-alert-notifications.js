// Schedule with the deployment's job runner. Configuration and opt-ins are required.
import { db } from "../src/db.js";
import { getAuthContext } from "../src/repositories/authRepository.js";
import { queueNotifications, dispatchNotifications } from "../src/services/alertNotificationService.js";
const preferences = db
  .prepare("SELECT organization_id,owner_id FROM alert_preferences ORDER BY organization_id,owner_id")
  .all();
for (const item of preferences) {
  const member = db
    .prepare("SELECT 1 FROM organization_users WHERE organization_id=? AND owner_id=?")
    .get(item.organization_id, item.owner_id);
  if (!member) continue;
  const restaurants = db
    .prepare(
      "SELECT r.id FROM restaurants r JOIN organization_users u ON u.organization_id=r.organization_id LEFT JOIN branches b ON b.id=u.branch_id WHERE u.organization_id=? AND u.owner_id=? AND (u.role!='branch_manager' OR b.restaurant_id=r.id)"
    )
    .all(item.organization_id, item.owner_id);
  for (const restaurant of restaurants) {
    const user = getAuthContext(item.owner_id, item.organization_id, restaurant.id);
    if (user) queueNotifications(user);
  }
}
for (const id of new Set(preferences.map((item) => item.organization_id))) {
  console.log(JSON.stringify({ organizationId: id, ...(await dispatchNotifications(id)) }));
}
