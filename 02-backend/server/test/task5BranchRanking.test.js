import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");

const current = "2026-08-26T12:00:00+08:00";
const previous = "2026-08-25T12:00:00+08:00";
const query = "period=today&comparison=previous_period&anchor=2026-08-26T12:00:00Z";
const recordedZeroes = {
  sales: 0,
  discounts: 0,
  refunds: 0,
  food_costs: 0,
  packaging: 0,
  delivery_commissions: 0,
  labor: 0,
  rent: 0,
  utilities: 0,
  marketing: 0,
  miscellaneous_operating_expenses: 0
};

async function request(server, path, { token, method = "GET", body } = {}) {
  const result = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: result.status, payload: await result.json() };
}

async function owner(server, prefix, timezone = "Asia/Shanghai") {
  const credentials = { email: `${prefix}-${crypto.randomUUID()}@example.test`, password: "ranking-test-password-123" };
  const result = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      ...credentials,
      name: "Ranking Owner",
      organizationName: `Ranking ${prefix}`,
      restaurantName: "مطعم صنعاء",
      branchName: "深圳总店",
      branchCode: "MAIN",
      city: "Shenzhen",
      currency: "CNY",
      timezone,
      language: "ar"
    }
  });
  assert.equal(result.status, 201);
  return { ...result.payload, credentials };
}

async function branch(server, token, name) {
  const result = await request(server, "/api/branches", {
    token,
    method: "POST",
    body: { name, code: crypto.randomUUID(), city: "Shenzhen" }
  });
  assert.equal(result.status, 201);
  return result.payload.id;
}

async function record(server, token, branchId, amounts, occurredAt = current) {
  for (const [category, amountMinor] of Object.entries(amounts)) {
    const result = await request(server, "/api/financial/entries", {
      token,
      method: "POST",
      body: {
        branchId,
        category,
        amountMinor,
        occurredAt,
        sourceType: "import",
        sourceReference: `${branchId ?? "unallocated"}:${occurredAt}:${category}`,
        evidence: { verified: true }
      }
    });
    assert.equal(result.status, 201, JSON.stringify(result.payload));
  }
}

async function login(server, credentials, organizationId, restaurantId) {
  const result = await request(server, "/api/auth/login", {
    method: "POST",
    body: { ...credentials, organizationId, restaurantId }
  });
  assert.equal(result.status, 200);
  return result.payload.token;
}

function start(t) {
  const server = app.listen(0);
  t.after(() => server.close());
  return server;
}

