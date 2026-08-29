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

async function registerOwner(server, prefix, language = "ar") {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const response = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: `${prefix} Owner`,
      email: `${prefix}-${stamp}@example.test`,
      password: "menu-margin-password-123",
      organizationName: `${prefix} Organization ${stamp}`,
      restaurantName: `${prefix} Restaurant ${stamp}`,
      branchName: `${prefix} Main`,
      branchCode: `${prefix.toUpperCase()}-01`,
      city: "Riyadh",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      language
    }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

function insertCatalog(owner, code, name, priceMinor = 5000, active = 1) {
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

function insertSale(
  owner,
  itemId,
  branchId,
  suffix,
  { createdAt, quantity = 1, grossMinor, discountMinor = 0, refundMinor = 0, commissionMinor = 0, channel = "dine_in" }
) {
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
        channel,
        quantity,
        grossMinor,
        discountMinor,
        refundMinor,
        commissionMinor
      ).lastInsertRowid
  );
}

test("Task 4.2 calculates all item margin metrics from historical evidence", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "margin-formula");
  const branchId = owner.branches[0].id;
  const code = `MANDI-${Date.now()}`;
  const itemId = insertCatalog(owner, code, "مندي دجاج");
  const restaurantCostId = insertCost(owner, itemId, null, 2000, 200, "2026-08-01T00:00:00.000Z");
  const branchCostId = insertCost(owner, itemId, branchId, 2500, 300, "2026-08-11T00:00:00.000Z");
  insertSale(owner, itemId, branchId, `${code}-1`, {
    createdAt: "2026-08-10T12:00:00.000Z",
    quantity: 2,
    grossMinor: 10000,
    discountMinor: 1000,
    refundMinor: 500,
    commissionMinor: 1000,
    channel: "delivery"
  });
  insertSale(owner, itemId, branchId, `${code}-2`, {
    createdAt: "2026-08-12T12:00:00.000Z",
    quantity: 1,
    grossMinor: 5000
  });
  const otherItemId = insertCatalog(owner, `TEA-${Date.now()}`, "也门奶茶", 3000);
  insertSale(owner, otherItemId, branchId, `${code}-other`, {
    createdAt: "2026-08-12T13:00:00.000Z",
    quantity: 2,
    grossMinor: 6000
  });

  const result = await request(
    server,
    `/api/menu/margins?branchId=${branchId}&itemCode=${code.toLowerCase()}&from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z`,
    { token: owner.token }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.formulaVersion, "4.2-v1");
  assert.deepEqual(result.payload.quantityStorage, { unit: "quantity_micros", scale: 1000000 });
  assert.deepEqual(result.payload.scope, {
    organizationId: owner.organization.id,
    restaurantId: owner.restaurant.id,
    branchId,
    currencyCode: "SAR"
  });
  assert.deepEqual(result.payload.population, { totalQuantitySold: 5, totalQuantitySoldMicros: 5000000 });
  assert.equal(result.payload.items.length, 1);
  assert.equal(result.payload.items[0].name, "مندي دجاج");
  assert.deepEqual(result.payload.items[0].metrics, {
    grossSalesMinor: 15000,
    discountsMinor: 1000,
    refundsMinor: 500,
    itemRevenueMinor: 13500,
    quantitySold: 3,
    quantitySoldMicros: 3000000,
    allocatedFoodCostMinor: 6500,
    allocatedPackagingMinor: 700,
    deliveryCommissionMinor: 1000,
    grossProfitMinor: 7000,
    grossMarginBps: 5185,
    contributionProfitMinor: 5300,
    contributionMarginBps: 3926,
    foodCostPercentageBps: 4815,
    popularityBps: 6000,
    refundRateBps: 333,
    discountRateBps: 667
  });
  assert.deepEqual(result.payload.items[0].completeness, {
    ready: true,
    hasSalesData: true,
    hasCompleteCosts: true,
    salesLineCount: 2,
    costedSalesLineCount: 2,
    missingCostLineCount: 0,
    costCoverageBps: 10000,
    missingInputs: []
  });
  assert.deepEqual(
    result.payload.items[0].lineage.costs.map((cost) => cost.sourceId).sort((a, b) => a - b),
    [restaurantCostId, branchCostId].sort((a, b) => a - b)
  );
  assert.equal(result.payload.items[0].lineage.sales.lineCount, 2);
  assert.equal(result.payload.items[0].lineage.sales.referencesTruncated, false);
});

