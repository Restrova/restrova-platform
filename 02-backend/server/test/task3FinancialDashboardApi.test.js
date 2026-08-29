import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");

async function request(server, path, { token, method = "GET", body } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

async function registerOwner(server, prefix, timezone = "Asia/Shanghai") {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const credentials = { email: `${prefix}-${stamp}@example.test`, password: "dashboard-password-123" };
  const response = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: `${prefix} Owner`,
      ...credentials,
      organizationName: `${prefix} Organization ${stamp}`,
      restaurantName: "مطعم صنعاء",
      branchName: "深圳总店",
      branchCode: `${prefix.toUpperCase()}-01`,
      city: "Shenzhen",
      currency: timezone === "America/New_York" ? "USD" : "CNY",
      timezone,
      language: "ar"
    }
  });
  assert.equal(response.status, 201);
  return { ...response.payload, credentials };
}

async function createBranch(server, token, name, code) {
  const response = await request(server, "/api/branches", {
    token,
    method: "POST",
    body: { name, code, city: "Shenzhen" }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

async function addEntry(server, token, { branchId = null, category, amountMinor, reference, occurredAt }) {
  const response = await request(server, "/api/financial/entries", {
    token,
    method: "POST",
    body: {
      branchId,
      category,
      amountMinor,
      occurredAt,
      sourceType: "import",
      sourceReference: reference,
      evidence: { verified: true }
    }
  });
  assert.equal(response.status, 201);
}

async function login(server, credentials, organizationId, restaurantId) {
  const response = await request(server, "/api/auth/login", {
    method: "POST",
    body: { ...credentials, organizationId, restaurantId }
  });
  assert.equal(response.status, 200);
  return response.payload;
}

test("Task 3.5 returns trustworthy dashboard metrics, trends, comparisons, costs, and branch ranking", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "dashboard-api");
  const firstBranchId = owner.branches[0].id;
  const secondBranch = await createBranch(server, owner.token, "فرع نانشان", `NS-${Date.now()}`);
  const current = "2026-08-26T12:00:00+08:00";
  const previous = "2026-08-25T12:00:00+08:00";

  await addEntry(server, owner.token, {
    branchId: firstBranchId,
    category: "sales",
    amountMinor: 10000,
    reference: "DASH-A-SALE",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    branchId: firstBranchId,
    category: "food_costs",
    amountMinor: 3000,
    reference: "DASH-A-FOOD",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    branchId: secondBranch.id,
    category: "sales",
    amountMinor: 7000,
    reference: "DASH-B-SALE",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    branchId: secondBranch.id,
    category: "labor",
    amountMinor: 2000,
    reference: "DASH-B-LABOR",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    category: "rent",
    amountMinor: 1000,
    reference: "DASH-UNALLOCATED-RENT",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    branchId: firstBranchId,
    category: "sales",
    amountMinor: 8000,
    reference: "DASH-PREVIOUS-SALE",
    occurredAt: previous
  });

  const dashboard = await request(
    server,
    "/api/financial/dashboard?scope=organization&period=today&comparison=previous_period&anchor=2026-08-26T12:00:00Z",
    { token: owner.token }
  );

  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.payload.dashboardVersion, "3.5-v1");
  assert.equal(dashboard.payload.scope, "organization");
  assert.equal(dashboard.payload.currencyCode, "CNY");
  assert.deepEqual(dashboard.payload.summary.revenue, {
    grossSalesMinor: 17000,
    discountsMinor: 0,
    refundsMinor: 0,
    revenueMinor: 17000
  });
  assert.equal(dashboard.payload.summary.costs.foodCostsMinor, 3000);
  assert.equal(dashboard.payload.summary.costs.laborCostsMinor, 2000);
  assert.equal(dashboard.payload.summary.costs.rentCostsMinor, 1000);
  assert.equal(dashboard.payload.summary.costs.totalCostsMinor, 6000);
  assert.equal(dashboard.payload.summary.profit.netProfitMinor, 11000);
  assert.equal(dashboard.payload.summary.marginsBps.netMarginBps, 6471);
  assert.equal(dashboard.payload.comparison.metrics.revenueMinor, 8000);
  assert.equal(dashboard.payload.comparison.changes.revenueMinor, 9000);
  assert.equal(dashboard.payload.reconciliation.current.reconciled, true);

  assert.equal(dashboard.payload.trends.granularity, "hour");
  assert.equal(dashboard.payload.trends.points.length, 24);
  const noon = dashboard.payload.trends.points.find((point) => point.label === "2026-08-26T12:00");
  assert.equal(noon.metrics.revenueMinor, 17000);
  assert.equal(noon.metrics.totalCostsMinor, 6000);
  assert.equal(noon.completeness.entryCount, 5);
  assert.equal(noon.lineage.sales.length, 2);

  assert.equal(dashboard.payload.branchRanking.metric, "netProfitMinor");
  assert.equal(dashboard.payload.branchRanking.unallocatedCostsExcluded, true);
  assert.deepEqual(
    dashboard.payload.branchRanking.items.map((branch) => [
      branch.rank,
      branch.branchName,
      branch.metrics.netProfitMinor
    ]),
    [
      [1, "深圳总店", 7000],
      [2, "فرع نانشان", 5000]
    ]
  );
  assert.deepEqual(dashboard.payload.summary.lineage.sales, [
    {
      sourceType: "import",
      sourceReference: "DASH-A-SALE",
      restaurantId: owner.restaurant.id,
      branchId: firstBranchId
    },
    {
      sourceType: "import",
      sourceReference: "DASH-B-SALE",
      restaurantId: owner.restaurant.id,
      branchId: secondBranch.id
    }
  ]);
});

