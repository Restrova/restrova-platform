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
  const credentials = { email: `${prefix}-${stamp}@example.test`, password: "branch-report-password-123" };
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
      currency: "CNY",
      timezone: "Asia/Shanghai",
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

test("Task 3.4 reconciles independent branches, unallocated costs, restaurants, and the organization", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "branch-report");
  const restaurantA = owner.restaurant.id;
  const branchA1 = owner.branches[0].id;
  const branchA2 = await createBranch(server, owner.token, "فرع نانشان", `A2-${Date.now()}`);
  const restaurantBResponse = await request(server, "/api/restaurants", {
    token: owner.token,
    method: "POST",
    body: { name: "第二餐厅", businessType: "yemeni" }
  });
  assert.equal(restaurantBResponse.status, 201);
  const restaurantB = restaurantBResponse.payload.id;
  const ownerB = await login(server, owner.credentials, owner.organization.id, restaurantB);
  const branchB1 = await createBranch(server, ownerB.token, "Guangzhou Branch", `B1-${Date.now()}`);
  const current = "2026-08-26T12:00:00+08:00";
  const previous = "2026-08-25T12:00:00+08:00";

  await addEntry(server, owner.token, {
    branchId: branchA1,
    category: "sales",
    amountMinor: 10000,
    reference: "ORDER-1",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    branchId: branchA1,
    category: "sales",
    amountMinor: 8000,
    reference: "ORDER-PREVIOUS",
    occurredAt: previous
  });
  await addEntry(server, owner.token, {
    branchId: branchA1,
    category: "food_costs",
    amountMinor: 3000,
    reference: "FOOD-A1",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    branchId: branchA2.id,
    category: "sales",
    amountMinor: 7000,
    reference: "ORDER-1",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    branchId: branchA2.id,
    category: "labor",
    amountMinor: 2000,
    reference: "LABOR-A2",
    occurredAt: current
  });
  await addEntry(server, owner.token, {
    category: "rent",
    amountMinor: 1000,
    reference: "RENT-A",
    occurredAt: current
  });
  await addEntry(server, ownerB.token, {
    branchId: branchB1.id,
    category: "sales",
    amountMinor: 5000,
    reference: "ORDER-1",
    occurredAt: current
  });
  await addEntry(server, ownerB.token, {
    category: "rent",
    amountMinor: 500,
    reference: "RENT-B",
    occurredAt: current
  });

  const query = "scope=organization&period=today&comparison=previous_period&anchor=2026-08-26T12:00:00Z";
  const report = await request(server, `/api/financial/report?${query}`, { token: owner.token });

  assert.equal(report.status, 200);
  assert.equal(report.payload.reportVersion, "3.4-v1");
  assert.equal(report.payload.scope, "organization");
  assert.equal(report.payload.restaurants.length, 2);
  assert.equal(report.payload.financials.current.metrics.revenueMinor, 22000);
  assert.equal(report.payload.financials.current.metrics.orderCount, 3);
  assert.equal(report.payload.financials.current.metrics.netProfitMinor, 15500);
  assert.equal(report.payload.financials.comparison.metrics.revenueMinor, 8000);
  assert.equal(report.payload.financials.changes.revenueMinor, 14000);
  assert.equal(report.payload.reconciliation.current.reconciled, true);
  assert.equal(report.payload.reconciliation.comparison.reconciled, true);

  const firstRestaurant = report.payload.restaurants.find((restaurant) => restaurant.id === restaurantA);
  assert.equal(firstRestaurant.name, "مطعم صنعاء");
  assert.equal(firstRestaurant.financials.current.metrics.revenueMinor, 17000);
  assert.equal(firstRestaurant.unallocated.current.metrics.operatingExpensesMinor, 1000);
  assert.equal(firstRestaurant.branches.length, 2);
  assert.equal(firstRestaurant.reconciliation.current.reconciled, true);
  assert.deepEqual(report.payload.financials.current.lineage.sales, [
    { sourceType: "import", sourceReference: "ORDER-1", restaurantId: restaurantA, branchId: branchA1 },
    { sourceType: "import", sourceReference: "ORDER-1", restaurantId: restaurantA, branchId: branchA2.id },
    { sourceType: "import", sourceReference: "ORDER-1", restaurantId: restaurantB, branchId: branchB1.id }
  ]);

  const branch = await request(
    server,
    `/api/financial/report?scope=branch&branchId=${branchA1}&period=today&comparison=none&anchor=2026-08-26T12:00:00Z`,
    { token: owner.token }
  );
  assert.equal(branch.status, 200);
  assert.equal(branch.payload.financials.current.metrics.revenueMinor, 10000);
  assert.equal(branch.payload.financials.current.metrics.netProfitMinor, 7000);
  assert.equal(branch.payload.financials.current.metrics.operatingExpensesMinor, 0);
  assert.equal(branch.payload.restaurants[0].branches[0].name, "深圳总店");
});

