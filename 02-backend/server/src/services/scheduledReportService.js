import { logInfo } from "../observability/logger.js";
import { z } from "zod";
import { db } from "../db.js";
import { getAuthContext } from "../repositories/authRepository.js";
import { forbidden, notFound, validationError } from "../errors/appError.js";
import { validate } from "../validation/schemas.js";
import { resolveCopilotContext } from "./copilotService.js";
import { getExecutiveReport } from "./executiveReportService.js";

const schema = z
  .object({
    cadence: z.enum(["daily", "weekly", "monthly"]),
    language: z.enum(["ar", "en", "zh"]),
    hour: z.number().int().min(0).max(23),
    branchId: z.number().int().positive().optional()
  })
  .strict();
function owner(user) {
  const membership = db
    .prepare("SELECT role FROM organization_users WHERE organization_id=? AND owner_id=?")
    .get(user.organization_id, user.owner_id);
  if (user.role !== "owner" || membership?.role !== "owner")
    throw forbidden("Only current owners can schedule reports.");
}
function schedule(user, id) {
  owner(user);
  const row = db
    .prepare("SELECT * FROM report_schedules WHERE id=? AND organization_id=? AND restaurant_id=? AND created_by=?")
    .get(id, user.organization_id, user.restaurant_id, user.owner_id);
  if (!row) throw notFound("Report schedule not found");
  return row;
}
function visible(row) {
  return {
    id: row.id,
    cadence: row.cadence,
    language: row.language,
    hour: row.hour,
    timezone: row.timezone,
    branchId: row.branch_id,
    enabled: Boolean(row.enabled),
    nextRunAt: row.enabled ? row.next_run_at : null,
    retryAt: row.retry_at,
    delivery: "in_app"
  };
}
// Match wall time rather than a fixed offset, including quarter-hour zones and DST.
export function nextReportRun(cadence, hour, timezone, after = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "numeric",
    minute: "numeric",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short"
  });
  const partsOf = (date) => Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const initial = partsOf(after);
  const dateKey = (p) => `${p.year}-${p.month}-${p.day}`;
  const start = Math.floor(after.getTime() / 900000) * 900000;
  for (let n = 1; n <= 96 * 35; n++) {
    const date = new Date(start + n * 900000),
      parts = partsOf(date);
    // Do not send twice when the requested hour repeats at the end of DST.
    if (dateKey(parts) === dateKey(initial) && Number(initial.hour) >= hour) continue;
    if (
      Number(parts.hour) === hour &&
      Number(parts.minute) === 0 &&
      (cadence !== "weekly" || parts.weekday === "Mon") &&
      (cadence !== "monthly" || parts.day === "1")
    )
      return date.toISOString();
  }
  throw validationError("Unable to resolve report schedule timezone.");
}
export function createReportSchedule(user, body, now = new Date()) {
  owner(user);
  const input = validate(schema, body);
  resolveCopilotContext(user, {
    scope: input.branchId ? "branch" : "restaurant",
    ...(input.branchId ? { branchId: input.branchId } : {}),
    language: input.language
  });
  const count = db
    .prepare("SELECT COUNT(*) n FROM report_schedules WHERE organization_id=? AND restaurant_id=? AND created_by=?")
    .get(user.organization_id, user.restaurant_id, user.owner_id).n;
  if (count >= 20) throw validationError("At most 20 report schedules are allowed per owner and restaurant.");
  const next = nextReportRun(input.cadence, input.hour, user.timezone, now);
  const id = db
    .prepare(
      "INSERT INTO report_schedules(organization_id,restaurant_id,created_by,branch_id,cadence,language,timezone,hour,next_run_at) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run(
      user.organization_id,
      user.restaurant_id,
      user.owner_id,
      input.branchId || null,
      input.cadence,
      input.language,
      user.timezone,
      input.hour,
      next
    ).lastInsertRowid;
  logInfo("report_schedule_created", {
    scheduleId: Number(id),
    organizationId: user.organization_id,
    restaurantId: user.restaurant_id,
    actorId: user.owner_id,
    cadence: input.cadence
  });
  return visible(schedule(user, Number(id)));
}
export function listReportSchedules(user) {
  owner(user);
  return {
    schedules: db
      .prepare(
        "SELECT * FROM report_schedules WHERE organization_id=? AND restaurant_id=? AND created_by=? ORDER BY id DESC"
      )
      .all(user.organization_id, user.restaurant_id, user.owner_id)
      .map(visible),
    runs: db
      .prepare(
        "SELECT r.id,r.schedule_id AS scheduleId,r.scheduled_for AS scheduledFor,r.status,r.attempts,r.error_code AS errorCode,r.generated_at AS generatedAt FROM scheduled_report_runs r JOIN report_schedules s ON s.id=r.schedule_id WHERE s.organization_id=? AND s.restaurant_id=? AND s.created_by=? ORDER BY r.id DESC LIMIT 30"
      )
      .all(user.organization_id, user.restaurant_id, user.owner_id)
  };
}
export function setReportSchedule(user, id, body, now = new Date()) {
  const row = schedule(user, id),
    { enabled } = validate(z.object({ enabled: z.boolean() }).strict(), body);
  const next = enabled && !row.enabled ? nextReportRun(row.cadence, row.hour, row.timezone, now) : row.next_run_at;
  db.prepare("UPDATE report_schedules SET enabled=?,next_run_at=?,retry_at=NULL WHERE id=?").run(
    Number(enabled),
    next,
    row.id
  );
  logInfo("report_schedule_updated", {
    scheduleId: row.id,
    organizationId: user.organization_id,
    restaurantId: user.restaurant_id,
    actorId: user.owner_id,
    enabled
  });
  return visible(schedule(user, id));
}
export function getScheduledReport(user, id) {
  owner(user);
  const row = db
    .prepare(
      "SELECT r.*,s.branch_id FROM scheduled_report_runs r JOIN report_schedules s ON s.id=r.schedule_id WHERE r.id=? AND s.organization_id=? AND s.restaurant_id=? AND s.created_by=?"
    )
    .get(id, user.organization_id, user.restaurant_id, user.owner_id);
  if (!row || row.status !== "ready") throw notFound("Scheduled report not found");
  resolveCopilotContext(user, {
    scope: row.branch_id ? "branch" : "restaurant",
    ...(row.branch_id ? { branchId: row.branch_id } : {})
  });
  return JSON.parse(row.report_json);
}
export function dispatchScheduledReports(now = new Date()) {
  const due = db
    .prepare(
      "SELECT * FROM report_schedules WHERE enabled=1 AND next_run_at<=? AND (retry_at IS NULL OR retry_at<=?) ORDER BY next_run_at,id LIMIT 20"
    )
    .all(now.toISOString(), now.toISOString());
  const counts = { ready: 0, failed: 0, disabled: 0 };
  for (const row of due)
    db.transaction(() => {
      const current = db.prepare("SELECT * FROM report_schedules WHERE id=?").get(row.id);
      if (
        !current.enabled ||
        current.next_run_at !== row.next_run_at ||
        (current.retry_at && current.retry_at > now.toISOString())
      )
        return;
      // Explicit membership prevents the legacy auth fallback from resurrecting a removed account.
      const member = db
        .prepare("SELECT role FROM organization_users WHERE organization_id=? AND owner_id=?")
        .get(row.organization_id, row.created_by);
      if (member?.role !== "owner") {
        db.prepare("UPDATE report_schedules SET enabled=0 WHERE id=?").run(row.id);
        counts.disabled++;
        return;
      }
      const previous = db
        .prepare("SELECT * FROM scheduled_report_runs WHERE schedule_id=? AND scheduled_for=?")
        .get(row.id, row.next_run_at);
      const next = () => nextReportRun(row.cadence, row.hour, row.timezone, new Date(row.next_run_at));
      if (previous?.status === "ready") {
        db.prepare("UPDATE report_schedules SET next_run_at=?,retry_at=NULL WHERE id=?").run(next(), row.id);
        return;
      }
      const attempts = (previous?.attempts || 0) + 1;
      try {
        const user = getAuthContext(row.created_by, row.organization_id, row.restaurant_id);
        if (!user || user.organization_id !== row.organization_id || user.restaurant_id !== row.restaurant_id)
          throw notFound("Report scope unavailable");
        const report = getExecutiveReport(
          { ...user, timezone: row.timezone },
          {
            cadence: row.cadence,
            language: row.language,
            scope: row.branch_id ? "branch" : "restaurant",
            ...(row.branch_id ? { branchId: row.branch_id } : {})
          },
          new Date(row.next_run_at)
        );
        db.prepare(
          "INSERT INTO scheduled_report_runs(schedule_id,scheduled_for,status,attempts,report_json,generated_at) VALUES (?,?,'ready',?,?,?) ON CONFLICT(schedule_id,scheduled_for) DO UPDATE SET status='ready',attempts=excluded.attempts,report_json=excluded.report_json,error_code=NULL,generated_at=excluded.generated_at"
        ).run(row.id, row.next_run_at, attempts, JSON.stringify(report), now.toISOString());
        db.prepare("UPDATE report_schedules SET next_run_at=?,retry_at=NULL WHERE id=?").run(next(), row.id);
        counts.ready++;
      } catch (error) {
        const code = ["RESOURCE_NOT_FOUND", "FORBIDDEN", "VALIDATION_ERROR"].includes(error.code)
          ? error.code
          : "REPORT_GENERATION_FAILED";
        db.prepare(
          "INSERT INTO scheduled_report_runs(schedule_id,scheduled_for,status,attempts,error_code,generated_at) VALUES (?,?,'failed',?,?,?) ON CONFLICT(schedule_id,scheduled_for) DO UPDATE SET attempts=excluded.attempts,error_code=excluded.error_code,generated_at=excluded.generated_at"
        ).run(row.id, row.next_run_at, attempts, code, now.toISOString());
        db.prepare("UPDATE report_schedules SET next_run_at=?,retry_at=? WHERE id=?").run(
          attempts >= 3 ? next() : row.next_run_at,
          attempts >= 3 ? null : new Date(now.getTime() + attempts * 15 * 60000).toISOString(),
          row.id
        );
        counts.failed++;
      }
    })();
  return counts;
}
export function startReportScheduler() {
  const timer = setInterval(() => {
    try {
      const result = dispatchScheduledReports();
      if (result.ready || result.failed || result.disabled) logInfo("scheduled_reports", result);
    } catch {
      logInfo("scheduled_reports_failed", { code: "SCHEDULER_FAILED" });
    }
  }, 60000);
  timer.unref();
  return () => clearInterval(timer);
}
