import test from "node:test";
import assert from "node:assert/strict";
import { start, request, account, branch, sale, roleToken, db } from "../test-support/operationsFixtures.js";
import { dayOffset, localDate } from "../src/services/historicalSeriesService.js";
import { predictionInterval } from "../src/services/forecastConfidenceService.js";
import { seasonalBaseline } from "../src/services/seasonalService.js";
const today = () => localDate(new Date().toISOString(), "Asia/Riyadh");
async function setup(t) {
  const server = start(t),
    owner = await account(server),
    id = owner.branches[0].id;
  return {
    server,
    owner,
    id,
    get: (path) => request(server, path, { token: owner.token }),
    post: (path, body, method = "POST") => request(server, path, { token: owner.token, body, method })
  };
}
async function imported(f, key, csv) {
  const preview = await request(f.server, `/data/import-jobs/preview?templateKey=${key}&filename=test.csv`, {
    token: f.owner.token,
    method: "POST",
    raw: csv
  });
  assert.equal(preview.status, 201, JSON.stringify(preview.payload));
  assert.ok(preview.payload.confirmationToken, JSON.stringify(preview.payload));
  const result = await f.post(`/data/import-jobs/${preview.payload.id}/confirm`, {
    confirmationToken: preview.payload.confirmationToken
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  return result.payload;
}
async function importedFixture(t) {
  const f = await setup(t);
  assert.equal((await f.post(`/branches/${f.id}`, { openedOn: "2025-01-01" }, "PATCH")).status, 200);
  await imported(
    f,
    "costs",
    `item_code,branch_code,direct_food_cost,packaging_cost,effective_from,supplier_name\nITEM,MAIN,20,2,2025-01-01T00:00:00Z,Supplier A`
  );
  await imported(
    f,
    "costs",
    `item_code,branch_code,direct_food_cost,packaging_cost,effective_from,supplier_name\nITEM,MAIN,25,2,2025-02-01T00:00:00Z,Supplier A`
  );
  const rows = [];
  for (let i = -60; i < 0; i++)
    rows.push(`order${i},1,MAIN,${dayOffset(today(), i)}T12:00:00+03:00,delivery,ITEM,1,100,0,0,0`);
  await imported(
    f,
    "sales",
    `order_id,line_id,branch_code,created_at,channel,item_code,quantity,gross_sales,discount,refund_amount,delivery_commission\n${rows.join("\n")}`
  );
  return f;
}
test("#58 empirical confidence uses chronological errors, withholds sparse bands and keeps gross sales nonnegative", () => {
  const days = Array.from({ length: 57 }, (_, i) => ({
    date: dayOffset("2026-06-01", i),
    observed: true,
    revenueMinor: 10000,
    grossSalesMinor: 10000
  }));
  const interval = predictionInterval(days, 10000, "revenueMinor");
  assert.equal(interval.status, "estimated");
  assert.equal(interval.lower, 10000);
  assert.equal(interval.upper, 10000);
  assert.equal(interval.sampleCount, 29);
  assert.equal(predictionInterval(days.slice(0, 29), 10000, "revenueMinor").status, "unavailable");
  assert.equal(predictionInterval(days, null, "revenueMinor").lower, null);
  for (let i = 28; i < 57; i++) days[i].grossSalesMinor = i % 2 ? 100000 : 0;
  assert.ok(predictionInterval(days, 1, "grossSalesMinor").lower >= 0);
});
test("#60 seasonal comparisons require the same explicit event kinds, including overlapping and local seasons", () => {
  const events = [
    { kind: "ramadan", fromDate: "2026-03-01", toDate: "2026-03-30" },
    { kind: "local_event", fromDate: "2026-03-15", toDate: "2026-03-16" }
  ];
  const days = [{ date: "2026-02-01" }, { date: "2026-03-01" }, { date: "2026-03-15" }];
  assert.deepEqual(seasonalBaseline(days, "2026-03-22", events).days, [days[1]]);
  assert.deepEqual(seasonalBaseline(days, "2026-03-16", events).days, [days[2]]);
  assert.deepEqual(seasonalBaseline(days, "2026-04-01", events).days, [days[0]]);
});
test("#61–66 real confirmed imports feed revision, supplier, menu, promotion and price evidence", async (t) => {
  const f = await importedFixture(t);
  const revision = await f.get("/data/revision");
  assert.equal(revision.payload.revision, 3);
  const result = await f.get(`/decisions?branchId=${f.id}`);
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  const items = result.payload.recommendations;
  assert.ok(items.some((r) => r.category === "menu"));
  assert.ok(items.some((r) => r.category === "promotion"));
  const cost = items.find((r) => r.problem === "supplier_cost_increase");
  assert.ok(cost);
  assert.equal(cost.evidence.increaseMinor, 500);
  assert.equal(cost.evidence.supplier, "Supplier A");
  assert.equal(cost.lineage.costIds.length, 2);
  assert.equal(cost.expectedOutcome.amountMinor, null);
  assert.ok(items.every((r) => r.dataRevision === 3 && r.problem && r.recommendedAction && r.confidence));
  const scenario = await f.post("/decisions/scenario", {
    kind: "pricing",
    branchId: f.id,
    itemCode: "ITEM",
    proposedPriceMinor: 11000,
    minimumMarginBps: 2000,
    demandChangesBps: [-1000, 0, 1000]
  });
  assert.equal(scenario.status, 200, JSON.stringify(scenario.payload));
  assert.equal(scenario.payload.eligible, true);
  assert.equal(scenario.payload.scenarios.length, 3);
  assert.equal(scenario.payload.unitEconomics.proposedContributionMinor, 8300);
  const promotion = await f.post("/decisions/scenario", {
    kind: "promotion",
    branchId: f.id,
    itemCode: "ITEM",
    proposedPriceMinor: 1000,
    minimumMarginBps: 1000,
    demandChangesBps: [0, 1000]
  });
  assert.equal(promotion.payload.eligible, false);
  assert.equal(promotion.payload.decision, "blocked_by_margin_or_discount_rule");
  const snapshot = await f.post("/forecasts/snapshots", {
    scope: "branch",
    branchId: f.id,
    horizon: 7,
    historyDays: 57
  });
  assert.equal(snapshot.status, 200, JSON.stringify(snapshot.payload));
  assert.equal(snapshot.payload.saved, 1);
  const forecast = await f.get(`/forecasts?scope=branch&branchId=${f.id}`);
  assert.equal(forecast.payload.branches[0].daily[0].revenueMinor, 10000);
  assert.equal(forecast.payload.branches[0].daily[0].intervals.revenueMinor.status, "estimated");
});
test("failed and cancelled previews never change the revision or recommendations", async (t) => {
  const f = await setup(t);
  const preview = await request(f.server, "/data/import-jobs/preview?templateKey=costs&filename=test.csv", {
    token: f.owner.token,
    method: "POST",
    raw: "item_code,direct_food_cost,effective_from\nITEM,20,2025-01-01T00:00:00Z"
  });
  assert.equal(preview.status, 201);
  assert.equal((await f.get("/data/revision")).payload.revision, 0);
  assert.equal(
    (await f.post(`/data/import-jobs/${preview.payload.id}/confirm`, { confirmationToken: "bad" })).status,
    403
  );
  assert.equal((await f.post(`/data/import-jobs/${preview.payload.id}/cancel`, {})).status, 200);
  assert.equal((await f.get("/data/revision")).payload.revision, 0);
  assert.equal((await f.get(`/decisions?branchId=${f.id}`)).payload.recommendations.length, 0);
});
test("#59 snapshots cannot backdate, do not score future dates and measure MAE/MAPE with zero actuals", async (t) => {
  const f = await setup(t);
  assert.equal(
    (await f.post("/forecasts/snapshots", { branchId: f.id, scope: "branch", anchor: "2020-01-01T00:00:00Z" })).status,
    400
  );
  const daily = [];
  for (let i = -12; i <= 1; i++) {
    const date = dayOffset(today(), i);
    daily.push({ date, revenueMinor: 10000 });
    if (i < 0) sale(f.owner, f.id, `${date}T12:00:00+03:00`, { gross: i === -12 ? 0 : i < -6 ? 10000 : 5000 });
  }
  db.prepare(
    "INSERT INTO forecast_snapshots(organization_id,restaurant_id,branch_id,created_by,created_at,horizon,revision,forecast_json) VALUES (?,?,?,?,?,30,0,?)"
  ).run(
    f.owner.organization.id,
    f.owner.restaurant.id,
    f.id,
    f.owner.user.id,
    `${dayOffset(today(), -31)}T00:00:00Z`,
    JSON.stringify({ timezone: "Asia/Riyadh", daily })
  );
  const response = await f.get(`/forecasts/accuracy?scope=branch&branchId=${f.id}`);
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  const group = response.payload.groups.find((g) => g.horizon === 30);
  assert.equal(group.count, 12);
  assert.equal(group.zeroActualCount, 1);
  assert.equal(group.maeMinor, 3333);
  assert.equal(group.mapeBps, 5455);
  assert.equal(group.drift, "increased_error");
  assert.ok(response.payload.points.every((p) => p.date < today() && p.actualLineage.length));
});
test("#60 season creation enforces owner, scope and date order and withholds sparse seasonal forecasts", async (t) => {
  const f = await importedFixture(t);
  const body = {
    branchId: f.id,
    kind: "ramadan",
    name: "Verified calendar",
    fromDate: dayOffset(today(), 1),
    toDate: dayOffset(today(), 30),
    source: "Owner confirmed local calendar"
  };
  const response = await f.post("/seasons", body);
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  const forecast = await f.get(`/forecasts?scope=branch&branchId=${f.id}`);
  assert.equal(forecast.payload.branches[0].daily[0].revenueMinor, null);
  assert.equal(forecast.payload.branches[0].daily[0].seasonalContext[0].name, body.name);
  assert.equal((await f.post("/seasons", { ...body, toDate: "2020-01-01" })).status, 400);
  const token = roleToken(f.owner, "branch_manager", f.id);
  assert.equal((await request(f.server, "/seasons", { token, method: "POST", body })).status, 403);
});
test("#67 acceptance, implementation, optimistic concurrency and import-derived outcome are recorded", async (t) => {
  const f = await importedFixture(t);
  const proposal = (await f.get(`/decisions?branchId=${f.id}`)).payload.recommendations[0];
  const saved = await f.post("/decisions/actions", { branchId: f.id, ...proposal.period, key: proposal.key });
  assert.equal(saved.status, 200, JSON.stringify(saved.payload));
  const id = saved.payload.id;
  assert.equal(
    (await f.post(`/decisions/actions/${id}`, { status: "action_taken", version: 1, note: "Too early" }, "PATCH"))
      .status,
    409
  );
  let result = await f.post(
    `/decisions/actions/${id}`,
    { status: "accepted", version: 1, note: "Owner reviewed sources" },
    "PATCH"
  );
  assert.equal(result.payload.version, 2);
  assert.equal(
    (await f.post(`/decisions/actions/${id}`, { status: "rejected", version: 1, note: "Stale" }, "PATCH")).status,
    409
  );
  result = await f.post(
    `/decisions/actions/${id}`,
    { status: "action_taken", version: 2, note: "Updated menu placement" },
    "PATCH"
  );
  assert.equal(result.payload.version, 3);
  assert.equal(
    (
      await f.post(
        `/decisions/actions/${id}`,
        { status: "measured", version: 3, note: "Check results", days: 7 },
        "PATCH"
      )
    ).status,
    409
  );
  db.prepare("UPDATE recommendation_actions SET action_at=? WHERE id=?").run(
    `${dayOffset(today(), -10)}T00:00:00Z`,
    id
  );
  result = await f.post(
    `/decisions/actions/${id}`,
    { status: "measured", version: 3, note: "Completed imported observation", days: 7 },
    "PATCH"
  );
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.result.revenueChangeMinor, 0);
  assert.equal(result.payload.result.after.salesLineage.length, 7);
  assert.equal(result.payload.history.length, 4);
  assert.equal(result.payload.result.attribution, "observational_before_after_not_causal");
});
test("decision, forecast and seasonal evidence isolate organizations, restaurants and branch roles", async (t) => {
  const f = await importedFixture(t),
    foreign = await account(f.server),
    other = await branch(f.server, f.owner, "Other");
  const viewer = roleToken(f.owner, "viewer"),
    manager = roleToken(f.owner, "branch_manager", f.id);
  for (const path of [
    `/decisions?branchId=${foreign.branches[0].id}`,
    `/forecasts/accuracy?scope=branch&branchId=${foreign.branches[0].id}`,
    `/seasons?branchId=${foreign.branches[0].id}`
  ])
    assert.equal((await f.get(path)).status, 404, path);
  assert.equal((await request(f.server, `/decisions?branchId=${other}`, { token: manager })).status, 404);
  assert.equal(
    (
      await request(f.server, "/decisions/actions", {
        token: viewer,
        method: "POST",
        body: { branchId: f.id, key: "invalid" }
      })
    ).status,
    403
  );
  assert.equal(
    (await request(f.server, "/forecasts/snapshots", { token: viewer, method: "POST", body: { branchId: f.id } }))
      .status,
    403
  );
  assert.equal((await request(f.server, `/decisions?branchId=${f.id}`, { token: viewer })).status, 200);
});

test("#62 cost-reduction scenarios are explicit, positive-margin and do not mutate imported costs", async (t) => {
  const f = await importedFixture(t),
    count = db.prepare("SELECT COUNT(*) AS n FROM item_costs WHERE restaurant_id=?").get(f.owner.restaurant.id).n;
  const result = await f.post("/decisions/scenario", {
    kind: "cost",
    branchId: f.id,
    itemCode: "ITEM",
    minimumMarginBps: 2000,
    scenarios: [{ name: "Negotiated quote", proposedFoodCostMinor: 2000, proposedPackagingMinor: 200 }]
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.eligible, true);
  assert.equal(result.payload.scenarios[0].contributionImpactMinor, 30000);
  assert.equal(result.payload.expectedOutcome.kind, "modeled_constant_quantity_not_guaranteed_savings");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM item_costs WHERE restaurant_id=?").get(f.owner.restaurant.id).n,
    count
  );
});
test("#65 imported falling sales and refunds produce branch interventions with source lineage", async (t) => {
  const f = await setup(t);
  await f.post(`/branches/${f.id}`, { openedOn: "2025-01-01" }, "PATCH");
  const rows = [];
  for (let i = -14; i < 0; i++)
    rows.push(
      `branch-order${i},1,MAIN,${dayOffset(today(), i)}T12:00:00+03:00,dine_in,ITEM,1,${i < -7 ? 100 : 70},0,${i < -7 ? 0 : 10},0`
    );
  await imported(
    f,
    "sales",
    `order_id,line_id,branch_code,created_at,channel,item_code,quantity,gross_sales,discount,refund_amount,delivery_commission\n${rows.join("\n")}`
  );
  const response = await f.get(`/decisions?branchId=${f.id}`);
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.ok(response.payload.recommendations.some((r) => r.recommendedAction === "review_falling_sales"));
  assert.ok(response.payload.recommendations.some((r) => r.recommendedAction === "review_high_refunds"));
  assert.ok(response.payload.recommendations.every((r) => r.expectedOutcome.amountMinor === null));
});
