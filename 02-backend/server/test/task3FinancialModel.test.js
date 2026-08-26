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
      password: "financial-password-123",
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

const categories = [
  "sales",
  "discounts",
  "refunds",
  "food_costs",
  "packaging",
  "delivery_commissions",
  "labor",
  "rent",
  "utilities",
  "marketing",
  "miscellaneous_operating_expenses"
];

test("Task 3.1 stores every financial category as integer minor units with lineage", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "finance-model");
  const branchId = owner.branches[0].id;

  const model = await request(server, "/api/financial/model", { token: owner.token });
  assert.equal(model.status, 200);
  assert.equal(model.payload.amountStorage, "integer_minor_units");
  assert.deepEqual(
    model.payload.categories.map((category) => category.key),
    categories
  );

  for (const [index, category] of categories.entries()) {
    const created = await request(server, "/api/financial/entries", {
      token: owner.token,
      method: "POST",
      body: {
        category,
        amountMinor: 1000 + index,
        branchId: index % 2 === 0 ? branchId : null,
        occurredAt: "2026-08-25T12:00:00+08:00",
        periodStart: category === "rent" ? "2026-08-01T00:00:00+08:00" : undefined,
        periodEnd: category === "rent" ? "2026-08-31T23:59:59+08:00" : undefined,
        sourceType: "manual",
        sourceReference: `FIN-${category}`,
        description: `Verified ${category}`,
        evidence: { invoice: `INV-${index}`, reviewed: true }
      }
    });

    assert.equal(created.status, 201);
    assert.equal(created.payload.category, category);
    assert.equal(created.payload.amount_minor, 1000 + index);
    assert.equal(created.payload.currency_code, "SAR");
    assert.equal(created.payload.evidence.reviewed, true);
    assert.equal("evidence_json" in created.payload, false);
  }

  const entries = await request(server, "/api/financial/entries?limit=20", { token: owner.token });
  assert.equal(entries.status, 200);
  assert.equal(entries.payload.length, categories.length);
  assert.deepEqual([...entries.payload.map((entry) => entry.category)].sort(), [...categories].sort());
});

test("Task 3.1 rejects invalid, duplicate, and cross-tenant financial records", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const first = await registerOwner(server, "finance-guard-a");
  const second = await registerOwner(server, "finance-guard-b");
  const valid = {
    category: "rent",
    amountMinor: 250000,
    branchId: first.branches[0].id,
    occurredAt: "2026-08-01T00:00:00+08:00",
    sourceType: "manual",
    sourceReference: "RENT-AUG-2026"
  };

  const created = await request(server, "/api/financial/entries", {
    token: first.token,
    method: "POST",
    body: valid
  });
  const duplicate = await request(server, "/api/financial/entries", {
    token: first.token,
    method: "POST",
    body: valid
  });
  const fractional = await request(server, "/api/financial/entries", {
    token: first.token,
    method: "POST",
    body: { ...valid, amountMinor: 25.5, sourceReference: "FRACTIONAL" }
  });
  const incompletePeriod = await request(server, "/api/financial/entries", {
    token: first.token,
    method: "POST",
    body: { ...valid, periodStart: "2026-08-01T00:00:00+08:00", sourceReference: "INCOMPLETE" }
  });
  const crossTenant = await request(server, "/api/financial/entries", {
    token: first.token,
    method: "POST",
    body: { ...valid, branchId: second.branches[0].id, sourceReference: "FOREIGN" }
  });

  assert.equal(created.status, 201);
  assert.equal(duplicate.status, 409);
  assert.equal(fractional.status, 400);
  assert.equal(incompletePeriod.status, 400);
  assert.equal(crossTenant.status, 404);

  const secondEntries = await request(server, "/api/financial/entries", { token: second.token });
  assert.deepEqual(secondEntries.payload, []);
});

test("Task 3.1 limits branch managers to assigned financial records and owner-only writes", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "finance-branch");
  const firstBranchId = owner.branches[0].id;
  const secondBranch = await request(server, "/api/branches", {
    token: owner.token,
    method: "POST",
    body: { name: "Jeddah Finance", code: `JED-${Date.now()}`, city: "Jeddah" }
  });
  assert.equal(secondBranch.status, 201);

  for (const [branchId, sourceReference] of [
    [firstBranchId, "FIRST-BRANCH-SALE"],
    [secondBranch.payload.id, "SECOND-BRANCH-SALE"]
  ]) {
    const created = await request(server, "/api/financial/entries", {
      token: owner.token,
      method: "POST",
      body: {
        category: "sales",
        amountMinor: branchId === firstBranchId ? 9000 : 7000,
        branchId,
        occurredAt: "2026-08-25T19:00:00+08:00",
        sourceReference
      }
    });
    assert.equal(created.status, 201);
  }

  const invited = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `finance-manager-${Date.now()}@example.test`,
      name: "Finance Manager",
      role: "branch_manager",
      branchId: secondBranch.payload.id
    }
  });
  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: invited.payload.email, password: invited.payload.temporaryPassword }
  });
  assert.equal(login.status, 200);

  const scoped = await request(server, "/api/financial/entries", { token: login.payload.token });
  const foreignQuery = await request(server, `/api/financial/entries?branchId=${firstBranchId}`, {
    token: login.payload.token
  });
  const blockedWrite = await request(server, "/api/financial/entries", {
    token: login.payload.token,
    method: "POST",
    body: {
      category: "utilities",
      amountMinor: 500,
      branchId: secondBranch.payload.id,
      occurredAt: "2026-08-25T19:00:00+08:00",
      sourceReference: "BLOCKED-WRITE"
    }
  });

  assert.equal(scoped.status, 200);
  assert.deepEqual(
    scoped.payload.map((entry) => entry.source_reference),
    ["SECOND-BRANCH-SALE"]
  );
  assert.equal(foreignQuery.status, 404);
  assert.equal(blockedWrite.status, 403);
});