test("Task 5.2 ranks all five dimensions with reproducible ties and scoped financial evidence", async (t) => {
  const server = start(t);
  const account = await owner(server, "ranking-values");
  const a = account.branches[0].id;
  const b = await branch(server, account.token, "فرع نانشان");
  const c = await branch(server, account.token, "Harbor Branch");
  const d = await branch(server, account.token, "Equal Profit Branch");
  for (const [id, amounts, previousSales] of [
    [a, { sales: 10000, food_costs: 4000, labor: 1000 }, 5000],
    [b, { sales: 20000, food_costs: 7000, labor: 3000, rent: 4000 }, 16000],
    [c, { sales: 10000, food_costs: 9000, labor: 2000 }, 10000],
    [d, { sales: 10000, food_costs: 2000, labor: 3000 }, 5000]
  ]) {
    await record(server, account.token, id, { ...recordedZeroes, ...amounts });
    await record(server, account.token, id, { sales: previousSales, discounts: 0, refunds: 0 }, previous);
  }
  await record(server, account.token, null, { rent: 99999 });
  const path = `/api/branches/rankings?scope=organization&${query}`;
  const result = await request(server, path, { token: account.token });
  const repeat = await request(server, path, { token: account.token });
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, repeat.payload);
  const { rankings, branches, policy } = result.payload;
  assert.equal(result.payload.rankingVersion, "5.2-v1");
  assert.equal(result.payload.sourcePerformanceVersion, "5.1-v1");
  assert.equal(result.payload.sourceFormulaVersion, "3.7-v1");
  assert.equal(result.payload.currencyCode, "CNY");
  assert.equal(result.payload.timezone, "Asia/Shanghai");
  assert.equal(result.payload.period.current.from, "2026-08-25T16:00:00.000Z");
  assert.equal(policy.unallocatedCostsExcluded, true);
  const rows = (ranking) => ranking.items.map(({ branchId, rank, value }) => [branchId, rank, value]);
  assert.deepEqual(rows(rankings.bestPerforming), [
    [b, 1, 6000],
    [a, 2, 5000],
    [d, 2, 5000],
    [c, 4, -1000]
  ]);
  assert.deepEqual(rows(rankings.worstPerforming), [
    [c, 1, -1000],
    [a, 2, 5000],
    [d, 2, 5000],
    [b, 4, 6000]
  ]);
  assert.deepEqual(rows(rankings.fastestGrowing), [
    [a, 1, 10000],
    [d, 1, 10000],
    [b, 3, 2500],
    [c, 4, 0]
  ]);
  assert.deepEqual(rows(rankings.highestMargin), [
    [a, 1, 5000],
    [d, 1, 5000],
    [b, 3, 3000],
    [c, 4, -1000]
  ]);
  assert.deepEqual(rows(rankings.highestFoodCost), [
    [c, 1, 9000],
    [b, 2, 7000],
    [a, 3, 4000],
    [d, 4, 2000]
  ]);
  assert.deepEqual(
    rankings.highestMargin.leaders.map((item) => item.branchId),
    [a, d]
  );
  assert.equal(rankings.bestPerforming.leaders[0].branchName, "فرع نانشان");
  assert.equal(branches[0].branchName, "深圳总店");
  assert.equal(branches[2].branchName, "Harbor Branch");
  assert.equal(branches[0].growthEvidence.comparisonRevenueMinor, 5000);
  assert.equal(branches[0].lineage.current.sales[0].branchId, a);
  assert.equal(branches[0].lineage.current.sales[0].restaurantId, account.restaurant.id);
  assert.match(branches[0].lineage.comparison.sales[0].sourceReference, /2026-08-25/);
  assert.ok(!JSON.stringify(branches).includes("unallocated:"));
});

test("Task 5.2 excludes missing records, retains documented zeroes and does not crown a single branch", async (t) => {
  const server = start(t);
  const account = await owner(server, "ranking-missing");
  const complete = account.branches[0].id;
  const missingCosts = await branch(server, account.token, "Sales without costs");
  const empty = await branch(server, account.token, "Empty Branch");
  const zeroCost = await branch(server, account.token, "Verified zero food cost");
  await record(server, account.token, complete, { ...recordedZeroes, sales: 10000, food_costs: 11000 });
  await record(server, account.token, missingCosts, { sales: 1000000, discounts: 0, refunds: 0 });
  await record(server, account.token, zeroCost, { food_costs: 0 });
  const { payload } = await request(server, `/api/branches/rankings?${query}`, { token: account.token });
  const best = payload.rankings.bestPerforming;
  assert.equal(best.status, "insufficient_comparable_branches");
  assert.equal(best.eligibleCount, 1);
  assert.equal(best.excludedCount, 3);
  assert.deepEqual(best.leaders, []);
  assert.equal(best.items[0].value, -1000);
  const missing = best.excluded.find((item) => item.branchId === missingCosts);
  assert.ok(missing.reasons[0].categories.includes("food_costs"));
  assert.ok(missing.reasons[0].categories.includes("labor"));
  assert.equal(
    payload.branches.find((item) => item.branchId === missingCosts).rankingMetrics.netProfitMinor.value,
    null
  );
  assert.equal(payload.branches.find((item) => item.branchId === empty).rankingMetrics.cogsMinor.value, null);
  assert.deepEqual(
    payload.rankings.highestFoodCost.items.map((item) => [item.branchId, item.value]),
    [
      [complete, 11000],
      [zeroCost, 0]
    ]
  );
  const disabled = await request(server, "/api/branches/rankings?comparison=none", { token: account.token });
  assert.deepEqual(disabled.payload.rankings.fastestGrowing.items, []);
  assert.ok(
    disabled.payload.rankings.fastestGrowing.excluded.every((item) => item.reasons[0].code === "comparison_disabled")
  );
});

