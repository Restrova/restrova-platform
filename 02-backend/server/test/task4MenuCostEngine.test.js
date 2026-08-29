import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { db } = await import("../src/db.js");
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
      password: "menu-cost-password-123",
      organizationName: `${prefix} Organization ${stamp}`,
      restaurantName: `${prefix} Restaurant ${stamp}`,
      branchName: `${prefix} Main`,
      branchCode: `${prefix.toUpperCase()}-01`,
      city: "Riyadh",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      language: "ar"
    }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

function insertCatalog(owner, { code, name, priceMinor, active = 1 }) {
  return Number(
    db
      .prepare(
        `INSERT INTO catalog_items(
          organization_id,restaurant_id,item_code,name,category,selling_price_minor,active
        ) VALUES (?,?,?,?,?,?,?)`
      )
      .run(owner.organization.id, owner.restaurant.id, code, name, "Main", priceMinor, active).lastInsertRowid
  );
}

function insertCost(owner, itemId, branchId, foodMinor, packagingMinor, effectiveFrom) {
  return Number(
    db
      .prepare(
        `INSERT INTO item_costs(
          organization_id,restaurant_id,branch_id,catalog_item_id,scope_key,
          direct_food_cost_minor,packaging_cost_minor,effective_from
        ) VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        owner.organization.id,
        owner.restaurant.id,
        branchId,
        itemId,
        branchId ? `branch:${branchId}` : "restaurant",
        foodMinor,
        packagingMinor,
        effectiveFrom
      ).lastInsertRowid
  );
}

function insertDeliverySale(owner, itemId, branchId, suffix, grossMinor, commissionMinor, createdAt) {
  return Number(
    db
      .prepare(
        `INSERT INTO sales_lines(
          organization_id,restaurant_id,branch_id,catalog_item_id,external_order_id,external_line_id,
          created_at,channel,quantity,gross_sales_minor,discount_minor,refund_amount_minor,
          delivery_commission_minor
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        owner.organization.id,
        owner.restaurant.id,
        branchId,
        itemId,
        `ORDER-${suffix}`,
        `LINE-${suffix}`,
        createdAt,
        "delivery",
        1,
        grossMinor,
        0,
        0,
        commissionMinor
      ).lastInsertRowid
  );
}

test("Task 4.1 calculates evidence-backed item contribution with deterministic rounding", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "menu-cost-formula");
  const branchId = owner.branches[0].id;
  const code = `MANDI-${Date.now()}`;
  const itemId = insertCatalog(owner, { code, name: "مندي دجاج", priceMinor: 5000 });
  insertCost(owner, itemId, null, 2000, 200, "2026-07-01T00:00:00.000Z");
  const branchCostId = insertCost(owner, itemId, branchId, 2400, 150, "2026-08-01T00:00:00.000Z");
  insertCost(owner, itemId, branchId, 2600, 200, "2026-09-01T00:00:00.000Z");
  insertDeliverySale(owner, itemId, branchId, `${code}-1`, 10000, 1500, "2026-08-10T10:00:00.000Z");
  insertDeliverySale(owner, itemId, branchId, `${code}-2`, 5000, 500, "2026-08-11T10:00:00.000Z");

  const result = await request(
    server,
    `/api/menu/costs?branchId=${branchId}&itemCode=${code.toLowerCase()}&asOf=2026-08-20T00:00:00.000Z`,
    { token: owner.token }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.formulaVersion, "4.1-v1");
  assert.equal(result.payload.amountStorage, "integer_minor_units");
  assert.equal(result.payload.percentageStorage, "integer_basis_points");
  assert.deepEqual(result.payload.scope, {
    organizationId: owner.organization.id,
    restaurantId: owner.restaurant.id,
    branchId,
    currencyCode: "SAR"
  });
  assert.equal(result.payload.items.length, 1);
  assert.equal(result.payload.items[0].name, "مندي دجاج");
  assert.deepEqual(result.payload.items[0].metrics, {
    sellingPriceMinor: 5000,
    foodCostMinor: 2400,
    packagingMinor: 150,
    commissionMinor: 667,
    commissionRateBps: 1333,
    contributionProfitMinor: 1783,
    contributionMarginBps: 3566
  });
  assert.deepEqual(result.payload.items[0].completeness, {
    ready: true,
    hasCostRecord: true,
    hasCommissionEvidence: true,
    missingInputs: []
  });
  assert.equal(result.payload.items[0].lineage.costs.sourceId, branchCostId);
  assert.equal(result.payload.items[0].lineage.costs.scope, "branch");
  assert.equal(result.payload.items[0].lineage.commission.lineCount, 2);
  assert.equal(result.payload.items[0].lineage.commission.grossSalesMinor, 15000);
  assert.equal(result.payload.items[0].lineage.commission.recordedCommissionMinor, 2000);
});