test("Task 4.2 hides partial profit and reports cost coverage honestly", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "margin-coverage", "zh");
  const branchId = owner.branches[0].id;
  const code = `COVERAGE-${Date.now()}`;
  const itemId = insertCatalog(owner, code, "羊肉饭");
  insertCost(owner, itemId, null, 1000, 100, "2026-08-15T00:00:00.000Z");
  const missingLineId = insertSale(owner, itemId, branchId, `${code}-missing`, {
    createdAt: "2026-08-10T00:00:00.000Z",
    quantity: 1,
    grossMinor: 3000
  });
  insertSale(owner, itemId, branchId, `${code}-costed`, {
    createdAt: "2026-08-20T00:00:00.000Z",
    quantity: 3,
    grossMinor: 9000
  });

  const result = await request(server, `/api/menu/margins?branchId=${branchId}&itemCode=${code}`, {
    token: owner.token
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.items[0].name, "羊肉饭");
  assert.equal(result.payload.items[0].metrics.itemRevenueMinor, 12000);
  assert.equal(result.payload.items[0].metrics.quantitySold, 4);
  assert.equal(result.payload.items[0].metrics.allocatedFoodCostMinor, null);
  assert.equal(result.payload.items[0].metrics.grossProfitMinor, null);
  assert.equal(result.payload.items[0].metrics.contributionProfitMinor, null);
  assert.equal(result.payload.items[0].completeness.ready, false);
  assert.equal(result.payload.items[0].completeness.costCoverageBps, 7500);
  assert.deepEqual(result.payload.items[0].completeness.missingInputs, ["effective_cost_records"]);
  assert.deepEqual(result.payload.items[0].lineage.missingCostLineIds, [missingLineId]);
});

test("Task 4.2 honors periods, fractional quantities, deductions, and empty items", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "margin-edge", "en");
  const branchId = owner.branches[0].id;
  const code = `FRACTION-${Date.now()}`;
  const itemId = insertCatalog(owner, code, "Fraction item");
  insertCost(owner, itemId, null, 101, 5, "2026-01-01T00:00:00.000Z");
  insertSale(owner, itemId, branchId, `${code}-july`, {
    createdAt: "2026-07-31T23:59:59.999Z",
    quantity: 5,
    grossMinor: 5000
  });
  insertSale(owner, itemId, branchId, `${code}-august`, {
    createdAt: "2026-08-01T00:00:00.000Z",
    quantity: 0.5,
    grossMinor: 1000
  });
  const emptyCode = `EMPTY-${Date.now()}`;
  insertCatalog(owner, emptyCode, "Empty item");

  const fractional = await request(
    server,
    `/api/menu/margins?itemCode=${code}&from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z`,
    { token: owner.token }
  );
  assert.equal(fractional.status, 200);
  assert.equal(fractional.payload.items[0].metrics.quantitySold, 0.5);
  assert.equal(fractional.payload.items[0].metrics.quantitySoldMicros, 500000);
  assert.equal(fractional.payload.items[0].metrics.allocatedFoodCostMinor, 51);
  assert.equal(fractional.payload.items[0].metrics.allocatedPackagingMinor, 3);
  assert.equal(fractional.payload.items[0].metrics.grossProfitMinor, 949);
  assert.equal(fractional.payload.items[0].metrics.contributionProfitMinor, 946);
  assert.equal(fractional.payload.items[0].metrics.popularityBps, 10000);

  const empty = await request(server, `/api/menu/margins?itemCode=${emptyCode}`, { token: owner.token });
  assert.equal(empty.status, 200);
  assert.equal(empty.payload.items[0].metrics.itemRevenueMinor, 0);
  assert.equal(empty.payload.items[0].metrics.quantitySold, 0);
  assert.equal(empty.payload.items[0].metrics.grossProfitMinor, null);
  assert.equal(empty.payload.items[0].metrics.popularityBps, 0);
  assert.deepEqual(empty.payload.items[0].completeness.missingInputs, ["sales_lines"]);

  const negativeCode = `NEGATIVE-${Date.now()}`;
  const negativeItemId = insertCatalog(owner, negativeCode, "Negative item");
  insertCost(owner, negativeItemId, null, 100, 0, "2026-01-01T00:00:00.000Z");
  insertSale(owner, negativeItemId, branchId, `${negativeCode}-1`, {
    createdAt: "2026-08-10T00:00:00.000Z",
    grossMinor: 100,
    discountMinor: 80,
    refundMinor: 50
  });
  const negative = await request(server, `/api/menu/margins?itemCode=${negativeCode}`, { token: owner.token });
  assert.equal(negative.status, 200);
  assert.equal(negative.payload.items[0].metrics.itemRevenueMinor, -30);
  assert.equal(negative.payload.items[0].metrics.grossProfitMinor, -130);
  assert.equal(negative.payload.items[0].metrics.grossMarginBps, null);
  assert.equal(negative.payload.items[0].metrics.contributionMarginBps, null);
  assert.equal(negative.payload.items[0].metrics.refundRateBps, 5000);
  assert.equal(negative.payload.items[0].metrics.discountRateBps, 8000);
});

