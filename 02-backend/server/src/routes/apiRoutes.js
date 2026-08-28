import express, { Router } from "express";
import * as controller from "../controllers/apiController.js";
import { auth, requireOwner, requireRole } from "../middleware/auth.js";
import { authRateLimit, importActionRateLimit, importPreviewRateLimit } from "../middleware/security.js";
import { config } from "../config/appConfig.js";
import { notFound } from "../errors/appError.js";

const router = Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
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
router.post("/auth/login", authRateLimit, asyncHandler(controller.login));
router.post("/auth/logout", auth, controller.logout);
router.get("/auth/me", auth, controller.me);
router.post("/auth/switch-restaurant", auth, asyncHandler(controller.switchRestaurant));

router.post("/organizations", auth, requireRole("owner"), asyncHandler(controller.createOrganization));
router.get("/organizations/current", auth, controller.currentOrganization);
router.post("/restaurants", auth, requireRole("owner"), asyncHandler(controller.createRestaurant));
router.get("/restaurants", auth, controller.listRestaurants);
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
router.get("/menu/costs", auth, asyncHandler(controller.getMenuCosts));
router.get("/menu/margins", auth, asyncHandler(controller.getMenuMargins));

router.get("/knowledge/status", auth, controller.knowledgeStatus);
router.post("/knowledge/import", auth, requireOwner, asyncHandler(controller.importKnowledge));
router.get("/knowledge/search", auth, asyncHandler(controller.searchKnowledge));

router.get("/chat/sessions", auth, controller.listChatSessions);
router.get("/chat/sessions/:id/messages", auth, asyncHandler(controller.getChatMessages));
router.post("/chat", auth, asyncHandler(controller.sendChatMessage));
router.post("/actions/:hash/confirm", auth, requireOwner, asyncHandler(controller.confirmAction));
router.post("/actions/:hash/cancel", auth, requireOwner, asyncHandler(controller.cancelAction));
router.post("/feedback", auth, asyncHandler(controller.saveFeedback));
router.get("/training/export", auth, controller.exportTraining);

// JSON 404 for any unmatched /api route so the frontend error contract
// ({error, code}) holds instead of Express default HTML (M2).
router.use((req, _res, next) => {
  next(notFound(`API route not found: ${req.method} ${req.path}`));
});

export { router as apiRoutes };
