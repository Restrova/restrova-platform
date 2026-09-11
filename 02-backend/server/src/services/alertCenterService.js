import { isTrustedPushEndpoint } from "./pushSubscription.js";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db.js";
import { validate, alertRulesQuerySchema } from "../validation/schemas.js";
import { forbidden, notFound, conflict } from "../errors/appError.js";
import { getFinancialReport } from "./financialReportService.js";
import { getAlertRules } from "./alertRulesService.js";
import { getAnomalies, severityFor } from "./anomalyService.js";
import { localDate, dayOffset } from "./historicalSeriesService.js";

export const alertTypes = [
  "food_cost_above_target",
  "sales_drop",
  "profit_margin_drop",
  "refund_rate_increase",
  "discount_rate_increase",
  "sales_outlier"
];
export const channels = ["email", "push", "whatsapp", "slack", "teams"];
const thresholdSchema = alertRulesQuerySchema.pick({
  foodCostTargetBps: true,
  salesDropBps: true,
  profitMarginDropBps: true,
  refundRateIncreaseBps: true,
  discountRateIncreaseBps: true
});
const preferenceSchema = z
  .object({
    types: z.array(z.enum(alertTypes)).max(6).default(alertTypes),
    branchIds: z.array(z.number().int().positive()).max(100).nullable().default(null),
    thresholds: thresholdSchema.default(() => thresholdSchema.parse({})),
    frequency: z.enum(["off", "immediate", "daily", "weekly"]).default("off"),
    channels: z.array(z.enum(channels)).max(5).default([]),
    pushSubscription: z
      .object({
        endpoint: z.string().max(4096).refine(isTrustedPushEndpoint),
        expirationTime: z.number().nullable().optional(),
        keys: z
          .object({
            p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),
            auth: z
              .string()
              .regex(/^[A-Za-z0-9_-]{22}==?$/)
              .or(z.string().regex(/^[A-Za-z0-9_-]{22}$/))
          })
          .strict()
      })
      .strict()
      .nullable()
      .default(null),
    pushToken: z.string().trim().max(4096).default(""),
    whatsappPhone: z.union([z.literal(""), z.string().regex(/^\+[1-9]\d{7,14}$/)]).default(""),
    whatsappConsent: z.boolean().default(false),
    language: z.enum(["ar", "en", "zh"]).default("ar")
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.channels.includes("whatsapp") && (!value.whatsappConsent || !value.whatsappPhone))
      ctx.addIssue({ code: "custom", message: "WhatsApp requires opt-in and a phone number." });
    if (value.channels.includes("push") && !value.pushToken && !value.pushSubscription)
      ctx.addIssue({ code: "custom", message: "Push requires a registered device token." });
  });
