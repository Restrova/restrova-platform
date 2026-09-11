import {
  getDecisions,
  simulateDecision,
  listDecisionActions,
  recordDecision,
  transitionDecision
} from "../services/decisionService.js";
import { saveForecastSnapshot, forecastAccuracy } from "../services/forecastAccuracyService.js";
import { seasonalEvents, createSeasonalEvent } from "../services/seasonalService.js";
import { getDataRevision } from "../services/dataRevisionService.js";
import { z } from "zod";
import { validate } from "../validation/schemas.js";
const send = (res, data) => res.set("Cache-Control", "no-store").json(data);
export const decisionList = (req, res) => send(res, getDecisions(req.user, req.query));
export const decisionScenario = (req, res) => send(res, simulateDecision(req.user, req.body));
export const decisionActions = (req, res) => send(res, listDecisionActions(req.user, req.query));
export const decisionRecord = (req, res) => send(res, recordDecision(req.user, req.body));
export const decisionTransition = (req, res) => send(res, transitionDecision(req.user, req.params.id, req.body));
export const forecastSave = (req, res) => send(res, saveForecastSnapshot(req.user, req.body));
export const forecastScores = (req, res) => send(res, forecastAccuracy(req.user, req.query));
export const seasonList = (req, res) => {
  const query = validate(z.object({ branchId: z.coerce.number().int().positive().optional() }).strict(), req.query);
  send(res, { events: seasonalEvents(req.user, query.branchId || req.user.branch_id) });
};
export const seasonCreate = (req, res) => send(res, createSeasonalEvent(req.user, req.body));
export const dataRevision = (req, res) => send(res, getDataRevision(req.user));