test("Task 3.4 enforces owner, viewer, manager, restaurant, branch, and tenant boundaries", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "branch-access");
  const foreign = await registerOwner(server, "branch-foreign");
  const branchA1 = owner.branches[0].id;
  const branchA2 = await createBranch(server, owner.token, "Manager Branch", `MANAGER-${Date.now()}`);
  const managerInvite = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `report-manager-${Date.now()}@example.test`,
      name: "Report Manager",
      role: "branch_manager",
      branchId: branchA2.id
    }
  });
  const viewerInvite = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: { email: `report-viewer-${Date.now()}@example.test`, name: "Report Viewer", role: "viewer" }
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

  const managerDefault = await request(server, "/api/financial/report?comparison=none", {
    token: manager.token
  });
  const managerOrganization = await request(server, "/api/financial/report?scope=organization", {
    token: manager.token
  });
  const managerOtherBranch = await request(server, `/api/financial/report?scope=branch&branchId=${branchA1}`, {
    token: manager.token
  });
  const viewerOrganization = await request(server, "/api/financial/report?scope=organization", {
    token: viewer.token
  });
  const foreignBranch = await request(server, `/api/financial/report?scope=branch&branchId=${foreign.branches[0].id}`, {
    token: owner.token
  });
  const mismatched = await request(
    server,
    `/api/financial/report?scope=branch&restaurantId=${foreign.restaurant.id}&branchId=${branchA1}`,
    { token: owner.token }
  );

  assert.equal(managerDefault.status, 200);
  assert.equal(managerDefault.payload.scope, "branch");
  assert.equal(managerDefault.payload.financials.current.scope.branchId, branchA2.id);
  assert.equal(managerOrganization.status, 403);
  assert.equal(managerOtherBranch.status, 404);
  assert.equal(viewerOrganization.status, 403);
  assert.equal(foreignBranch.status, 404);
  assert.equal(mismatched.status, 400);
});

test("Task 3.4 reports empty branches honestly and validates scope combinations", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "branch-edge");
  const branchId = owner.branches[0].id;

  const empty = await request(
    server,
    `/api/financial/report?scope=branch&branchId=${branchId}&period=custom&comparison=none&from=2026-08-01T00:00:00%2B08:00&to=2026-08-31T23:59:59%2B08:00`,
    { token: owner.token }
  );
  const missingBranch = await request(server, "/api/financial/report?scope=branch", { token: owner.token });
  const invalidOrganizationFilter = await request(
    server,
    `/api/financial/report?scope=organization&restaurantId=${owner.restaurant.id}`,
    { token: owner.token }
  );

  assert.equal(empty.status, 200);
  assert.equal(empty.payload.financials.current.completeness.hasData, false);
  assert.equal(empty.payload.financials.current.completeness.entryCount, 0);
  assert.equal(empty.payload.financials.current.metrics.revenueMinor, 0);
  assert.equal(empty.payload.financials.current.metrics.netMarginBps, null);
  assert.equal(missingBranch.status, 400);
  assert.equal(invalidOrganizationFilter.status, 400);
});
