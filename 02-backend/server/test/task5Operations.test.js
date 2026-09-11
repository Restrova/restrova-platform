import test from "node:test";
import assert from "node:assert/strict";
import {
  start,
  request,
  account,
  branch,
  sale,
  ledger,
  roleToken,
  periodQuery,
  db
} from "../test-support/operationsFixtures.js";

test("Tasks 5.3–5.7 compare a fixed cohort, reconcile channels and detect five evidence-backed opportunities", async (t) => {
  const server = start(t);
  const owner = await account(server);
  const a = await branch(server, owner, "فرع الرياض");
  const b = await branch(server, owner, "深圳分店");
  const c = await branch(server, owner, "Harbor Branch");
  const newBranch = await branch(server, owner, "New Branch", { openedOn: "2026-08-18" });
  const closed = await branch(server, owner, "Closed Branch", { openedOn: "2025-01-01", closedOn: "2026-08-20" });
  const missing = await branch(server, owner, "Missing days");
  for (let day = 10; day <= 23; day += 1) {
    const at = `2026-08-${day}T19:00:00+03:00`;
    for (const id of [a, b, c]) {
      const gross = day < 17 || id === a ? 10000 : id === b ? 10500 : 11000;
      const discount = id === a && day >= 17 ? 1500 : 0;
      const refund = id === a && day >= 17 ? 600 : 0;
      sale(owner, id, at, {
        gross,
        discount,
        refund,
        channel: id === a ? "delivery" : id === b ? "takeaway" : "dine_in",
        aggregator: id === a ? "平台 / جاهز" : null,
        commission: id === a ? 1000 : 0
      });
      ledger(owner, id, at, {
        sales: gross,
        discounts: discount,
        refunds: refund,
        food_costs: id === a && day >= 17 ? 4000 : 1000
      });
    }
    sale(owner, newBranch, at, { gross: 900000 });
    sale(owner, closed, at);
    if (day !== 12) sale(owner, missing, at);
  }
  const endpoint = `/branches/operations?${periodQuery}`;
  const response = await request(server, endpoint, { token: owner.token });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  const data = response.payload;
  assert.deepEqual(data, (await request(server, endpoint, { token: owner.token })).payload);
  assert.equal(data.currencyCode, "SAR");
  assert.equal(data.period.current.from, "2026-08-16T21:00:00.000Z");
  assert.deepEqual(
    data.sameStore.eligible.map((row) => row.branchId).sort((left, right) => left - right),
    [a, b, c]
  );
  assert.equal(data.sameStore.current.revenueMinor, 205800);
  assert.equal(data.sameStore.comparison.revenueMinor, 210000);
  assert.equal(data.sameStore.revenueChange.changeBps, -200);
  assert.equal(data.sameStore.alignment.current.length, 7);
  const exclusion = (id) => data.sameStore.excluded.find((row) => row.branchId === id);
  assert.ok(exclusion(owner.branches[0].id).reasons.includes("opening_date_unknown"));
  assert.ok(exclusion(newBranch).reasons.includes("opened_during_or_after_comparison"));
  assert.ok(exclusion(closed).reasons.includes("closed_before_period_end"));
  assert.deepEqual(exclusion(missing).missingComparisonDates, ["2026-08-12"]);
  const aCard = data.scorecards.find((row) => row.branchId === a);
  assert.equal(aCard.current.netProfitMinor, 27300);
  assert.equal(aCard.fullPeriodComparable, true);
  assert.equal(aCard.deltas.revenueMinor.change, -14700);
  const missingCard = data.scorecards.find((row) => row.branchId === missing);
  assert.equal(missingCard.current.netProfitMinor, null);
  const types = data.opportunities
    .filter((row) => row.branchId === a)
    .map((row) => row.type)
    .sort();
  assert.deepEqual(types, ["abnormal_discounts", "falling_sales", "high_refunds", "rising_costs", "underperformance"]);
  assert.ok(data.opportunities.every((row) => row.expectedImpactMinor === null && row.evidence.current.lineage.length));
  assert.equal(data.timeAnalysis.hours.find((row) => row.key === 19).revenueMinor, data.channels.totals.revenueMinor);
  for (const groups of [data.channels.groups, data.timeAnalysis.weekdays, data.timeAnalysis.dayparts]) {
    assert.equal(
      groups.reduce((sum, row) => sum + row.revenueMinor, 0),
      data.channels.totals.revenueMinor
    );
  }
  const aggregator = data.channels.groups.find((row) => row.key === "aggregator");
  assert.equal(aggregator.commissionMinor, 7000);
  assert.equal(aggregator.revenueAfterCommissionMinor, 48300);
  assert.equal(data.channels.aggregators[0].key, "平台 / جاهز");
  assert.equal(data.channels.groups.find((row) => row.key === "delivery").lineCount, 0);
});