test("Task 5.2 rejects zero/negative/missing growth baselines and distinguishes contraction from growth", async (t) => {
  const server = start(t);
  const account = await owner(server, "ranking-growth");
  const zero = account.branches[0].id;
  const negative = await branch(server, account.token, "Negative Baseline");
  const missing = await branch(server, account.token, "Missing Baseline");
  const declining = await branch(server, account.token, "Declining Branch");
  const flat = await branch(server, account.token, "Flat Branch");
  const noCurrent = await branch(server, account.token, "Missing Current Records");
  for (const id of [zero, negative, missing, declining, flat]) {
    await record(server, account.token, id, { sales: 100, discounts: 0, refunds: 0 });
  }
  await record(server, account.token, zero, { sales: 0, discounts: 0, refunds: 0 }, previous);
  await record(server, account.token, negative, { sales: 100, discounts: 0, refunds: 200 }, previous);
  await record(server, account.token, declining, { sales: 200, discounts: 0, refunds: 0 }, previous);
  await record(server, account.token, flat, { sales: 100, discounts: 0, refunds: 0 }, previous);
  await record(server, account.token, noCurrent, { sales: 100, discounts: 0, refunds: 0 }, previous);
  const { payload } = await request(server, `/api/branches/rankings?${query}`, { token: account.token });
  const growth = payload.rankings.fastestGrowing;
  assert.equal(growth.status, "no_positive_growth");
  assert.deepEqual(growth.leaders, []);
  assert.deepEqual(
    growth.items.map((item) => [item.branchId, item.value]),
    [
      [flat, 0],
      [declining, -5000]
    ]
  );
  for (const id of [zero, negative]) {
    assert.ok(
      growth.excluded
        .find((item) => item.branchId === id)
        .reasons.some((reason) => reason.code === "positive_comparison_revenue_required")
    );
  }
  assert.equal(growth.excluded.find((item) => item.branchId === missing).reasons[0].period, "comparison");
  assert.equal(growth.excluded.find((item) => item.branchId === noCurrent).reasons[0].period, "current");
});

test("Task 5.2 keeps large integer growth safe and zero-revenue margins unavailable", async (t) => {
  const server = start(t);
  const account = await owner(server, "ranking-range");
  const huge = account.branches[0].id;
  await record(server, account.token, huge, { sales: Number.MAX_SAFE_INTEGER, discounts: 0, refunds: 0 });
  await record(server, account.token, huge, { sales: 1, discounts: 0, refunds: 0 }, previous);
  const result = await request(server, `/api/branches/rankings?scope=branch&branchId=${huge}&${query}`, {
    token: account.token
  });
  assert.equal(result.status, 200);
  const growth = result.payload.branches[0].rankingMetrics.revenueGrowthBps;
  assert.equal(growth.value, null);
  assert.deepEqual(growth.reasons, [{ code: "growth_outside_supported_integer_range" }]);
  const zero = await branch(server, account.token, "Zero Revenue");
  await record(server, account.token, zero, { ...recordedZeroes, food_costs: 100 });
  const noMargin = await request(server, `/api/branches/rankings?scope=branch&branchId=${zero}&${query}`, {
    token: account.token
  });
  assert.equal(noMargin.payload.branches[0].rankingMetrics.netProfitMinor.value, -100);
  assert.equal(noMargin.payload.branches[0].rankingMetrics.netMarginBps.value, null);
  assert.deepEqual(noMargin.payload.rankings.highestMargin.excluded[0].reasons, [
    { code: "positive_current_revenue_required" }
  ]);
});

