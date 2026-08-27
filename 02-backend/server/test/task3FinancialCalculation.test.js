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

async function registerOwner(server, prefix) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const response = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: `${prefix} Owner`,
      email: `${prefix}-${stamp}@example.test`,
      password: "calculation-password-123",
      organizationName: `${prefix} Organization ${stamp}`,
      restaurantName: `${prefix} Restaurant ${stamp}`,
      branchName: `${prefix} Main`,
      branchCode: `${prefix.toUpperCase()}-01`,
      city: "Riyadh",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      language: "en"
    }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

async function addEntry(server, token, branchId, category, amountMinor, sourceReference, occurredAt) {
  const response = await request(server, "/api/financial/entries", {
    token,
    method: "POST",
    body: {
      category,
      amountMinor,
      branchId,
      occurredAt,
      sourceType: "import",
      sourceReference,
      evidence: { verified: true }
    }
  });
  assert.equal(response.status, 201);
}

test("Task 3.2 calculates every core financial metric with deterministic integer rounding", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "calculation");
  const branchId = owner.branches[0].id;
  const occurredAt = "2026-08-25T19:00:00+08:00";
  const facts = [
    ["sales", 10000, "ORDER-1"],
    ["sales", 5000, "ORDER-2"],
    ["discounts", 1000, "DISCOUNT-1"],
    ["refunds", 500, "REFUND-1"],
    ["food_costs", 4000, "FOOD-1"],
    ["packaging", 500, "PACKAGING-1"],
    ["delivery_commissions", 1000, "COMMISSION-1"],
    ["labor", 2000, "LABOR-1"],
    ["rent", 1000, "RENT-1"],
    ["utilities", 500, "UTILITIES-1"],
    ["marketing", 250, "MARKETING-1"],
    ["miscellaneous_operating_expenses", 250, "MISC-1"]
  ];

  for (const [category, amountMinor, sourceReference] of facts) {
    await addEntry(server, owner.token, branchId, category, amountMinor, sourceReference, occurredAt);
  }

  const result = await request(server, `/api/financial/calculate?branchId=${branchId}`, {
    token: owner.token
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.formulaVersion, "3.7-v1");
  assert.deepEqual(result.payload.scope, {
    organizationId: owner.organization.id,
    restaurantId: owner.restaurant.id,
    branchId,
    currencyCode: "SAR"
  });
  assert.deepEqual(result.payload.metrics, {
    grossSalesMinor: 15000,
    discountsMinor: 1000,
    refundsMinor: 500,
    revenueMinor: 13500,
    cogsMinor: 4000,
    grossProfitMinor: 9500,
    grossMarginBps: 7037,
    contributionProfitMinor: 8000,
    contributionMarginBps: 5926,
    operatingExpensesMinor: 4000,
    operatingProfitMinor: 4000,
    netProfitMinor: 4000,
    netMarginBps: 2963,
    orderCount: 2,
    averageOrderValueMinor: 6750,
    totalCostsMinor: 9500,
    costPerOrderMinor: 4750
  });
  assert.equal(result.payload.completeness.hasData, true);
  assert.equal(result.payload.completeness.entryCount, 12);
  assert.deepEqual(result.payload.completeness.missingCategories, []);
  assert.deepEqual(result.payload.lineage.sales, [
    { sourceType: "import", sourceReference: "ORDER-1" },
    { sourceType: "import", sourceReference: "ORDER-2" }
  ]);
  assert.match(result.payload.assumptions.join(" "), /Net profit equals operating profit/);
});