test("Task 4.1 applies restaurant fallback and reports missing evidence without invented zeroes", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "menu-cost-completeness");
  const secondBranch = await request(server, "/api/branches", {
    token: owner.token,
    method: "POST",
    body: { name: "Jeddah", code: `JED-${Date.now()}`, city: "Jeddah" }
  });
  assert.equal(secondBranch.status, 201);

  const readyCode = `TEA-${Date.now()}`;
  const readyItemId = insertCatalog(owner, { code: readyCode, name: "也门奶茶", priceMinor: 5000 });
  const restaurantCostId = insertCost(owner, readyItemId, null, 2000, 200, "2026-07-01T00:00:00.000Z");
  insertDeliverySale(
    owner,
    readyItemId,
    secondBranch.payload.id,
    `${readyCode}-zero`,
    5000,
    0,
    "2026-08-10T10:00:00.000Z"
  );
  const missingCode = `MISSING-${Date.now()}`;
  insertCatalog(owner, { code: missingCode, name: "No evidence", priceMinor: 3200 });
  insertCatalog(owner, { code: `INACTIVE-${Date.now()}`, name: "Inactive", priceMinor: 1000, active: 0 });

  const ready = await request(
    server,
    `/api/menu/costs?branchId=${secondBranch.payload.id}&itemCode=${readyCode}&asOf=2026-08-20T00:00:00.000Z`,
    { token: owner.token }
  );
  assert.equal(ready.status, 200);
  assert.equal(ready.payload.items[0].lineage.costs.sourceId, restaurantCostId);
  assert.equal(ready.payload.items[0].lineage.costs.scope, "restaurant");
  assert.equal(ready.payload.items[0].metrics.commissionMinor, 0);
  assert.equal(ready.payload.items[0].metrics.commissionRateBps, 0);
  assert.equal(ready.payload.items[0].metrics.contributionProfitMinor, 2800);
  assert.equal(ready.payload.items[0].completeness.ready, true);

  const missing = await request(server, `/api/menu/costs?itemCode=${missingCode}`, { token: owner.token });
  assert.equal(missing.status, 200);
  assert.equal(missing.payload.items[0].metrics.foodCostMinor, null);
  assert.equal(missing.payload.items[0].metrics.packagingMinor, null);
  assert.equal(missing.payload.items[0].metrics.commissionMinor, null);
  assert.equal(missing.payload.items[0].metrics.contributionProfitMinor, null);
  assert.deepEqual(missing.payload.items[0].completeness.missingInputs, [
    "cost_record",
    "delivery_commission_evidence"
  ]);

  const all = await request(server, "/api/menu/costs?status=all&limit=1&offset=0", { token: owner.token });
  assert.equal(all.status, 200);
  assert.equal(all.payload.pagination.returnedItems, 1);
  assert.ok(all.payload.pagination.totalItems >= 3);
});

