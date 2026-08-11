import { Router } from "express";
import * as controller from "../controllers/apiController.js";
import { auth, requireOwner, requireRole } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/security.js";

const router = Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.get("/health", controller.health);
router.get("/ready", controller.ready);

router.post("/auth/register", authRateLimit, asyncHandler(controller.register));
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