test("Task 4.2 enforces tenant, branch-manager, validation, and pagination boundaries", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "margin-scope");
  const foreign = await registerOwner(server, "margin-foreign");
  const firstBranchId = owner.branches[0].id;
  const secondBranch = await request(server, "/api/branches", {
    token: owner.token,
    method: "POST",
    body: { name: "Second", code: `SECOND-${Date.now()}`, city: "Dammam" }
  });
  assert.equal(secondBranch.status, 201);
  const code = `SCOPE-${Date.now()}`;
  const itemId = insertCatalog(owner, code, "Scoped margin");
  insertCost(owner, itemId, firstBranchId, 1000, 0, "2026-01-01T00:00:00.000Z");
  insertCost(owner, itemId, secondBranch.payload.id, 2000, 0, "2026-01-01T00:00:00.000Z");
  insertSale(owner, itemId, firstBranchId, `${code}-first`, {
    createdAt: "2026-08-01T00:00:00.000Z",
    grossMinor: 5000
  });
  insertSale(owner, itemId, secondBranch.payload.id, `${code}-second`, {
    createdAt: "2026-08-01T00:00:00.000Z",
    grossMinor: 6000
  });
  const foreignCode = `FOREIGN-${Date.now()}`;
  insertCatalog(foreign, foreignCode, "Foreign margin");

  const invited = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `margin-manager-${Date.now()}@example.test`,
      name: "Margin Manager",
      role: "branch_manager",
      branchId: secondBranch.payload.id
    }
  });
  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: invited.payload.email, password: invited.payload.temporaryPassword }
  });
  assert.equal(login.status, 200);

  const scoped = await request(server, `/api/menu/margins?itemCode=${code}`, { token: login.payload.token });
  const blockedBranch = await request(server, `/api/menu/margins?branchId=${firstBranchId}&itemCode=${code}`, {
    token: login.payload.token
  });
  const blockedTenantBranch = await request(
    server,
    `/api/menu/margins?branchId=${foreign.branches[0].id}&itemCode=${code}`,
    { token: owner.token }
  );
  const blockedTenantItem = await request(server, `/api/menu/margins?itemCode=${foreignCode}`, {
    token: owner.token
  });
  const reversed = await request(
    server,
    "/api/menu/margins?from=2026-09-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z",
    { token: owner.token }
  );
  const paged = await request(server, "/api/menu/margins?status=all&limit=1&offset=0", { token: owner.token });

  assert.equal(scoped.status, 200);
  assert.equal(scoped.payload.scope.branchId, secondBranch.payload.id);
  assert.equal(scoped.payload.items[0].metrics.itemRevenueMinor, 6000);
  assert.equal(scoped.payload.items[0].metrics.allocatedFoodCostMinor, 2000);
  assert.equal(blockedBranch.status, 404);
  assert.equal(blockedTenantBranch.status, 404);
  assert.equal(blockedTenantItem.status, 404);
  assert.equal(reversed.status, 400);
  assert.equal(paged.status, 200);
  assert.equal(paged.payload.pagination.returnedItems, 1);
  assert.ok(paged.payload.pagination.totalItems >= 1);
});

