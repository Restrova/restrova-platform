import test from "node:test";
import assert from "node:assert/strict";
import { start, request, account, sale, roleToken, db } from "../test-support/operationsFixtures.js";
import { getAuthContext } from "../src/repositories/authRepository.js";
import {
  nextReportRun,
  createReportSchedule,
  dispatchScheduledReports,
  getScheduledReport,
  setReportSchedule
} from "../src/services/scheduledReportService.js";
test("wall time handles cadence, quarter-hour offsets and DST", () => {
  const next = (c, h, z, d) => nextReportRun(c, h, z, new Date(d));
  assert.equal(next("daily", 8, "Asia/Riyadh", "2026-10-02T04:00:00Z"), "2026-10-02T05:00:00.000Z");
  assert.equal(next("weekly", 8, "Asia/Riyadh", "2026-10-02T04:00:00Z"), "2026-10-05T05:00:00.000Z");
  assert.equal(next("monthly", 8, "Asia/Riyadh", "2026-10-02T04:00:00Z"), "2026-11-01T05:00:00.000Z");
  assert.equal(next("daily", 8, "Asia/Kathmandu", "2026-10-02T00:00:00Z"), "2026-10-02T02:15:00.000Z");
  assert.equal(next("daily", 2, "America/New_York", "2026-03-08T00:00:00Z"), "2026-03-09T06:00:00.000Z");
  assert.equal(next("daily", 1, "America/New_York", "2026-11-01T05:00:00Z"), "2026-11-02T06:00:00.000Z");
});
test("delivery is exactly once, period-pinned and immutable after new sales", async (t) => {
  const server = start(t),
    a = await account(server),
    user = getAuthContext(a.user.id, a.organization.id, a.restaurant.id),
    id = a.branches[0].id;
  const row = createReportSchedule(
    user,
    { cadence: "daily", language: "ar", hour: 8, branchId: id },
    new Date("2026-10-02T04:00:00Z")
  );
  sale(a, id, "2026-10-01T12:00:00+03:00", { gross: 12500 });
  assert.equal(dispatchScheduledReports(new Date(row.nextRunAt)).ready, 1);
  assert.equal(dispatchScheduledReports(new Date(row.nextRunAt)).ready, 0);
  const run = db.prepare("SELECT * FROM scheduled_report_runs WHERE schedule_id=?").get(row.id),
    report = getScheduledReport(user, run.id);
  assert.equal(report.period.fromDate, "2026-10-01");
  assert.equal(report.language, "ar");
  assert.equal(report.claims.find((c) => c.key === "revenue").value, 12500);
  sale(a, id, "2026-10-01T13:00:00+03:00", { gross: 5000 });
  assert.deepEqual(getScheduledReport(user, run.id), report);
  setReportSchedule(user, row.id, { enabled: false });
  assert.equal(db.prepare("SELECT enabled FROM report_schedules WHERE id=?").get(row.id).enabled, 0);
  const other = await account(server);
  assert.throws(() =>
    getScheduledReport(getAuthContext(other.user.id, other.organization.id, other.restaurant.id), run.id)
  );
});
test("API enforces roles, scope and strict input", async (t) => {
  const server = start(t),
    a = await account(server),
    b = await account(server),
    valid = { cadence: "weekly", language: "en", hour: 8 };
  const post = (body, token = a.token) => request(server, "/reports/schedules", { method: "POST", token, body });
  for (const body of [
    { ...valid, hour: 24 },
    { ...valid, email: "secret@example.test" },
    { ...valid, cadence: "yearly" }
  ])
    assert.equal((await post(body)).status, 400);
  assert.equal((await post({ ...valid, branchId: b.branches[0].id })).status, 404);
  const created = await post(valid);
  assert.equal(created.status, 201);
  assert.equal(
    (
      await request(server, `/reports/schedules/${created.payload.id}`, {
        token: b.token,
        method: "PATCH",
        body: { enabled: false }
      })
    ).status,
    404
  );
  assert.equal((await request(server, "/reports/schedules", { token: roleToken(a, "viewer") })).status, 403);
  assert.equal((await post(valid, roleToken(a, "branch_manager", a.branches[0].id))).status, 403);
});
test("removed membership disables delivery", async (t) => {
  const server = start(t),
    a = await account(server),
    user = getAuthContext(a.user.id, a.organization.id, a.restaurant.id);
  const row = createReportSchedule(
    user,
    { cadence: "daily", language: "en", hour: 8 },
    new Date("2026-10-02T04:00:00Z")
  );
  db.prepare("DELETE FROM organization_users WHERE owner_id=? AND organization_id=?").run(a.user.id, a.organization.id);
  assert.throws(() => createReportSchedule(user, { cadence: "daily", language: "en", hour: 8 }));
  dispatchScheduledReports(new Date(row.nextRunAt));
  assert.equal(db.prepare("SELECT enabled FROM report_schedules WHERE id=?").get(row.id).enabled, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM scheduled_report_runs WHERE schedule_id=?").get(row.id).n, 0);
});
test("failed scope retries safely and advances after three attempts", async (t) => {
  const server = start(t),
    a = await account(server),
    b = await account(server),
    user = getAuthContext(a.user.id, a.organization.id, a.restaurant.id);
  const row = createReportSchedule(
    user,
    { cadence: "daily", language: "en", hour: 8 },
    new Date("2026-10-02T04:00:00Z")
  );
  db.prepare("UPDATE report_schedules SET branch_id=? WHERE id=?").run(b.branches[0].id, row.id);
  for (let n = 0; n < 3; n++) {
    const due = db.prepare("SELECT * FROM report_schedules WHERE id=?").get(row.id);
    dispatchScheduledReports(new Date(due.retry_at || due.next_run_at));
  }
  const run = db.prepare("SELECT * FROM scheduled_report_runs WHERE schedule_id=?").get(row.id);
  assert.equal(run.status, "failed");
  assert.equal(run.attempts, 3);
  assert.equal(run.report_json, null);
  assert.equal(run.error_code, "RESOURCE_NOT_FOUND");
  assert.equal(db.prepare("SELECT retry_at FROM report_schedules WHERE id=?").get(row.id).retry_at, null);
});