test("Task 5.2 enforces tenant, restaurant, branch and role boundaries before ranking", async (t) => {
  const server = start(t);
  const account = await owner(server, "ranking-access");
  const foreign = await owner(server, "ranking-foreign");
  const main = account.branches[0].id;
  const peer = await branch(server, account.token, "Peer Branch");
  await record(server, account.token, main, { ...recordedZeroes, sales: 1000, food_costs: 100 });
  await record(server, account.token, peer, { ...recordedZeroes, sales: 2000, food_costs: 200 });
  const secondRestaurant = await request(server, "/api/restaurants", {
    token: account.token,
    method: "POST",
    body: { name: "第二餐厅", businessType: "yemeni" }
  });
  assert.equal(secondRestaurant.status, 201);
  const secondToken = await login(server, account.credentials, account.organization.id, secondRestaurant.payload.id);
  const distant = await branch(server, secondToken, "Other Restaurant Branch");
  await record(server, secondToken, distant, { ...recordedZeroes, sales: 5000, food_costs: 500 });
  const tokens = {};
  for (const role of ["viewer", "branch_manager"]) {
    const invite = await request(server, "/api/users/invite", {
      token: account.token,
      method: "POST",
      body: {
        email: `${role}-${crypto.randomUUID()}@example.test`,
        name: role,
        role,
        ...(role === "branch_manager" ? { branchId: main } : {})
      }
    });
    assert.equal(invite.status, 201);
    tokens[role] = await login(
      server,
      { email: invite.payload.email, password: invite.payload.temporaryPassword },
      account.organization.id,
      account.restaurant.id
    );
  }
  const ranked = (scope, token) =>
    request(server, `/api/branches/rankings?${query}${scope ? `&${scope}` : ""}`, { token });
  assert.equal((await ranked("", undefined)).status, 401);
  const manager = await ranked("", tokens.branch_manager);
  assert.equal(manager.payload.scope, "branch");
  assert.deepEqual(
    manager.payload.branches.map((item) => item.branchId),
    [main]
  );
  assert.deepEqual(manager.payload.rankings.bestPerforming.leaders, []);
  assert.equal((await ranked("scope=organization", tokens.branch_manager)).status, 403);
  assert.equal((await ranked("scope=restaurant", tokens.branch_manager)).status, 403);
  assert.equal((await ranked(`scope=branch&branchId=${peer}`, tokens.branch_manager)).status, 404);
  const viewer = await ranked("", tokens.viewer);
  assert.deepEqual(
    viewer.payload.branches.map((item) => item.branchId),
    [main, peer]
  );
  assert.equal((await ranked("scope=organization", tokens.viewer)).status, 403);
  assert.equal(
    (await ranked(`scope=restaurant&restaurantId=${secondRestaurant.payload.id}`, tokens.viewer)).status,
    404
  );
  assert.equal((await ranked(`scope=branch&branchId=${distant}`, tokens.viewer)).status, 404);
  const organization = await ranked("scope=organization", account.token);
  assert.deepEqual(
    organization.payload.branches.map((item) => item.branchId),
    [main, peer, distant]
  );
  assert.equal(organization.payload.rankings.bestPerforming.leaders[0].branchId, distant);
  assert.equal((await ranked(`scope=restaurant&restaurantId=${foreign.restaurant.id}`, account.token)).status, 404);
  assert.equal((await ranked(`scope=branch&branchId=${foreign.branches[0].id}`, account.token)).status, 404);
  assert.equal(
    (await ranked(`scope=branch&branchId=${main}&restaurantId=${secondRestaurant.payload.id}`, account.token)).status,
    400
  );
});

test("Task 5.2 validates filters and shares timezone-aware custom periods without widening the cohort", async (t) => {
  const server = start(t);
  const account = await owner(server, "ranking-period", "America/New_York");
  for (const filters of [
    "scope=invalid",
    "scope=branch",
    "branchId=-1",
    "period=custom",
    "period=today&from=2026-08-01T00:00:00Z",
    "period=custom&from=2026-08-02T00:00:00Z&to=2026-08-01T00:00:00Z",
    "period=month&comparison=same_weekday"
  ]) {
    const result = await request(server, `/api/branches/rankings?${filters}`, { token: account.token });
    assert.equal(result.status, 400, filters);
  }
  const dst = await request(server, "/api/branches/rankings?period=today&comparison=none&anchor=2026-03-08T12:00:00Z", {
    token: account.token
  });
  assert.equal(dst.status, 200);
  assert.deepEqual(dst.payload.period.current, { from: "2026-03-08T05:00:00.000Z", to: "2026-03-09T03:59:59.999Z" });
  assert.ok(
    Object.values(dst.payload.rankings).every((ranking) => ranking.items.length === 0 && ranking.leaders.length === 0)
  );
  const custom = await request(
    server,
    "/api/branches/rankings?period=custom&comparison=previous_period&from=2026-08-01T00:00:00%2B08:00&to=2026-08-02T00:00:00%2B08:00",
    { token: account.token }
  );
  assert.equal(custom.status, 200);
  assert.deepEqual(custom.payload.period.current, { from: "2026-07-31T16:00:00.000Z", to: "2026-08-01T16:00:00.000Z" });
  assert.equal(custom.payload.period.comparison.to, "2026-07-31T15:59:59.999Z");
});