test("Task 4.3 classifies STAR, PLOWHORSE, PUZZLE, and DOG from recorded evidence", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "matrix-four", "zh");
  const branchId = owner.branches[0].id;
  const stamp = Date.now();
  const fixtures = [
    ["STAR", 40, 40000, 10000, "明星菜"],
    ["PLOW", 30, 30000, 24000, "招牌饭"],
    ["PUZZLE", 20, 20000, 5000, "لغز مربح"],
    ["DOG", 10, 10000, 8000, "طبق ضعيف"]
  ];
  for (const [code, quantity, revenue, foodCost, name] of fixtures) {
    const itemId = insertCatalog(owner, `${code}-${stamp}`, name);
    insertCost(owner, itemId, null, foodCost / quantity, 0, "2026-01-01T00:00:00.000Z");
    insertSale(owner, itemId, branchId, `${code}-${stamp}`, {
      createdAt: "2026-08-10T12:00:00.000Z",
      quantity,
      grossMinor: revenue
    });
  }
  const excludedId = insertCatalog(owner, `MISSING-${stamp}`, "Missing cost");
  insertSale(owner, excludedId, branchId, `MISSING-${stamp}`, {
    createdAt: "2026-08-10T12:00:00.000Z",
    grossMinor: 5000
  });

  const result = await request(
    server,
    `/api/menu/engineering-matrix?branchId=${branchId}&from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z`,
    { token: owner.token }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.formulaVersion, "4.3-v1");
  assert.equal(result.payload.sourceFormulaVersion, "4.2-v1");
  assert.deepEqual(result.payload.scope, {
    organizationId: owner.organization.id,
    restaurantId: owner.restaurant.id,
    branchId,
    currencyCode: "SAR"
  });
  assert.deepEqual(result.payload.thresholds, {
    method: "portfolio_average",
    popularityThresholdBps: 2500,
    marginThresholdBps: 5300,
    eligibleItemCount: 4,
    eligibleQuantitySoldMicros: 100000000,
    eligibleRevenueMinor: 100000,
    eligibleContributionProfitMinor: 53000
  });
  assert.deepEqual(
    Object.fromEntries(
      result.payload.items.map((item) => [item.itemCode.split("-")[0], item.engineering.classification])
    ),
    { DOG: "DOG", PLOW: "PLOWHORSE", PUZZLE: "PUZZLE", STAR: "STAR" }
  );
  assert.equal(result.payload.excluded.length, 1);
  assert.deepEqual(result.payload.excluded[0].reasons, ["effective_cost_records"]);
  assert.ok(result.payload.items.every((item) => item.lineage.sales.references.length === 1));
});

test("Task 4.3 keeps thresholds scope-wide while filtering and rejects foreign branches", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "matrix-scope");
  const foreign = await registerOwner(server, "matrix-foreign");
  const branchId = owner.branches[0].id;
  const stamp = Date.now();
  for (const [suffix, quantity] of [
    ["A", 3],
    ["B", 1]
  ]) {
    const itemId = insertCatalog(owner, `MATRIX-${suffix}-${stamp}`, `Matrix ${suffix}`);
    insertCost(owner, itemId, null, 100, 0, "2026-01-01T00:00:00.000Z");
    insertSale(owner, itemId, branchId, `MATRIX-${suffix}-${stamp}`, {
      createdAt: "2026-08-10T12:00:00.000Z",
      quantity,
      grossMinor: quantity * 1000
    });
  }
  const filtered = await request(
    server,
    `/api/menu/engineering-matrix?itemCode=MATRIX-A-${stamp.toString().toLowerCase()}`,
    { token: owner.token }
  );
  const blocked = await request(server, `/api/menu/engineering-matrix?branchId=${foreign.branches[0].id}`, {
    token: owner.token
  });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.payload.items.length, 1);
  assert.equal(filtered.payload.thresholds.eligibleItemCount, 2);
  assert.equal(filtered.payload.thresholds.popularityThresholdBps, 5000);
  assert.equal(blocked.status, 404);
});

