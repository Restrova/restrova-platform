import express, { Router } from "express";
import * as controller from "../controllers/apiController.js";
import { auth, requireOwner, requireRole, requireManagerWrite } from "../middleware/auth.js";
import { authRateLimit, importActionRateLimit, importPreviewRateLimit } from "../middleware/security.js";
import { config } from "../config/appConfig.js";

import * as decisions from "../controllers/decisionController.js";
const router = Router();
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve()
    .then(() => handler(req, res, next))
    .catch(next);
router.get("/data/revision", auth, asyncHandler(decisions.dataRevision));
router.get("/decisions", auth, asyncHandler(decisions.decisionList));
router.post("/decisions/scenario", auth, requireManagerWrite, asyncHandler(decisions.decisionScenario));
router.get("/decisions/actions", auth, asyncHandler(decisions.decisionActions));
router.post("/decisions/actions", auth, requireManagerWrite, asyncHandler(decisions.decisionRecord));
router.patch("/decisions/actions/:id", auth, requireManagerWrite, asyncHandler(decisions.decisionTransition));
router.post("/forecasts/snapshots", auth, requireManagerWrite, asyncHandler(decisions.forecastSave));
router.get("/forecasts/accuracy", auth, asyncHandler(decisions.forecastScores));
router.get("/seasons", auth, asyncHandler(decisions.seasonList));
router.post("/seasons", auth, requireManagerWrite, asyncHandler(decisions.seasonCreate));

const stagedImportBody = express.raw({
  limit: config.imports.maxFileSizeBytes,
  type: [
    "text/csv",
    "application/csv",
    "text/plain",
    "application/octet-stream",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]
});

router.get("/health", controller.health);
router.get("/ready", controller.ready);

router.post("/auth/register", authRateLimit, asyncHandler(controller.register));
router.post("/auth/email-availability", authRateLimit, asyncHandler(controller.checkEmailAvailability));
router.post("/auth/login", authRateLimit, asyncHandler(controller.login));
router.post("/auth/logout", controller.logout);
router.get("/auth/me", auth, controller.me);

router.post("/organizations", auth, requireRole("owner"), asyncHandler(controller.createOrganization));
router.get("/organizations/current", auth, controller.currentOrganization);
router.post("/restaurants", auth, requireRole("owner"), asyncHandler(controller.createRestaurant));
router.get("/restaurants/current", auth, controller.currentRestaurant);

router.post("/branches", auth, requireRole("owner"), asyncHandler(controller.createBranch));
router.get("/branches", auth, controller.listBranches);
router.patch("/branches/:id", auth, requireRole("owner"), asyncHandler(controller.updateBranch));

router.post("/users/invite", auth, requireRole("owner"), asyncHandler(controller.inviteUser));
router.get("/users", auth, requireRole("owner"), controller.listUsers);
router.patch("/users/:id/role", auth, requireRole("owner"), asyncHandler(controller.updateUserRole));

router.get("/dashboard", auth, controller.dashboard);
router.get("/data/status", auth, controller.dataStatus);
router.get("/data/templates", auth, controller.listImportTemplates);
router.get("/data/templates/:key", auth, asyncHandler(controller.getImportTemplate));
router.get("/data/templates/:key/download", auth, asyncHandler(controller.downloadImportTemplate));
router.post("/data/import/preview", auth, requireOwner, asyncHandler(controller.previewImport));
router.post("/data/import", auth, requireOwner, asyncHandler(controller.confirmImport));

router.post(
  "/data/import-jobs/preview",
  auth,
  requireOwner,
  importPreviewRateLimit,
  stagedImportBody,
  asyncHandler(controller.previewStagedImport)
);
router.get("/data/import-jobs", auth, requireOwner, asyncHandler(controller.listStagedImportJobs));
router.get("/data/import-jobs/metrics", auth, requireOwner, asyncHandler(controller.getStagedImportMetrics));
router.get("/data/import-jobs/:id", auth, requireOwner, asyncHandler(controller.getStagedImportJob));
router.put(
  "/data/import-jobs/:id/mapping",
  auth,
  requireOwner,
  importActionRateLimit,
  asyncHandler(controller.updateStagedImportMapping)
);
router.post(
  "/data/import-jobs/:id/confirm",
  auth,
  requireOwner,
  importActionRateLimit,
  asyncHandler(controller.confirmStagedImport)
);
router.post(
  "/data/import-jobs/:id/cancel",
  auth,
  requireOwner,
  importActionRateLimit,
  asyncHandler(controller.cancelStagedImport)
);

router.get("/financial/model", auth, controller.getFinancialModel);
router.get("/financial/entries", auth, asyncHandler(controller.listFinancialEntries));
router.post("/financial/entries", auth, requireOwner, asyncHandler(controller.createFinancialEntry));
router.get("/financial/calculate", auth, asyncHandler(controller.calculateFinancialMetrics));
router.get("/financial/period", auth, asyncHandler(controller.calculateFinancialPeriod));
router.get("/financial/report", auth, asyncHandler(controller.getFinancialReport));
router.get("/financial/dashboard", auth, asyncHandler(controller.getFinancialDashboard));
router.get("/branches/performance", auth, asyncHandler(controller.getBranchPerformance));
router.get("/branches/rankings", auth, asyncHandler(controller.getBranchRankings));
router.get("/branches/operations", auth, asyncHandler(controller.getBranchOperations));
router.get("/alerts/evaluate", auth, asyncHandler(controller.getAlertRules));
router.get("/alerts/anomalies", auth, asyncHandler(controller.anomalies));
router.get("/forecasts", auth, asyncHandler(controller.forecast));
router.get("/alerts/preferences", auth, asyncHandler(controller.alertPreferences));
router.put("/alerts/preferences", auth, asyncHandler(controller.putAlertPreferences));
router.post("/alerts/refresh", auth, requireManagerWrite, asyncHandler(controller.alertRefresh));
router.get("/alerts", auth, asyncHandler(controller.alertList));
router.get("/alerts/notifications", auth, asyncHandler(controller.alertDeliveryStatus));
router.post("/alerts/notifications/queue", auth, asyncHandler(controller.queueAlertNotifications));
router.get("/alerts/:id/history", auth, asyncHandler(controller.alertHistory));
router.patch("/alerts/:id", auth, requireManagerWrite, asyncHandler(controller.patchAlert));

router.get("/menu/costs", auth, asyncHandler(controller.getMenuCosts));
router.get("/menu/margins", auth, asyncHandler(controller.getMenuMargins));
router.get("/menu/engineering-matrix", auth, asyncHandler(controller.getMenuEngineeringMatrix));
router.post("/menu/price-simulation", auth, asyncHandler(controller.simulateMenuPrice));
router.post("/menu/cost-simulation", auth, asyncHandler(controller.simulateMenuCosts));
router.get("/menu/recommendations", auth, asyncHandler(controller.getMenuRecommendations));

router.get("/knowledge/status", auth, controller.knowledgeStatus);
router.post("/knowledge/import", auth, requireOwner, asyncHandler(controller.importKnowledge));
router.get("/knowledge/search", auth, asyncHandler(controller.searchKnowledge));

router.get("/chat/sessions", auth, controller.listChatSessions);
router.get("/chat/sessions/:id/messages", auth, asyncHandler(controller.getChatMessages));
router.post("/chat", auth, asyncHandler(controller.sendChatMessage));
router.post("/actions/:hash/confirm", auth, requireOwner, asyncHandler(controller.confirmAction));
router.post("/feedback", auth, asyncHandler(controller.saveFeedback));
router.get("/training/export", auth, controller.exportTraining);

export { router as apiRoutes };