test("Task 3.5 enforces organization, restaurant, branch, role, and tenant boundaries", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "dashboard-access");
  const foreign = await registerOwner(server, "dashboard-foreign");
  const managerBranch = await createBranch(server, owner.token, "Manager Branch", `MGR-${Date.now()}`);
  const managerInvite = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `dashboard-manager-${Date.now()}@example.test`,
      name: "Dashboard Manager",
      role: "branch_manager",
      branchId: managerBranch.id
    }
  });
  const viewerInvite = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: { email: `dashboard-viewer-${Date.now()}@example.test`, name: "Dashboard Viewer", role: "viewer" }
  });
  const manager = await login(
    server,
    { email: managerInvite.payload.email, password: managerInvite.payload.temporaryPassword },
    owner.organization.id,
    owner.restaurant.id
  );
  const viewer = await login(
    server,
    { email: viewerInvite.payload.email, password: viewerInvite.payload.temporaryPassword },
    owner.organization.id,
    owner.restaurant.id
  );

  const managerDefault = await request(server, "/api/financial/dashboard?comparison=none", {
    token: manager.token
  });
  const managerOrganization = await request(server, "/api/financial/dashboard?scope=organization", {
    token: manager.token
  });
  const managerOtherBranch = await request(
    server,
    `/api/financial/dashboard?scope=branch&branchId=${owner.branches[0].id}`,
    { token: manager.token }
  );
  const viewerRestaurant = await request(server, "/api/financial/dashboard?scope=restaurant&comparison=none", {
    token: viewer.token
  });
  const viewerOrganization = await request(server, "/api/financial/dashboard?scope=organization", {
    token: viewer.token
  });
  const foreignBranch = await request(
    server,
    `/api/financial/dashboard?scope=branch&branchId=${foreign.branches[0].id}`,
    { token: owner.token }
  );

  assert.equal(managerDefault.status, 200);
  assert.equal(managerDefault.payload.scope, "branch");
  assert.equal(managerDefault.payload.branchRanking.items.length, 1);
  assert.equal(managerDefault.payload.branchRanking.items[0].branchId, managerBranch.id);
  assert.equal(managerOrganization.status, 403);
  assert.equal(managerOtherBranch.status, 404);
  assert.equal(viewerRestaurant.status, 200);
  assert.equal(viewerOrganization.status, 403);
  assert.equal(foreignBranch.status, 404);
});

test("Task 3.5 reports empty data honestly and produces DST-safe trend buckets", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "dashboard-dst", "America/New_York");
  const branchId = owner.branches[0].id;

  const dashboard = await request(
    server,
    `/api/financial/dashboard?scope=branch&branchId=${branchId}&period=today&comparison=none&anchor=2026-03-08T12:00:00Z`,
    { token: owner.token }
  );
  const invalidScope = await request(
    server,
    `/api/financial/dashboard?scope=organization&restaurantId=${owner.restaurant.id}`,
    { token: owner.token }
  );

  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.payload.currencyCode, "USD");
  assert.equal(dashboard.payload.summary.completeness.hasData, false);
  assert.equal(dashboard.payload.summary.profit.netProfitMinor, 0);
  assert.equal(dashboard.payload.summary.marginsBps.netMarginBps, null);
  assert.equal(dashboard.payload.comparison, null);
  assert.equal(dashboard.payload.trends.granularity, "hour");
  assert.equal(dashboard.payload.trends.points.length, 23);
  assert.equal(
    dashboard.payload.trends.points.some((point) => point.label === "2026-03-08T02:00"),
    false
  );
  assert.equal(
    dashboard.payload.trends.points.every((point) => point.completeness.hasData === false),
    true
  );
  assert.equal(dashboard.payload.branchRanking.items[0].rank, null);
  assert.equal(invalidScope.status, 400);
});