export function getPreferences(user) {
  const row = db
    .prepare("SELECT settings_json FROM alert_preferences WHERE organization_id=? AND owner_id=?")
    .get(user.organization_id, user.owner_id);
  return row ? JSON.parse(row.settings_json) : preferenceSchema.parse({});
}
export function savePreferences(user, body) {
  const preferences = validate(preferenceSchema, body);
  for (const id of preferences.branchIds || []) authorizedBranches(user, { scope: "branch", branchId: id });
  db.prepare(
    "INSERT INTO alert_preferences(organization_id,owner_id,settings_json) VALUES (?,?,?) ON CONFLICT(organization_id,owner_id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=CURRENT_TIMESTAMP"
  ).run(user.organization_id, user.owner_id, JSON.stringify(preferences));
  return preferences;
}
const scopeSchema = z.object({
  scope: z.enum(["organization", "restaurant", "branch"]).optional(),
  restaurantId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional()
});
export function authorizedBranches(user, query = {}) {
  const parsed = validate(scopeSchema, query);
  const report = getFinancialReport(user, { ...parsed, period: "yesterday", comparison: "none" });
  return report.restaurants.flatMap((restaurant) =>
    restaurant.branches.map((branch) => ({ id: branch.id, restaurantId: restaurant.id }))
  );
}
function assertWrite(user) {
  if (!["owner", "branch_manager"].includes(user.role)) throw forbidden("Viewer access is read-only");
}
function incident(user, id) {
  const row = db
    .prepare("SELECT * FROM alert_incidents WHERE organization_id=? AND id=?")
    .get(user.organization_id, id);
  if (!row) throw notFound();
  authorizedBranches(user, { scope: "branch", branchId: row.branch_id });
  return row;
}
function history(id, actor, action, detail) {
  db.prepare("INSERT INTO alert_history(alert_id,actor_id,action,detail_json) VALUES (?,?,?,?)").run(
    id,
    actor,
    action,
    JSON.stringify(detail)
  );
}
const refreshSchema = scopeSchema.extend({ anchor: z.iso.datetime({ offset: true }).optional() }).strict();
export function refreshAlerts(user, query) {
  assertWrite(user);
  const parsed = validate(refreshSchema, query),
    preferences = getPreferences(user);
  const anchor = parsed.anchor || new Date().toISOString(),
    today = localDate(anchor, user.timezone);
  const ruleResult = getAlertRules(user, {
    ...parsed,
    ...preferences.thresholds,
    anchor,
    period: "custom",
    fromDate: dayOffset(today, -7),
    toDate: dayOffset(today, -1),
    comparison: "previous_period",
    language: preferences.language
  });
  const anomalyResult = getAnomalies(user, { ...parsed, anchor, historyDays: 57, language: preferences.language });
  const evaluations = [...ruleResult.evaluations, ...anomalyResult.evaluations].map((item) => ({
    ...item,
    ...severityFor(item)
  }));
  const signature = crypto
    .createHash("sha256")
    .update(JSON.stringify(preferences.thresholds))
    .digest("hex")
    .slice(0, 16);
  const periodKey = `${today}:${signature}`;
  let created = 0;
  db.transaction(() => {
    for (const item of evaluations) {
      if (
        item.status !== "triggered" ||
        !preferences.types.includes(item.type) ||
        (preferences.branchIds && !preferences.branchIds.includes(item.branchId))
      )
        continue;
      const prior = db
        .prepare(
          "SELECT COUNT(DISTINCT substr(period_key,1,10)) AS count FROM alert_incidents WHERE organization_id=? AND branch_id=? AND rule_type=? AND period_key<?"
        )
        .get(user.organization_id, item.branchId, item.type, today).count;
      const insert = db
        .prepare(
          "INSERT OR IGNORE INTO alert_incidents(organization_id,restaurant_id,branch_id,rule_type,period_key,snapshot_json,recurrence_count) VALUES (?,?,?,?,?,?,?)"
        )
        .run(
          user.organization_id,
          item.restaurantId,
          item.branchId,
          item.type,
          periodKey,
          JSON.stringify({ ...item, currencyCode: ruleResult.currencyCode, evaluatedAt: anchor }),
          prior
        );
      if (insert.changes) {
        created++;
        history(Number(insert.lastInsertRowid), user.owner_id, "created", { severity: item.severity, periodKey });
      }
    }
  })();
  return { created, evaluations, rulesPolicy: ruleResult.policy, anomalyPolicy: anomalyResult.policy };
}
export function listAlerts(user, query) {
  const parsed = validate(
    scopeSchema
      .extend({
        status: z.enum(["open", "resolved", "all"]).default("open"),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        before: z.coerce.number().int().positive().optional()
      })
      .strict(),
    query
  );
  const ids = authorizedBranches(user, parsed).map((branch) => branch.id);
  if (!ids.length) return { items: [], nextBefore: null };
  const rows = db
    .prepare(
      `SELECT * FROM alert_incidents WHERE organization_id=? AND branch_id IN (${ids.map(() => "?").join(",")}) AND (?='all' OR status=?) AND id<? ORDER BY id DESC LIMIT ?`
    )
    .all(
      user.organization_id,
      ...ids,
      parsed.status,
      parsed.status,
      parsed.before || Number.MAX_SAFE_INTEGER,
      parsed.limit + 1
    );
  return {
    items: rows.slice(0, parsed.limit).map((row) => ({
      id: row.id,
      branchId: row.branch_id,
      status: row.status,
      assignedTo: row.assigned_to,
      recurrenceCount: row.recurrence_count,
      version: row.version,
      createdAt: row.created_at,
      snapshot: JSON.parse(row.snapshot_json)
    })),
    nextBefore: rows.length > parsed.limit ? rows[parsed.limit - 1].id : null
  };
}
export function getAlertHistory(user, id) {
  const row = incident(user, id);
  const events = db
    .prepare(
      "SELECT id,actor_id,action,detail_json,created_at FROM alert_history WHERE alert_id=? ORDER BY id DESC LIMIT 200"
    )
    .all(row.id);
  const assignees = db
    .prepare(
      "SELECT o.id,o.name FROM owners o JOIN organization_users u ON u.owner_id=o.id WHERE u.organization_id=? AND (u.role='owner' OR (u.role='branch_manager' AND u.branch_id=?)) ORDER BY o.name,o.id"
    )
    .all(user.organization_id, row.branch_id);
  return {
    version: row.version,
    assignees,
    events: events.map((event) => ({ ...event, detail: JSON.parse(event.detail_json), detail_json: undefined }))
  };
}
export function updateAlert(user, id, body) {
  assertWrite(user);
  const parsed = validate(
    z
      .object({
        version: z.number().int().positive(),
        action: z.enum(["resolve", "reopen", "assign", "comment"]),
        assignedTo: z.number().int().positive().nullable().optional(),
        comment: z.string().trim().min(1).max(2000).optional()
      })
      .strict(),
    body
  );
  return db.transaction(() => {
    const row = incident(user, id);
    if (row.version !== parsed.version) throw conflict("Alert changed. Reload before saving.");
    if (parsed.action === "assign" && parsed.assignedTo !== null) {
      const member = db
        .prepare("SELECT role,branch_id FROM organization_users WHERE organization_id=? AND owner_id=?")
        .get(user.organization_id, parsed.assignedTo ?? -1);
      if (
        !member ||
        member.role === "viewer" ||
        (member.role === "branch_manager" && member.branch_id !== row.branch_id)
      )
        throw notFound("Eligible assignee not found");
    }
    if (parsed.action === "comment" && !parsed.comment) throw conflict("A comment is required.");
    const status = parsed.action === "resolve" ? "resolved" : parsed.action === "reopen" ? "open" : row.status;
    db.prepare(
      "UPDATE alert_incidents SET status=?,assigned_to=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(status, parsed.action === "assign" ? parsed.assignedTo : row.assigned_to, row.id);
    history(row.id, user.owner_id, parsed.action, {
      previousStatus: row.status,
      status,
      assignedTo: parsed.action === "assign" ? parsed.assignedTo : row.assigned_to,
      comment: parsed.comment || null
    });
    return { updated: true, version: row.version + 1 };
  })();
}
