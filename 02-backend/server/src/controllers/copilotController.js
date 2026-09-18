import { getExecutiveReport, executiveCsv } from "../services/executiveReportService.js";
import {
  askCopilot,
  buildCopilotAnalysis,
  resolveCopilotContext,
  listCopilotThreads,
  getCopilotThread,
  getCopilotEvidence
} from "../services/copilotService.js";
const send = (res, data) => res.set("Cache-Control", "no-store").json(data);
export const ask = (req, res) => send(res, askCopilot(req.user, req.body));
export const context = (req, res) => {
  const { financial, filters, ...data } = resolveCopilotContext(req.user, req.query);
  send(res, { ...data, coverage: financial.financials.current.completeness });
};
export const threads = (req, res) => send(res, listCopilotThreads(req.user));
export const thread = (req, res) => send(res, getCopilotThread(req.user, req.params.id));
export const evidence = (req, res) =>
  send(res, getCopilotEvidence(req.user, req.params.id, req.params.turnId, req.params.sourceId));
export const report = (req, res) => send(res, buildCopilotAnalysis(req.user, req.query, "summary"));

export const executive = (req, res) => send(res, getExecutiveReport(req.user, req.query));
export const exportCsv = (req, res) => {
  const report = getExecutiveReport(req.user, req.query);
  res
    .set("Cache-Control", "no-store")
    .set("Content-Disposition", `attachment; filename="restrova-${report.cadence}-${report.period.fromDate}.csv"`)
    .type("text/csv; charset=utf-8")
    .send(executiveCsv(report));
};
