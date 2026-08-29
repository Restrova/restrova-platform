import * as authService from "../services/authService.js";
import * as branchService from "../services/branchService.js";
import * as chatService from "../services/chatService.js";
import * as dashboardService from "../services/dashboardService.js";
import * as dataService from "../services/dataService.js";
import * as knowledgeService from "../services/knowledgeService.js";
import * as organizationService from "../services/organizationService.js";
import * as userService from "../services/userService.js";
import * as healthService from "../services/healthService.js";
import * as importTemplateService from "../services/importTemplateService.js";
import * as stagedImportService from "../services/stagedImportService.js";
import * as financialService from "../services/financialService.js";
import * as financialPeriodService from "../services/financialPeriodService.js";
import * as financialReportService from "../services/financialReportService.js";
import * as financialDashboardService from "../services/financialDashboardService.js";
import * as menuCostService from "../services/menuCostService.js";
import * as menuMarginService from "../services/menuMarginService.js";
import * as menuEngineeringService from "../services/menuEngineeringService.js";
import * as priceSimulationService from "../services/priceSimulationService.js";
import * as costSimulationService from "../services/costSimulationService.js";
import * as menuRecommendationService from "../services/menuRecommendationService.js";

export const health = (_req, res) => res.json(healthService.getHealth());
export const ready = (_req, res) => res.json(healthService.getReadiness());

export const register = (req, res) => res.status(201).json(authService.register(req.body));
export const login = (req, res) => res.json(authService.login(req.body));
export const logout = (_req, res) => res.json({ ok: true });
export const me = (req, res) => res.json(authService.serializeMe(req.user));

export const createOrganization = (req, res) =>
  res.status(201).json(organizationService.createOrganization(req.user, req.body));
export const currentOrganization = (req, res) => res.json(organizationService.currentOrganization(req.user));
export const createRestaurant = (req, res) =>
  res.status(201).json(organizationService.createRestaurant(req.user, req.body));
export const currentRestaurant = (req, res) => res.json(organizationService.currentRestaurant(req.user));

export const createBranch = (req, res) => res.status(201).json(branchService.createBranch(req.user, req.body));
export const listBranches = (req, res) => res.json(branchService.listBranches(req.user));
export const updateBranch = (req, res) =>
  res.json(branchService.updateBranch(req.user, Number(req.params.id), req.body));

export const inviteUser = (req, res) => res.status(201).json(userService.inviteUser(req.user, req.body));
export const listUsers = (req, res) => res.json(userService.listUsers(req.user));
export const updateUserRole = (req, res) =>
  res.json(userService.updateUserRole(req.user, Number(req.params.id), req.body));

export const dashboard = (req, res) => res.json(dashboardService.getDashboard(req.user));
export const dataStatus = (req, res) => res.json(dataService.getDataStatus(req.user));
export const listImportTemplates = (_req, res) => res.json(importTemplateService.listImportTemplates());
export const getImportTemplate = (req, res) => res.json(importTemplateService.getImportTemplate(req.params.key));
export const downloadImportTemplate = (req, res) => {
  const file = importTemplateService.buildImportTemplateCsv(req.params.key);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  return res.send(file.body);
};
export const previewImport = (req, res) => res.json(dataService.previewImport(req.body));
export const confirmImport = (req, res) => res.status(201).json(dataService.confirmImport(req.user, req.body));

export const previewStagedImport = (req, res) =>
  res.status(201).json(
    stagedImportService.previewStagedImport(req.user, {
      templateKey: req.query.templateKey,
      filename: req.query.filename,
      contentType: req.headers["content-type"],
      buffer: req.body,
      requestId: req.requestId
    })
  );
export const listStagedImportJobs = (req, res) =>
  res.json(stagedImportService.listStagedImportJobs(req.user, req.query));
export const getStagedImportMetrics = (req, res) => res.json(stagedImportService.getStagedImportMetrics(req.user));
export const getStagedImportJob = (req, res) =>
  res.json(stagedImportService.getStagedImportJob(req.user, req.params.id));
export const updateStagedImportMapping = (req, res) =>
  res.json(stagedImportService.updateStagedImportMapping(req.user, req.params.id, req.body?.mappings, req.requestId));
export const confirmStagedImport = (req, res) =>
  res.json(
    stagedImportService.confirmStagedImport(req.user, req.params.id, req.body?.confirmationToken, req.requestId)
  );
export const cancelStagedImport = (req, res) =>
  res.json(stagedImportService.cancelStagedImport(req.user, req.params.id, req.requestId));

export const getFinancialModel = (_req, res) => res.json(financialService.getFinancialModel());
export const createFinancialEntry = (req, res) =>
  res.status(201).json(financialService.createFinancialEntry(req.user, req.body));
export const listFinancialEntries = (req, res) => res.json(financialService.listFinancialEntries(req.user, req.query));
export const calculateFinancialMetrics = (req, res) =>
  res.json(financialService.calculateFinancialMetrics(req.user, req.query));
export const calculateFinancialPeriod = (req, res) =>
  res.json(financialPeriodService.calculateFinancialPeriod(req.user, req.query));
export const getFinancialReport = (req, res) =>
  res.json(financialReportService.getFinancialReport(req.user, req.query));
export const getFinancialDashboard = (req, res) =>
  res.json(financialDashboardService.getFinancialDashboard(req.user, req.query));
export const getMenuCosts = (req, res) => res.json(menuCostService.getMenuCosts(req.user, req.query));
export const getMenuMargins = (req, res) => res.json(menuMarginService.getMenuMargins(req.user, req.query));
export const getMenuEngineeringMatrix = (req, res) =>
  res.json(menuEngineeringService.getMenuEngineeringMatrix(req.user, req.query));
export const simulateMenuPrice = (req, res) => res.json(priceSimulationService.simulatePrice(req.user, req.body));
export const simulateMenuCosts = (req, res) => res.json(costSimulationService.simulateCosts(req.user, req.body));
export const getMenuRecommendations = (req, res) =>
  res.json(menuRecommendationService.getMenuRecommendations(req.user, req.query));

export const knowledgeStatus = (req, res) => res.json(knowledgeService.getKnowledgeStatus(req.user));
export const importKnowledge = (req, res) => res.status(201).json(knowledgeService.importKnowledge(req.user, req.body));
export const searchKnowledge = (req, res) => res.json(knowledgeService.searchKnowledge(req.user, req.query.q));

export const listChatSessions = (req, res) => res.json(chatService.listChatSessions(req.user));
export const getChatMessages = (req, res) => res.json(chatService.getChatMessages(req.user, req.params.id));
export const sendChatMessage = async (req, res) => res.json(await chatService.sendChatMessage(req.user, req.body));
export const confirmAction = (req, res) => res.json(chatService.confirmAction(req.user, req.params.hash));
export const saveFeedback = (req, res) => res.status(201).json(chatService.saveFeedback(req.user, req.body));
export const exportTraining = (req, res) => res.json(chatService.exportTrainingFeedback(req.user));