test("Task 4.1 enforces tenant and branch-manager scope", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "menu-cost-scope");
  const foreign = await registerOwner(server, "menu-cost-foreign");
  const firstBranchId = owner.branches[0].id;
  const secondBranch = await request(server, "/api/branches", {
    token: owner.token,
    method: "POST",
    body: { name: "Second", code: `SECOND-${Date.now()}`, city: "Dammam" }
  });
  assert.equal(secondBranch.status, 201);

  const code = `SCOPE-${Date.now()}`;
  const itemId = insertCatalog(owner, { code, name: "Scoped item", priceMinor: 4000 });
  insertCost(owner, itemId, firstBranchId, 1000, 100, "2026-01-01T00:00:00.000Z");
  insertCost(owner, itemId, secondBranch.payload.id, 2000, 200, "2026-01-01T00:00:00.000Z");
  insertDeliverySale(owner, itemId, firstBranchId, `${code}-first`, 4000, 400, "2026-08-01T00:00:00.000Z");
  insertDeliverySale(owner, itemId, secondBranch.payload.id, `${code}-second`, 4000, 800, "2026-08-01T00:00:00.000Z");
  const foreignCode = `FOREIGN-${Date.now()}`;
  insertCatalog(foreign, { code: foreignCode, name: "Foreign item", priceMinor: 9900 });

  const invited = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `menu-manager-${Date.now()}@example.test`,
      name: "Menu Manager",
      role: "branch_manager",
      branchId: secondBranch.payload.id
    }
  });
  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: invited.payload.email, password: invited.payload.temporaryPassword }
  });
  assert.equal(login.status, 200);

  const scoped = await request(server, `/api/menu/costs?itemCode=${code}`, { token: login.payload.token });
  const blockedBranch = await request(server, `/api/menu/costs?branchId=${firstBranchId}&itemCode=${code}`, {
    token: login.payload.token
  });
  const blockedTenantBranch = await request(
    server,
    `/api/menu/costs?branchId=${foreign.branches[0].id}&itemCode=${code}`,
    { token: owner.token }
  );
  const blockedTenantItem = await request(server, `/api/menu/costs?itemCode=${foreignCode}`, {
    token: owner.token
  });
  const scopedSimulation = await request(server, "/api/menu/price-simulation", {
    token: login.payload.token,
    method: "POST",
    body: { itemCode: code, proposedPriceMinor: 5000 }
  });
  const blockedSimulation = await request(server, "/api/menu/price-simulation", {
    token: login.payload.token,
    method: "POST",
    body: { branchId: firstBranchId, itemCode: code, proposedPriceMinor: 5000 }
  });
  const scopedCostSimulation = await request(server, "/api/menu/cost-simulation", {
    token: login.payload.token,
    method: "POST",
    body: {
      itemCode: code,
      scenarios: [{ name: "Manager scenario", proposedFoodCostMinor: 1900, proposedPackagingMinor: 200 }]
    }
  });
  const blockedCostSimulation = await request(server, "/api/menu/cost-simulation", {
    token: login.payload.token,
    method: "POST",
    body: {
      branchId: firstBranchId,
      itemCode: code,
      scenarios: [{ name: "Blocked", proposedFoodCostMinor: 900, proposedPackagingMinor: 100 }]
    }
  });

  assert.equal(scoped.status, 200);
  assert.equal(scoped.payload.scope.branchId, secondBranch.payload.id);
  assert.equal(scoped.payload.items[0].metrics.foodCostMinor, 2000);
  assert.equal(scoped.payload.items[0].metrics.commissionMinor, 800);
  assert.equal(blockedBranch.status, 404);
  assert.equal(blockedTenantBranch.status, 404);
  assert.equal(blockedTenantItem.status, 404);
  assert.equal(scopedSimulation.status, 200);
  assert.equal(scopedSimulation.payload.scope.branchId, secondBranch.payload.id);
  assert.equal(blockedSimulation.status, 404);
  assert.equal(scopedCostSimulation.status, 200);
  assert.equal(scopedCostSimulation.payload.scope.branchId, secondBranch.payload.id);
  assert.equal(blockedCostSimulation.status, 404);
});

test("Task 4.1 validates observation periods and preserves explicit incompleteness", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "menu-cost-edge");
  const code = `EDGE-${Date.now()}`;
  const itemId = insertCatalog(owner, { code, name: "Edge item", priceMinor: 0 });
  insertCost(owner, itemId, null, 100, 25, "2026-01-01T00:00:00.000Z");
  insertDeliverySale(owner, itemId, owner.branches[0].id, `${code}-zero-gross`, 0, 25, "2026-08-01T00:00:00.000Z");

  const reversed = await request(
    server,
    `/api/menu/costs?asOf=2026-08-01T00:00:00.000Z&commissionFrom=2026-08-02T00:00:00.000Z`,
    { token: owner.token }
  );
  const invalidDate = await request(server, "/api/menu/costs?asOf=not-a-date", { token: owner.token });
  const zeroGross = await request(
    server,
    `/api/menu/costs?itemCode=${code}&branchId=${owner.branches[0].id}&asOf=2026-08-02T00:00:00.000Z`,
    { token: owner.token }
  );

  assert.equal(reversed.status, 400);
  assert.equal(invalidDate.status, 400);
  assert.equal(zeroGross.status, 200);
  assert.equal(zeroGross.payload.items[0].metrics.commissionMinor, null);
  assert.equal(zeroGross.payload.items[0].metrics.contributionProfitMinor, null);
  assert.deepEqual(zeroGross.payload.items[0].completeness.missingInputs, ["positive_delivery_gross_sales"]);
  assert.equal(zeroGross.payload.items[0].lineage.commission.recordedCommissionMinor, 25);
});

