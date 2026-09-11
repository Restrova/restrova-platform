import { getAnomalies, severityFor } from "../services/anomalyService.js";
import { getForecast } from "../services/forecastService.js";
import {
  getPreferences,
  savePreferences,
  refreshAlerts,
  listAlerts,
  getAlertHistory,
  updateAlert
} from "../services/alertCenterService.js";
import { deliveryStatus, queueNotifications } from "../services/alertNotificationService.js";
const send = (res, data) => res.set("Cache-Control", "no-store").json(data);
export const anomalies = (req, res) => {
  const result = getAnomalies(req.user, req.query);
  send(res, {
    ...result,
    evaluations: result.evaluations.map((item) => ({ ...item, ...severityFor(item) })),
    alerts: result.alerts.map((item) => ({ ...item, ...severityFor(item) }))
  });
};
export const forecast = (req, res) => send(res, getForecast(req.user, req.query));
export const alertPreferences = (req, res) => send(res, getPreferences(req.user));
export const putAlertPreferences = (req, res) => send(res, savePreferences(req.user, req.body));
export const alertRefresh = (req, res) => send(res, refreshAlerts(req.user, req.body));
export const alertList = (req, res) => send(res, listAlerts(req.user, req.query));
export const alertHistory = (req, res) => send(res, getAlertHistory(req.user, req.params.id));
export const patchAlert = (req, res) => send(res, updateAlert(req.user, req.params.id, req.body));
export const alertDeliveryStatus = (req, res) => send(res, deliveryStatus(req.user));
export const queueAlertNotifications = (req, res) => send(res, queueNotifications(req.user));
