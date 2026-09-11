import { refreshAlerts } from "./alertCenterService.js";
// Import has already committed. An optional derived evaluation must never report the import as failed.
export function afterConfirmedImport(user, result) {
  try {
    const evaluation = refreshAlerts(user, { scope: "restaurant", restaurantId: user.restaurant_id });
    return { ...result, alertEvaluation: { status: "updated", created: evaluation.created } };
  } catch {
    return { ...result, alertEvaluation: { status: "failed", retryPath: "/alerts/refresh" } };
  }
}