test("same-store comparison matches weekday counts across unequal months and omits partial days", async (t) => {
  const server = start(t);
  const owner = await account(server);
  const id = await branch(server, owner, "Comparable");
  for (let day = 1; day <= 31; day += 1) {
    sale(owner, id, `2026-07-${String(day).padStart(2, "0")}T12:00:00+03:00`);
    sale(owner, id, `2026-08-${String(day).padStart(2, "0")}T12:00:00+03:00`);
  }
  const { payload } = await request(server, "/branches/operations?period=month&anchor=2026-08-20T12:00:00Z", {
    token: owner.token
  });
  const dates = payload.sameStore.alignment;
  assert.equal(dates.current.length, 19);
  assert.equal(dates.comparison.length, 19);
  const weekdays = (values) =>
    Array.from(
      { length: 7 },
      (_, index) => values.filter((date) => new Date(`${date}T12:00:00Z`).getUTCDay() === index).length
    );
  assert.deepEqual(weekdays(dates.current), weekdays(dates.comparison));
  assert.ok(!dates.current.includes("2026-08-20"));
  assert.equal(payload.sameStore.revenueChange.changeBps, 0);
  assert.equal(payload.scorecards.find((row) => row.branchId === id).fullPeriodComparable, false);
  const none = await request(server, "/branches/operations?comparison=none", { token: owner.token });
  assert.equal(none.payload.sameStore.status, "insufficient_comparable_data");
  assert.deepEqual(none.payload.opportunities, []);
});

test("operational time groups use local dates through DST and distinct order counts", async (t) => {
  const server = start(t);
  const owner = await account(server, "America/New_York", "USD");
  const id = owner.branches[0].id;
  sale(owner, id, "2026-11-01T01:30:00-04:00", { order: "DST", line: "1", gross: 100 });
  sale(owner, id, "2026-11-01T01:30:00-05:00", { order: "DST", line: "2", gross: 200 });
  sale(owner, id, "2026-11-01T23:30:00-05:00", { gross: 300 });
  const { payload, status } = await request(
    server,
    "/branches/operations?period=custom&fromDate=2026-11-01&toDate=2026-11-01&comparison=none&anchor=2026-11-03T12:00:00Z",
    { token: owner.token }
  );
  assert.equal(status, 200);
  assert.equal(payload.timeAnalysis.hours[1].revenueMinor, 300);
  assert.equal(payload.timeAnalysis.hours[1].orderCount, 1);
  assert.equal(payload.timeAnalysis.totals.orderCount, 2);
  assert.equal(payload.timeAnalysis.weekdays[0].revenueMinor, 600);
  assert.equal(payload.timeAnalysis.dayparts.find((row) => row.key === "late_night").revenueMinor, 600);
});

