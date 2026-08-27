import test from "node:test";
import assert from "node:assert/strict";
import { financialAccuracyGoldenCases } from "../test-data/financialAccuracyGolden.js";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");
const { calculateFinancialMetricsFromEntries, getFinancialModel, taxTreatmentPolicy } =
  await import("../src/services/financialService.js");

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

async function registerOwner(server, prefix, { currency = "CNY", timezone = "Asia/Shanghai" } = {}) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const response = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: `${prefix} Owner`,
      email: `${prefix}-${stamp}@example.test`,
      password: "accuracy-password-123",
      organizationName: `${prefix} Organization ${stamp}`,
      restaurantName: `${prefix} Restaurant ${stamp}`,
      branchName: `${prefix} Main`,
      branchCode: `${prefix.toUpperCase()}-01`,
      city: "Shenzhen",
      currency,
      timezone,
      language: "en"
    }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

async function createBranch(server, token, name) {
  const response = await request(server, "/api/branches", {
    token,
    method: "POST",
    body: { name, code: `ACCURACY-${Date.now()}-${Math.floor(Math.random() * 10000)}`, city: "Shenzhen" }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

async function addEntry(server, token, { branchId, category = "sales", amountMinor, reference, occurredAt }) {
  return request(server, "/api/financial/entries", {
    token,
    method: "POST",
    body: {
      branchId,
      category,
      amountMinor,
      occurredAt,
      sourceType: "import",
      sourceReference: reference
    }
  });
}

test("Task 3.7 locks deterministic rounding, refunds, discounts, and negative results to golden datasets", () => {
  for (const accuracyCase of financialAccuracyGoldenCases) {
    const result = calculateFinancialMetricsFromEntries(accuracyCase.entries, {
      organizationId: 1,
      restaurantId: 1,
      branchId: 1,
      currencyCode: "CNY"
    });

    assert.deepEqual(result.metrics, accuracyCase.expectedMetrics, accuracyCase.name);
    assert.equal(result.formulaVersion, "3.7-v1");
    assert.deepEqual(result.taxTreatment, taxTreatmentPolicy);
    assert.equal(result.completeness.entryCount, accuracyCase.entries.length);
  }
});

test("Task 3.7 makes tax treatment explicit and rejects unmodeled or signed ledger facts", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "accuracy-tax");
  const branchId = owner.branches[0].id;
  const base = {
    branchId,
    amountMinor: 1000,
    occurredAt: "2026-08-27T12:00:00+08:00",
    reference: "TAX-POLICY"
  };

  const model = await request(server, "/api/financial/model", { token: owner.token });
  const sale = await addEntry(server, owner.token, base);
  const unsupportedTax = await addEntry(server, owner.token, {
    ...base,
    category: "tax",
    reference: "UNSUPPORTED-TAX"
  });
  const signedFact = await addEntry(server, owner.token, {
    ...base,
    amountMinor: -1,
    reference: "SIGNED-FACT"
  });
  const calculation = await request(server, `/api/financial/calculate?branchId=${branchId}`, {
    token: owner.token
  });

  assert.equal(model.status, 200);
  assert.deepEqual(model.payload.taxTreatment, taxTreatmentPolicy);
  assert.equal(sale.status, 201);
  assert.equal(unsupportedTax.status, 400);
  assert.equal(signedFact.status, 400);
  assert.equal(calculation.payload.metrics.netProfitMinor, 1000);
  assert.deepEqual(calculation.payload.taxTreatment, taxTreatmentPolicy);
  assert.match(calculation.payload.assumptions.join(" "), /tax/i);
});

test("Task 3.7 preserves integer minor units across currencies without conversion", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  for (const currency of ["CNY", "JPY", "BHD"]) {
    const owner = await registerOwner(server, `accuracy-${currency.toLowerCase()}`, { currency });
    const branchId = owner.branches[0].id;
    const created = await addEntry(server, owner.token, {
      branchId,
      amountMinor: 12345,
      reference: `${currency}-SALE`,
      occurredAt: "2026-08-27T12:00:00+08:00"
    });
    const calculation = await request(server, `/api/financial/calculate?branchId=${branchId}`, {
      token: owner.token
    });

    assert.equal(created.status, 201);
    assert.equal(created.payload.currency_code, currency);
    assert.equal(created.payload.amount_minor, 12345);
    assert.equal(calculation.payload.scope.currencyCode, currency);
    assert.equal(calculation.payload.metrics.revenueMinor, 12345);
  }
});

test("Task 3.7 includes exact millisecond boundaries and reconciles multiple branches", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "accuracy-boundaries");
  const firstBranchId = owner.branches[0].id;
  const secondBranch = await createBranch(server, owner.token, "Accuracy Second");
  const entries = [
    [firstBranchId, 1000, "BEFORE", "2026-07-31T23:59:59.999+08:00"],
    [firstBranchId, 100, "START", "2026-08-01T00:00:00.000+08:00"],
    [firstBranchId, 200, "END", "2026-08-31T23:59:59.999+08:00"],
    [firstBranchId, 2000, "AFTER", "2026-09-01T00:00:00.000+08:00"],
    [secondBranch.id, 300, "SECOND-BRANCH", "2026-08-15T12:00:00.000+08:00"]
  ];
  for (const [branchId, amountMinor, reference, occurredAt] of entries) {
    const created = await addEntry(server, owner.token, { branchId, amountMinor, reference, occurredAt });
    assert.equal(created.status, 201);
  }

  const range = "from=2026-08-01T00:00:00.000%2B08:00&to=2026-08-31T23:59:59.999%2B08:00";
  const first = await request(server, `/api/financial/calculate?branchId=${firstBranchId}&${range}`, {
    token: owner.token
  });
  const restaurant = await request(server, `/api/financial/calculate?${range}`, { token: owner.token });

  assert.equal(first.status, 200);
  assert.equal(first.payload.metrics.revenueMinor, 300);
  assert.deepEqual(
    first.payload.lineage.sales.map((source) => source.sourceReference),
    ["START", "END"]
  );
  assert.equal(restaurant.payload.metrics.revenueMinor, 600);
  assert.equal(restaurant.payload.metrics.orderCount, 3);
});

test("Task 3.7 applies each organization's timezone at the same UTC instant", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const shanghai = await registerOwner(server, "accuracy-shanghai", { timezone: "Asia/Shanghai" });
  const newYork = await registerOwner(server, "accuracy-new-york", { timezone: "America/New_York" });
  const instant = "2026-08-27T03:30:00.000Z";

  for (const owner of [shanghai, newYork]) {
    const created = await addEntry(server, owner.token, {
      branchId: owner.branches[0].id,
      amountMinor: 500,
      reference: `TIMEZONE-${owner.organization.id}`,
      occurredAt: instant
    });
    assert.equal(created.status, 201);
  }

  const query = "period=today&comparison=none&anchor=2026-08-27T12:00:00.000Z";
  const shanghaiDay = await request(server, `/api/financial/period?${query}`, { token: shanghai.token });
  const newYorkDay = await request(server, `/api/financial/period?${query}`, { token: newYork.token });

  assert.equal(shanghaiDay.payload.timezone, "Asia/Shanghai");
  assert.equal(shanghaiDay.payload.current.period.from, "2026-08-26T16:00:00.000Z");
  assert.equal(shanghaiDay.payload.current.metrics.revenueMinor, 500);
  assert.equal(newYorkDay.payload.timezone, "America/New_York");
  assert.equal(newYorkDay.payload.current.period.from, "2026-08-27T04:00:00.000Z");
  assert.equal(newYorkDay.payload.current.metrics.revenueMinor, 0);
});