test("Task 5.1 returns complete branch economics and deterministic period growth", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "branch-performance");
  const branchId = owner.branches[0].id;
  const current = "2026-08-26T12:00:00+08:00";
  const previous = "2026-08-25T12:00:00+08:00";
  for (const [category, amountMinor, reference] of [
    ["sales", 10000, "PERF-SALE-1"],
    ["sales", 5000, "PERF-SALE-2"],
    ["discounts", 1000, "PERF-DISCOUNT"],
    ["refunds", 500, "PERF-REFUND"],
    ["food_costs", 4000, "PERF-FOOD"],
    ["labor", 2000, "PERF-LABOR"]
  ]) {
    await addEntry(server, owner.token, { branchId, category, amountMinor, reference, occurredAt: current });
  }
  await addEntry(server, owner.token, {
    branchId,
    category: "sales",
    amountMinor: 10000,
    reference: "PERF-PREV-SALE",
    occurredAt: previous
  });
  await addEntry(server, owner.token, {
    branchId,
    category: "food_costs",
    amountMinor: 3000,
    reference: "PERF-PREV-FOOD",
    occurredAt: previous
  });

  const result = await request(
    server,
    `/api/branches/performance?scope=restaurant&period=today&comparison=previous_period&anchor=2026-08-26T12:00:00Z`,
    { token: owner.token }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.performanceVersion, "5.1-v1");
  assert.equal(result.payload.sourceFormulaVersion, "3.7-v1");
  assert.equal(result.payload.currencyCode, "CNY");
  const branch = result.payload.branches[0];
  assert.equal(branch.branchName, "深圳总店");
  assert.deepEqual(branch.metrics.revenue, { grossSalesMinor: 15000, revenueMinor: 13500 });
  assert.deepEqual(branch.metrics.profit, {
    grossProfitMinor: 9500,
    contributionProfitMinor: 9500,
    operatingProfitMinor: 7500,
    netProfitMinor: 7500
  });
  assert.equal(branch.metrics.marginsBps.netMarginBps, 5556);
  assert.deepEqual(branch.metrics.orders, { orderCount: 2, averageOrderValueMinor: 6750 });
  assert.deepEqual(branch.metrics.costs, {
    cogsMinor: 4000,
    operatingExpensesMinor: 2000,
    totalCostsMinor: 6000,
    costPerOrderMinor: 3000
  });
  assert.deepEqual(branch.metrics.refunds, { refundsMinor: 500, refundRateBps: 333 });
  assert.deepEqual(branch.metrics.discounts, { discountsMinor: 1000, discountRateBps: 667 });
  assert.deepEqual(branch.growth.revenue, {
    current: 13500,
    previous: 10000,
    change: 3500,
    changeBps: 3500,
    limitation: null
  });
  assert.equal(branch.growth.netProfit.changeBps, 714);
  assert.equal(branch.growth.orders.changeBps, 10000);
  assert.equal(branch.lineage.current.sales.length, 2);
  assert.equal(branch.lineage.comparison.sales[0].sourceReference, "PERF-PREV-SALE");
  assert.deepEqual(result.payload.completeness, {
    totalBranches: 1,
    branchesWithCurrentData: 1,
    branchesWithComparisonData: 1
  });
});

test("Task 5.1 keeps zero-baseline growth honest and enforces role and tenant scope", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "branch-performance-access");
  const foreign = await registerOwner(server, "branch-performance-foreign");
  const branchId = owner.branches[0].id;
  const invite = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `performance-manager-${Date.now()}@example.test`,
      name: "Performance Manager",
      role: "branch_manager",
      branchId
    }
  });
  const manager = await login(
    server,
    { email: invite.payload.email, password: invite.payload.temporaryPassword },
    owner.organization.id,
    owner.restaurant.id
  );
  await addEntry(server, owner.token, {
    branchId,
    category: "sales",
    amountMinor: 5000,
    reference: "ZERO-BASE-CURRENT",
    occurredAt: "2026-08-26T12:00:00+08:00"
  });

  const scoped = await request(
    server,
    "/api/branches/performance?period=today&comparison=previous_period&anchor=2026-08-26T12:00:00Z",
    { token: manager.token }
  );
  const widened = await request(server, "/api/branches/performance?scope=organization", { token: manager.token });
  const otherBranch = await request(
    server,
    `/api/branches/performance?scope=branch&branchId=${foreign.branches[0].id}`,
    { token: owner.token }
  );
  const noComparison = await request(
    server,
    `/api/branches/performance?scope=branch&branchId=${branchId}&period=today&comparison=none&anchor=2026-08-26T12:00:00Z`,
    { token: owner.token }
  );

  assert.equal(scoped.status, 200);
  assert.equal(scoped.payload.scope, "branch");
  assert.equal(scoped.payload.branches.length, 1);
  assert.equal(scoped.payload.branches[0].branchId, branchId);
  assert.deepEqual(scoped.payload.branches[0].growth.revenue, {
    current: 5000,
    previous: 0,
    change: 5000,
    changeBps: null,
    limitation: "percentage_growth_unavailable_with_zero_baseline"
  });
  assert.equal(widened.status, 403);
  assert.equal(otherBranch.status, 404);
  assert.equal(noComparison.status, 200);
  assert.equal(noComparison.payload.branches[0].growth.comparisonAvailable, false);
  assert.equal(noComparison.payload.branches[0].growth.revenue, null);
});