test("Task 4.7 derives all six menu proposals from recorded matrix evidence", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "recommendations-six", "ar");
  const branchId = owner.branches[0].id;
  const stamp = Date.now();
  const fixtures = [
    ["STAR", 40, 40000, 10000, "明星菜"],
    ["PLOW", 30, 30000, 24000, "طبق شعبي"],
    ["PUZZLE", 20, 20000, 5000, "لغز مربح"],
    ["DOG", 10, 10000, 8000, "طبق ضعيف"]
  ];
  for (const [code, quantity, revenue, foodCost, name] of fixtures) {
    const itemId = insertCatalog(owner, `${code}-${stamp}`, name);
    insertCost(owner, itemId, null, foodCost / quantity, 0, "2026-01-01T00:00:00.000Z");
    insertSale(owner, itemId, branchId, `${code}-${stamp}`, {
      createdAt: "2026-08-10T12:00:00.000Z",
      quantity,
      grossMinor: revenue
    });
  }

  const result = await request(
    server,
    `/api/menu/recommendations?branchId=${branchId}&from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z`,
    { token: owner.token }
  );

  assert.equal(result.status, 200);
  assert.equal(result.payload.formulaVersion, "4.7-v1");
  assert.equal(result.payload.sourceFormulaVersion, "4.3-v1");
  assert.deepEqual(
    new Set(result.payload.recommendations.map((recommendation) => recommendation.action)),
    new Set([
      "raise_price",
      "reduce_ingredient_cost",
      "change_portion",
      "promote_item",
      "bundle_item",
      "consider_removal"
    ])
  );
  assert.ok(result.payload.recommendations.some((recommendation) => recommendation.item.name === "明星菜"));
  assert.ok(result.payload.recommendations.some((recommendation) => recommendation.item.name === "طبق شعبي"));
  assert.ok(
    result.payload.recommendations.every(
      (recommendation) =>
        recommendation.projectedImpact === null &&
        recommendation.approval.status === "proposed" &&
        recommendation.approval.requiredRole === "owner" &&
        recommendation.approval.executionPerformed === false &&
        recommendation.evidence.costCoverageBps === 10000 &&
        recommendation.lineage.sales.references.length === 1
    )
  );
  assert.deepEqual(result.payload.governance.lifecycle, [
    "proposed",
    "accepted",
    "rejected",
    "in_progress",
    "completed",
    "cancelled"
  ]);
  assert.deepEqual(result.payload.recommendations[0].outcomeMeasurement.checkpointsDays, [7, 14]);
});

test("Task 4.7 publishes uncertainty, excludes incomplete items, and enforces branch isolation", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "recommendations-scope");
  const foreign = await registerOwner(server, "recommendations-foreign");
  const branchId = owner.branches[0].id;
  const stamp = Date.now();
  const itemId = insertCatalog(owner, `ONLY-${stamp}`, "Single evidence item");
  insertCost(owner, itemId, null, 200, 0, "2026-01-01T00:00:00.000Z");
  insertSale(owner, itemId, branchId, `ONLY-${stamp}`, {
    createdAt: "2026-08-10T12:00:00.000Z",
    quantity: 2,
    grossMinor: 2000
  });
  const incompleteId = insertCatalog(owner, `INCOMPLETE-${stamp}`, "No cost evidence");
  insertSale(owner, incompleteId, branchId, `INCOMPLETE-${stamp}`, {
    createdAt: "2026-08-10T12:00:00.000Z",
    quantity: 1,
    grossMinor: 500
  });

  const result = await request(server, `/api/menu/recommendations?branchId=${branchId}`, { token: owner.token });
  const blocked = await request(server, `/api/menu/recommendations?branchId=${foreign.branches[0].id}`, {
    token: owner.token
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.recommendations.length, 1);
  assert.equal(result.payload.recommendations[0].confidence.level, "medium");
  assert.deepEqual(result.payload.recommendations[0].confidence.limitations, [
    "limited_sales_history_review_before_acceptance"
  ]);
  assert.equal(result.payload.excluded.length, 1);
  assert.deepEqual(result.payload.excluded[0].reasons, ["effective_cost_records"]);
  assert.equal(blocked.status, 404);
});