test("Task 4.5 simulates proposed price contribution across deterministic demand sensitivity", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "price-simulation");
  const branchId = owner.branches[0].id;
  const code = `SIM-${Date.now()}`;
  const itemId = insertCatalog(owner, { code, name: "مندي تجريبي", priceMinor: 5000 });
  const costId = insertCost(owner, itemId, branchId, 2400, 150, "2026-08-01T00:00:00.000Z");
  insertDeliverySale(owner, itemId, branchId, `${code}-1`, 10000, 1500, "2026-08-10T10:00:00.000Z");
  insertDeliverySale(owner, itemId, branchId, `${code}-2`, 5000, 500, "2026-08-11T10:00:00.000Z");

  const result = await request(server, "/api/menu/price-simulation", {
    token: owner.token,
    method: "POST",
    body: {
      branchId,
      itemCode: code.toLowerCase(),
      proposedPriceMinor: 6000,
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-20T00:00:00.000Z",
      demandChangesBps: [1000, 0, -1000, 0]
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.formulaVersion, "4.5-v1");
  assert.deepEqual(result.payload.sourceFormulaVersions, { costs: "4.1-v1", margins: "4.2-v1" });
  assert.equal(result.payload.mode, "read_only_simulation");
  assert.deepEqual(result.payload.scope, {
    organizationId: owner.organization.id,
    restaurantId: owner.restaurant.id,
    branchId,
    currencyCode: "SAR"
  });
  assert.deepEqual(result.payload.baseline, {
    quantitySoldMicros: 2000000,
    quantitySold: 2,
    observedContributionProfitMinor: 7900
  });
  assert.deepEqual(result.payload.unitEconomics, {
    currentPriceMinor: 5000,
    proposedPriceMinor: 6000,
    priceChangeMinor: 1000,
    priceChangeBps: 2000,
    foodCostMinor: 2400,
    packagingMinor: 150,
    commissionRateBps: 1333,
    currentCommissionMinor: 667,
    proposedCommissionMinor: 800,
    currentContributionMinor: 1783,
    proposedContributionMinor: 2650,
    contributionChangeMinor: 867,
    currentContributionMarginBps: 3566,
    proposedContributionMarginBps: 4417
  });
  assert.deepEqual(result.payload.scenarios, [
    {
      demandChangeBps: -1000,
      projectedQuantitySoldMicros: 1800000,
      projectedQuantitySold: 1.8,
      modeledCurrentContributionMinor: 3566,
      projectedContributionMinor: 4770,
      contributionImpactMinor: 1204
    },
    {
      demandChangeBps: 0,
      projectedQuantitySoldMicros: 2000000,
      projectedQuantitySold: 2,
      modeledCurrentContributionMinor: 3566,
      projectedContributionMinor: 5300,
      contributionImpactMinor: 1734
    },
    {
      demandChangeBps: 1000,
      projectedQuantitySoldMicros: 2200000,
      projectedQuantitySold: 2.2,
      modeledCurrentContributionMinor: 3566,
      projectedContributionMinor: 5830,
      contributionImpactMinor: 2264
    }
  ]);
  assert.equal(result.payload.completeness.ready, true);
  assert.equal(result.payload.lineage.costs.costs.sourceId, costId);
  assert.equal(result.payload.lineage.sales.lineCount, 2);
});

test("Task 4.5 blocks invented projections when cost or sales evidence is incomplete", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "price-incomplete");
  const code = `NO-EVIDENCE-${Date.now()}`;
  insertCatalog(owner, { code, name: "无证据菜品", priceMinor: 3200 });

  const result = await request(server, "/api/menu/price-simulation", {
    token: owner.token,
    method: "POST",
    body: { itemCode: code, proposedPriceMinor: 3500 }
  });
  const invalid = await request(server, "/api/menu/price-simulation", {
    token: owner.token,
    method: "POST",
    body: { itemCode: code, proposedPriceMinor: -1, demandChangesBps: [-10000] }
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.completeness.ready, false);
  assert.equal(result.payload.unitEconomics, null);
  assert.deepEqual(result.payload.scenarios, []);
  assert.ok(result.payload.completeness.missingInputs.includes("cost_record"));
  assert.ok(result.payload.completeness.missingInputs.includes("sales_lines"));
  assert.ok(result.payload.completeness.missingInputs.includes("recorded_sales_quantity"));
  assert.equal(invalid.status, 400);
});

