import { z } from "zod";
import { validate } from "../validation/schemas.js";
import { validationError } from "../errors/appError.js";
import {
  buildCopilotAnalysis,
  copilotScopeSchema,
  resolveCopilotContext,
  executeCopilotTool
} from "./copilotService.js";
import { localDate, dayOffset } from "./historicalSeriesService.js";
import crypto from "node:crypto";

const querySchema = copilotScopeSchema
  .extend({ cadence: z.enum(["daily", "weekly", "monthly"]).default("daily") })
  .strict();
const priorities = {
  review_high_refunds: 0,
  review_abnormal_discounts: 1,
  reduce_ingredient_cost: 2,
  raise_price: 3,
  review_rising_costs: 4,
  review_falling_sales: 5,
  review_supplier_quote: 6,
  consider_removal: 7,
  change_portion: 8,
  review_underperformance: 9,
  promote_item: 10,
  bundle_item: 11,
  test_targeted_offer: 12
};
export function reportPeriod(user, query) {
  const { cadence, ...scope } = validate(querySchema, query);
  if (Boolean(scope.fromDate) !== Boolean(scope.toDate)) throw validationError("Supply both report dates.");
  if (!scope.fromDate) {
    const today = localDate(new Date().toISOString(), user.timezone);
    scope.toDate = dayOffset(today, -1);
    scope.fromDate =
      cadence === "weekly"
        ? dayOffset(today, -7)
        : cadence === "monthly"
          ? dayOffset(`${today.slice(0, 7)}-01`, -1).slice(0, 7) + "-01"
          : scope.toDate;
    if (cadence === "monthly") scope.toDate = dayOffset(`${today.slice(0, 7)}-01`, -1);
  }
  return { cadence, scope };
}
export function rankReportActions(groups) {
  const seen = new Set();
  return groups
    .flatMap((g) => g.recommendations)
    .filter((r) => {
      const identity = `${r.branchId}:${r.item?.id || "branch"}:${r.recommendedAction}`;
      if (seen.has(identity) || r.confidence?.level === "low" || !r.lineage || !Object.keys(r.lineage).length)
        return false;
      seen.add(identity);
      return true;
    })
    .sort(
      (a, b) =>
        (priorities[a.recommendedAction] ?? 99) - (priorities[b.recommendedAction] ?? 99) ||
        a.branchId - b.branchId ||
        String(a.key).localeCompare(String(b.key))
    )
    .slice(0, 3);
}
export function getExecutiveReport(user, query) {
  const { cadence, scope } = reportPeriod(user, query),
    report = buildCopilotAnalysis(user, scope, "summary"),
    context = resolveCopilotContext(user, scope);
  // A fixed documented priority policy; incomparable unit costs and total profits are never ranked as projected savings.
  const actionsAvailable = context.branches.length <= 20;
  const groups = actionsAvailable ? executeCopilotTool(user, context, "recommendations") : [];
  const sourceId = `e${report.sources.length + 1}`,
    data = { groups, rankingVersion: "operational-priority-v1" };
  report.sources.push({
    id: sourceId,
    tool: "recommendations",
    version: "operational-priority-v1",
    digest: crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex"),
    url: "/app/recommendations",
    scope: report.scope,
    period: report.period,
    data
  });
  const topActions = rankReportActions(groups).map((r) => ({
    ...r,
    branchName: context.branches.find((b) => b.id === r.branchId)?.name || null,
    sourceIds: [sourceId],
    expectedSavingsMinor: null
  }));
  const trend = [];
  if (cadence !== "daily") {
    for (let date = scope.fromDate; date <= scope.toDate; date = dayOffset(date, 1)) {
      const day = buildCopilotAnalysis(user, { ...scope, fromDate: date, toDate: date }, "profit");
      const evidenceId = `e${report.sources.length + 1}`;
      report.sources.push({
        id: evidenceId,
        tool: "daily_financial",
        version: day.version,
        digest: crypto.createHash("sha256").update(JSON.stringify(day.sources)).digest("hex"),
        url: "/app/dashboard",
        scope: day.scope,
        period: day.period,
        data: day.sources
      });
      trend.push({
        date,
        revenueMinor: day.claims.find((c) => c.key === "revenue").value,
        profitMinor: day.claims.find((c) => c.key === "profit").value,
        sourceIds: [evidenceId]
      });
    }
  }
  return {
    ...report,
    reportVersion: "10.6-v1",
    cadence,
    topActions,
    actionsStatus: actionsAvailable ? "evaluated" : "select_branch",
    rankingPolicy: "operational-priority-v1",
    trend
  };
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function executiveCsv(report) {
  const rows = [
    [
      "section",
      "key",
      "label",
      "value",
      "unit",
      "status",
      "source_ids",
      "from_date",
      "to_date",
      "currency",
      "import_revision"
    ],
    ...report.claims.map((c) => [
      "metric",
      c.key,
      c.label,
      c.value,
      c.unit === "money" ? "money_minor" : c.unit,
      c.status,
      c.sourceIds.join(" "),
      report.period.fromDate,
      report.period.toDate,
      report.currencyCode,
      report.dataRevision.revision
    ]),
    ...report.trend.flatMap((d) =>
      ["revenueMinor", "profitMinor"].map((key) => [
        "trend",
        key,
        d.date,
        d[key],
        "money_minor",
        d[key] == null ? "insufficient_data" : "supported",
        d.sourceIds.join(" "),
        d.date,
        d.date,
        report.currencyCode,
        report.dataRevision.revision
      ])
    ),
    ...report.topActions.map((a) => [
      "action",
      a.key,
      a.recommendedAction,
      a.item?.name || "",
      "",
      a.confidence?.level,
      a.sourceIds.join(" "),
      report.period.fromDate,
      report.period.toDate,
      report.currencyCode,
      report.dataRevision.revision
    ])
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
