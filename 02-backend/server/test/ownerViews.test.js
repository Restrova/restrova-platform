import test from "node:test";
import assert from "node:assert/strict";
import { start, request, account, branch, ledger, roleToken, db } from "../test-support/operationsFixtures.js";
import { resolveFinancialPeriodRanges } from "../src/services/financialPeriodService.js";

test("today-to-date compares the same local clock in Riyadh, Shanghai and across DST", () => {
  for (const [timezone, anchor, previous] of [
    ["Asia/Riyadh", "2026-09-18T09:23:11.123Z", "2026-09-17T09:23:11.123Z"],
    ["Asia/Shanghai", "2026-09-18T01:23:11.123Z", "2026-09-17T01:23:11.123Z"],
    ["America/New_York", "2026-03-08T14:00:00.000Z", "2026-03-07T15:00:00.000Z"],
    ["America/New_York", "2026-11-01T15:00:00.000Z", "2026-10-31T14:00:00.000Z"]
  ]) {
    const range = resolveFinancialPeriodRanges({ period: "today", throughNow: "true", anchor }, timezone);
    assert.equal(range.current.to, anchor);
    assert.equal(range.comparison.to, previous);
    assert.ok(range.current.from <= range.current.to);
  }
});
test("today cutoff validates its period and preserves full-day defaults, midnight and same-weekday behavior", () => {
  assert.throws(() => resolveFinancialPeriodRanges({ period: "month", throughNow: "true" }, "Asia/Riyadh"));
  const anchor = "2026-09-17T21:00:00.000Z";
  const query = { period: "today", comparison: "same_weekday", anchor };
  const full = resolveFinancialPeriodRanges(query, "Asia/Riyadh");
  assert.equal(full.current.to, "2026-09-18T20:59:59.999Z");
  const partial = resolveFinancialPeriodRanges({ ...query, throughNow: "true" }, "Asia/Riyadh");
  assert.equal(partial.current.from, partial.current.to);
  assert.equal(partial.comparison.to, "2026-09-10T21:00:00.000Z");
});
test("today dashboard excludes later records from both periods and enforces branch and tenant access", async (t) => {
  const server = start(t),
    owner = await account(server),
    id = await branch(server, owner, "Today branch");
  for (const day of ["17", "18"]) {
    ledger(owner, id, `2026-09-${day}T07:00:00Z`, { sales: 10000, food_costs: 3000 });
    ledger(owner, id, `2026-09-${day}T14:00:00Z`, { sales: 990000 });
  }
  const query = `scope=branch&branchId=${id}&period=today&throughNow=true&anchor=2026-09-18T09:00:00Z`;
  const response = await request(server, `/financial/dashboard?${query}`, { token: owner.token });
  assert.equal(response.status, 200);
  assert.equal(response.payload.summary.revenue.revenueMinor, 10000);
  assert.equal(response.payload.comparison.metrics.revenueMinor, 10000);
  assert.equal(response.payload.summary.profit.netProfitMinor, 7000);
  assert.ok(response.payload.trends.points.every((p) => p.to <= response.payload.period.current.to));
  const outsider = await account(server);
  assert.equal((await request(server, `/financial/dashboard?${query}`, { token: outsider.token })).status, 404);
  const manager = roleToken(owner, "branch_manager", id);
  assert.equal((await request(server, `/financial/dashboard?${query}`, { token: manager })).status, 200);
  assert.equal(
    (await request(server, "/financial/dashboard?scope=organization&throughNow=true", { token: manager })).status,
    403
  );
});
function incident(owner, id, severity) {
  return Number(
    db
      .prepare(
        "INSERT INTO alert_incidents(organization_id,restaurant_id,branch_id,rule_type,period_key,snapshot_json) VALUES (?,?,?,?,?,?)"
      )
      .run(
        owner.organization.id,
        owner.restaurant.id,
        id,
        "sales_drop",
        crypto.randomUUID(),
        JSON.stringify({ severity })
      ).lastInsertRowid
  );
}
test("priority pagination ranks all incidents before applying the page limit without duplicates", async (t) => {
  const server = start(t),
    owner = await account(server),
    id = await branch(server, owner, "Priority branch");
  const critical = incident(owner, id, "CRITICAL"),
    warning = incident(owner, id, "WARNING"),
    info = incident(owner, id, "INFO"),
    critical2 = incident(owner, id, "CRITICAL");
  const base = `/alerts?scope=branch&branchId=${id}&order=priority&limit=1`;
  let before = null;
  const result = [];
  do {
    const response = await request(server, base + (before ? `&before=${before}` : ""), { token: owner.token });
    assert.equal(response.status, 200);
    result.push(...response.payload.items.map((i) => i.id));
    before = response.payload.nextBefore;
  } while (before);
  assert.deepEqual(result, [critical2, critical, warning, info]);
  assert.equal(
    (await request(server, base.replace("priority", "recent"), { token: owner.token })).payload.items[0].id,
    critical2
  );
  const outsider = await account(server),
    otherId = outsider.branches[0].id;
  const foreign = incident(outsider, otherId, "CRITICAL");
  assert.deepEqual((await request(server, `${base}&before=${foreign}`, { token: owner.token })).payload.items, []);
  assert.equal(
    (await request(server, `/alerts?scope=branch&branchId=${otherId}&order=priority`, { token: owner.token })).status,
    404
  );
});