test("operations, lifecycle writes and evidence enforce organization, restaurant and role boundaries", async (t) => {
  const server = start(t);
  const owner = await account(server);
  const foreign = await account(server);
  const id = owner.branches[0].id;
  sale(owner, id, "2026-08-18T12:00:00Z");
  sale(foreign, foreign.branches[0].id, "2026-08-18T12:00:00Z", { order: "FOREIGN-SECRET" });
  const manager = roleToken(owner, "branch_manager", id);
  const viewer = roleToken(owner, "viewer");
  const endpoint = `/branches/operations?${periodQuery}`;
  assert.equal((await request(server, endpoint)).status, 401);
  const managerData = await request(server, endpoint, { token: manager });
  assert.equal(managerData.status, 200);
  assert.equal(managerData.payload.scope, "branch");
  assert.deepEqual(
    managerData.payload.scorecards.map((row) => row.branchId),
    [id]
  );
  assert.equal((await request(server, `${endpoint}&scope=organization`, { token: manager })).status, 403);
  assert.equal((await request(server, `${endpoint}&scope=organization`, { token: viewer })).status, 403);
  assert.equal(
    (await request(server, `${endpoint}&scope=branch&branchId=${foreign.branches[0].id}`, { token: owner.token }))
      .status,
    404
  );
  assert.ok(
    !JSON.stringify((await request(server, endpoint, { token: owner.token })).payload).includes("FOREIGN-SECRET")
  );
  assert.equal(
    (await request(server, `/branches/${id}`, { method: "PATCH", token: manager, body: { openedOn: "2025-01-01" } }))
      .status,
    403
  );
  assert.equal(
    (
      await request(server, `/branches/${id}`, {
        method: "PATCH",
        token: owner.token,
        body: { openedOn: "2025-02-30" }
      })
    ).status,
    400
  );
  assert.equal(
    (
      await request(server, `/branches/${id}`, {
        method: "PATCH",
        token: owner.token,
        body: { closedOn: "2025-01-01" }
      })
    ).status,
    400
  );
  const updated = await request(server, `/branches/${id}`, {
    method: "PATCH",
    token: owner.token,
    body: { openedOn: "2025-01-01", closedOn: "2026-09-01" }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.opened_on, "2025-01-01");
  assert.equal(
    (await request(server, `/branches/${id}`, { method: "PATCH", token: owner.token, body: { name: "Changed" } }))
      .payload.closed_on,
    "2026-09-01"
  );
  for (const query of [
    "period=custom&fromDate=2026-08-20&toDate=2026-08-10",
    "period=custom&fromDate=invalid&toDate=2026-08-10",
    "period=custom&fromDate=2020-01-01&toDate=2026-08-10",
    "period=custom&fromDate=2026-08-10",
    "scope=branch&branchId=invalid"
  ]) {
    assert.equal((await request(server, `/branches/operations?${query}`, { token: owner.token })).status, 400);
  }
});

test("aggregator names survive confirmed imports and reject invalid channel metadata", async (t) => {
  const server = start(t);
  const owner = await account(server);
  const header =
    "external_order_id,external_line_id,branch_code,created_at,channel,item_code,quantity,gross_sales,delivery_commission,aggregator_name";
  const preview = (row) =>
    request(server, "/data/import-jobs/preview?templateKey=sales&filename=sales.csv", {
      token: owner.token,
      method: "POST",
      raw: `${header}\n${row}`
    });
  const valid = await preview("AGG-1,1,MAIN,2026-08-18T12:00:00+03:00,delivery,ITEM,1,100.00,15.00,جاهز");
  assert.equal(valid.status, 201, JSON.stringify(valid.payload));
  const confirmed = await request(server, `/data/import-jobs/${valid.payload.id}/confirm`, {
    token: owner.token,
    method: "POST",
    body: { confirmationToken: valid.payload.confirmationToken }
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.payload));
  const { payload } = await request(server, `/branches/operations?${periodQuery}`, { token: owner.token });
  assert.equal(payload.channels.aggregators[0].key, "جاهز");
  assert.equal(payload.channels.aggregators[0].revenueAfterCommissionMinor, 8500);
  const bad = await preview("AGG-2,1,MAIN,2026-08-18T12:00:00+03:00,dine_in,ITEM,1,100.00,0,جاهز");
  assert.equal(bad.status, 201);
  assert.ok(JSON.stringify(bad.payload).includes("invalid_aggregator"));
});

test("same-store zero baselines never invent growth and unsafe imported totals fail explicitly", async (t) => {
  const server = start(t);
  const owner = await account(server);
  const id = await branch(server, owner, "Recorded zero baseline");
  for (let day = 10; day <= 23; day += 1) {
    sale(owner, id, `2026-08-${day}T12:00:00+03:00`, { gross: day < 17 ? 0 : 100 });
  }
  const result = await request(server, `/branches/operations?${periodQuery}`, { token: owner.token });
  assert.equal(result.status, 200);
  assert.equal(result.payload.sameStore.revenueChange.change, 700);
  assert.equal(result.payload.sameStore.revenueChange.changeBps, null);
  assert.deepEqual(result.payload.opportunities, []);
  sale(owner, id, "2026-08-18T14:00:00+03:00", { gross: Number.MAX_SAFE_INTEGER });
  const overflow = await request(server, `/branches/operations?${periodQuery}`, { token: owner.token });
  assert.equal(overflow.status, 400);
  assert.ok(!JSON.stringify(overflow.payload).includes("NaN"));
});