test("Task 4.6 compares supplier, ingredient, and packaging cost scenarios deterministically", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "cost-simulation");
  const branchId = owner.branches[0].id;
  const code = `COST-SIM-${Date.now()}`;
  const itemId = insertCatalog(owner, { code, name: "套餐成本测试", priceMinor: 5000 });
  const costId = insertCost(owner, itemId, branchId, 2400, 150, "2026-08-01T00:00:00.000Z");
  insertDeliverySale(owner, itemId, branchId, `${code}-1`, 10000, 1500, "2026-08-10T10:00:00.000Z");
  insertDeliverySale(owner, itemId, branchId, `${code}-2`, 5000, 500, "2026-08-11T10:00:00.000Z");

  const result = await request(server, "/api/menu/cost-simulation", {
    token: owner.token,
    method: "POST",
    body: {
      branchId,
      itemCode: code.toLowerCase(),
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-20T00:00:00.000Z",
      scenarios: [
        { name: "Supplier increase", proposedFoodCostMinor: 2600, proposedPackagingMinor: 150 },
        { name: "Packaging increase", proposedFoodCostMinor: 2400, proposedPackagingMinor: 250 },
        { name: "Recipe saving", proposedFoodCostMinor: 2200, proposedPackagingMinor: 100 }
      ]
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.formulaVersion, "4.6-v1");
  assert.deepEqual(result.payload.sourceFormulaVersions, { costs: "4.1-v1", margins: "4.2-v1" });
  assert.equal(result.payload.mode, "read_only_simulation");
  assert.deepEqual(result.payload.baseline, {
    sellingPriceMinor: 5000,
    foodCostMinor: 2400,
    packagingMinor: 150,
    directCostMinor: 2550,
    commissionMinor: 667,
    commissionRateBps: 1333,
    contributionMinor: 1783,
    contributionMarginBps: 3566,
    quantitySoldMicros: 2000000,
    quantitySold: 2,
    modeledContributionMinor: 3566,
    observedContributionProfitMinor: 7900
  });
  assert.deepEqual(result.payload.scenarios, [
    {
      name: "Supplier increase",
      proposedFoodCostMinor: 2600,
      foodCostChangeMinor: 200,
      proposedPackagingMinor: 150,
      packagingChangeMinor: 0,
      proposedDirectCostMinor: 2750,
      directCostChangeMinor: 200,
      proposedContributionMinor: 1583,
      contributionChangePerUnitMinor: -200,
      proposedContributionMarginBps: 3166,
      projectedContributionMinor: 3166,
      contributionImpactMinor: -400
    },
    {
      name: "Packaging increase",
      proposedFoodCostMinor: 2400,
      foodCostChangeMinor: 0,
      proposedPackagingMinor: 250,
      packagingChangeMinor: 100,
      proposedDirectCostMinor: 2650,
      directCostChangeMinor: 100,
      proposedContributionMinor: 1683,
      contributionChangePerUnitMinor: -100,
      proposedContributionMarginBps: 3366,
      projectedContributionMinor: 3366,
      contributionImpactMinor: -200
    },
    {
      name: "Recipe saving",
      proposedFoodCostMinor: 2200,
      foodCostChangeMinor: -200,
      proposedPackagingMinor: 100,
      packagingChangeMinor: -50,
      proposedDirectCostMinor: 2300,
      directCostChangeMinor: -250,
      proposedContributionMinor: 2033,
      contributionChangePerUnitMinor: 250,
      proposedContributionMarginBps: 4066,
      projectedContributionMinor: 4066,
      contributionImpactMinor: 500
    }
  ]);
  assert.equal(result.payload.completeness.ready, true);
  assert.equal(result.payload.lineage.costs.costs.sourceId, costId);
  assert.equal(result.payload.lineage.sales.lineCount, 2);
});

test("Task 4.6 rejects invalid scenarios and blocks projections without recorded evidence", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "cost-simulation-incomplete");
  const code = `NO-COST-${Date.now()}`;
  insertCatalog(owner, { code, name: "No cost evidence", priceMinor: 3000 });
  const body = {
    itemCode: code,
    scenarios: [{ name: "Candidate", proposedFoodCostMinor: 1000, proposedPackagingMinor: 100 }]
  };
  const result = await request(server, "/api/menu/cost-simulation", {
    token: owner.token,
    method: "POST",
    body
  });
  const invalid = await request(server, "/api/menu/cost-simulation", {
    token: owner.token,
    method: "POST",
    body: { ...body, scenarios: [{ name: "Invalid", proposedFoodCostMinor: -1, proposedPackagingMinor: 0 }] }
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.completeness.ready, false);
  assert.equal(result.payload.baseline, null);
  assert.deepEqual(result.payload.scenarios, []);
  assert.ok(result.payload.completeness.missingInputs.includes("cost_record"));
  assert.ok(result.payload.completeness.missingInputs.includes("recorded_sales_quantity"));
  assert.equal(invalid.status, 400);
});