test("Task 3.2 reports incomplete data honestly and validates custom query boundaries", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "calculation-edge");
  const branchId = owner.branches[0].id;

  const empty = await request(server, `/api/financial/calculate?branchId=${branchId}`, {
    token: owner.token
  });
  assert.equal(empty.status, 200);
  assert.equal(empty.payload.completeness.hasData, false);
  assert.equal(empty.payload.completeness.missingCategories.length, 11);
  assert.equal(empty.payload.metrics.revenueMinor, 0);
  assert.equal(empty.payload.metrics.grossMarginBps, null);
  assert.equal(empty.payload.metrics.averageOrderValueMinor, null);
  assert.equal(empty.payload.metrics.costPerOrderMinor, null);

  await addEntry(server, owner.token, branchId, "sales", 12000, "AUGUST-ORDER", "2026-08-10T12:00:00+08:00");
  await addEntry(server, owner.token, branchId, "sales", 9000, "SEPTEMBER-ORDER", "2026-09-10T12:00:00+08:00");

  const august = await request(
    server,
    `/api/financial/calculate?branchId=${branchId}&from=2026-08-01T00:00:00%2B08:00&to=2026-08-31T23:59:59%2B08:00`,
    { token: owner.token }
  );
  const reversed = await request(
    server,
    "/api/financial/calculate?from=2026-09-01T00:00:00%2B08:00&to=2026-08-01T00:00:00%2B08:00",
    { token: owner.token }
  );

  assert.equal(august.status, 200);
  assert.equal(august.payload.metrics.revenueMinor, 12000);
  assert.equal(august.payload.metrics.orderCount, 1);
  assert.deepEqual(august.payload.lineage.sales, [{ sourceType: "import", sourceReference: "AUGUST-ORDER" }]);
  assert.equal(reversed.status, 400);
});

test("Task 3.2 calculations remain tenant- and branch-scoped", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "calculation-scope");
  const foreignOwner = await registerOwner(server, "calculation-foreign");
  const firstBranchId = owner.branches[0].id;
  const secondBranch = await request(server, "/api/branches", {
    token: owner.token,
    method: "POST",
    body: { name: "Second Branch", code: `SECOND-${Date.now()}`, city: "Jeddah" }
  });
  assert.equal(secondBranch.status, 201);

  await addEntry(server, owner.token, firstBranchId, "sales", 10000, "FIRST-SALE", "2026-08-25T12:00:00+08:00");
  await addEntry(
    server,
    owner.token,
    secondBranch.payload.id,
    "sales",
    7000,
    "SECOND-SALE",
    "2026-08-25T12:00:00+08:00"
  );
  await addEntry(server, owner.token, null, "rent", 3000, "RESTAURANT-RENT", "2026-08-25T12:00:00+08:00");
  await addEntry(
    server,
    foreignOwner.token,
    foreignOwner.branches[0].id,
    "sales",
    99000,
    "FOREIGN-SALE",
    "2026-08-25T12:00:00+08:00"
  );

  const consolidated = await request(server, "/api/financial/calculate", { token: owner.token });
  assert.equal(consolidated.payload.metrics.revenueMinor, 17000);
  assert.equal(consolidated.payload.metrics.operatingExpensesMinor, 3000);
  assert.equal(consolidated.payload.metrics.netProfitMinor, 14000);

  const invited = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `calculation-manager-${Date.now()}@example.test`,
      name: "Calculation Manager",
      role: "branch_manager",
      branchId: secondBranch.payload.id
    }
  });
  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: invited.payload.email, password: invited.payload.temporaryPassword }
  });
  assert.equal(login.status, 200);

  const scoped = await request(server, "/api/financial/calculate", { token: login.payload.token });
  const blockedBranch = await request(server, `/api/financial/calculate?branchId=${firstBranchId}`, {
    token: login.payload.token
  });
  const blockedTenant = await request(server, `/api/financial/calculate?branchId=${foreignOwner.branches[0].id}`, {
    token: owner.token
  });

  assert.equal(scoped.status, 200);
  assert.equal(scoped.payload.scope.branchId, secondBranch.payload.id);
  assert.equal(scoped.payload.metrics.revenueMinor, 7000);
  assert.equal(scoped.payload.metrics.operatingExpensesMinor, 0);
  assert.deepEqual(scoped.payload.lineage.sales, [{ sourceType: "import", sourceReference: "SECOND-SALE" }]);
  assert.equal(blockedBranch.status, 404);
  assert.equal(blockedTenant.status, 404);
});
