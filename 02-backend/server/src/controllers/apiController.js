import * as authService from "../services/authService.js";
import * as branchService from "../services/branchService.js";
import * as chatService from "../services/chatService.js";
import * as dashboardService from "../services/dashboardService.js";
import * as dataService from "../services/dataService.js";
import * as knowledgeService from "../services/knowledgeService.js";
import * as organizationService from "../services/organizationService.js";
import * as userService from "../services/userService.js";
import * as healthService from "../services/healthService.js";

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
export const previewImport = (req, res) => res.json(dataService.previewImport(req.body));
export const confirmImport = (req, res) => res.status(201).json(dataService.confirmImport(req.user, req.body));

export const knowledgeStatus = (req, res) => res.json(knowledgeService.getKnowledgeStatus(req.user));
export const importKnowledge = (req, res) => res.status(201).json(knowledgeService.importKnowledge(req.user, req.body));
export const searchKnowledge = (req, res) => res.json(knowledgeService.searchKnowledge(req.user, req.query.q));

export const listChatSessions = (req, res) => res.json(chatService.listChatSessions(req.user));
export const getChatMessages = (req, res) => res.json(chatService.getChatMessages(req.user, req.params.id));
export const sendChatMessage = async (req, res) => res.json(await chatService.sendChatMessage(req.user, req.body));
export const confirmAction = (req, res) => res.json(chatService.confirmAction(req.user, req.params.hash));
export const saveFeedback = (req, res) => res.status(201).json(chatService.saveFeedback(req.user, req.body));
export const exportTraining = (req, res) => res.json(chatService.exportTrainingFeedback(req.user));
