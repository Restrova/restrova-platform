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

async function registerOwner(server, prefix, timezone = "Asia/Riyadh") {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const response = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: `${prefix} Owner`,
      email: `${prefix}-${stamp}@example.test`,
      password: "period-password-123",
      organizationName: `${prefix} Organization ${stamp}`,
      restaurantName: `${prefix} Restaurant ${stamp}`,
      branchName: `${prefix} Main`,
      branchCode: `${prefix.toUpperCase()}-01`,
      city: "Riyadh",
      currency: "SAR",
      timezone,
      language: "en"
    }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

async function addSale(server, owner, branchId, amountMinor, sourceReference, occurredAt) {
  const response = await request(server, "/api/financial/entries", {
    token: owner.token,
    method: "POST",
    body: {
      category: "sales",
      amountMinor,
      branchId,
      occurredAt,
      sourceType: "import",
      sourceReference
    }
  });
  assert.equal(response.status, 201);
}

test("Task 3.3 resolves every preset and previous period in the restaurant timezone", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "period-presets");
  const anchor = "2026-08-26T12:00:00Z";
  const expectations = {
    today: ["2026-08-25T21:00:00.000Z", "2026-08-26T20:59:59.999Z", "2026-08-24T21:00:00.000Z"],
    yesterday: ["2026-08-24T21:00:00.000Z", "2026-08-25T20:59:59.999Z", "2026-08-23T21:00:00.000Z"],
    week: ["2026-08-23T21:00:00.000Z", "2026-08-30T20:59:59.999Z", "2026-08-16T21:00:00.000Z"],
    month: ["2026-07-31T21:00:00.000Z", "2026-08-31T20:59:59.999Z", "2026-06-30T21:00:00.000Z"],
    quarter: ["2026-06-30T21:00:00.000Z", "2026-09-30T20:59:59.999Z", "2026-03-31T21:00:00.000Z"],
    year: ["2025-12-31T21:00:00.000Z", "2026-12-31T20:59:59.999Z", "2024-12-31T21:00:00.000Z"]
  };

  for (const [period, [from, to, comparisonFrom]] of Object.entries(expectations)) {
    const result = await request(
      server,
      `/api/financial/period?period=${period}&comparison=previous_period&anchor=${encodeURIComponent(anchor)}`,
      { token: owner.token }
    );
    assert.equal(result.status, 200);
    assert.equal(result.payload.periodVersion, "3.3-v1");
    assert.equal(result.payload.timezone, "Asia/Riyadh");
    assert.equal(result.payload.current.period.from, from);
    assert.equal(result.payload.current.period.to, to);
    assert.equal(result.payload.comparison.period.from, comparisonFrom);
  }

  const custom = await request(
    server,
    "/api/financial/period?period=custom&comparison=previous_period&from=2026-08-01T00:00:00%2B03:00&to=2026-08-02T23:59:59%2B03:00",
    { token: owner.token }
  );
  assert.equal(custom.status, 200);
  assert.equal(custom.payload.current.period.from, "2026-07-31T21:00:00.000Z");
  assert.equal(custom.payload.current.period.to, "2026-08-02T20:59:59.000Z");
  assert.equal(custom.payload.comparison.period.from, "2026-07-29T21:00:00.999Z");
  assert.equal(custom.payload.comparison.period.to, "2026-07-31T20:59:59.999Z");
});

test("Task 3.3 compares previous day, same weekday, and same period last year with lineage", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "period-comparison");
  const branchId = owner.branches[0].id;
  await addSale(server, owner, branchId, 12000, "TODAY-SALE", "2026-08-26T12:00:00+03:00");
  await addSale(server, owner, branchId, 8000, "YESTERDAY-SALE", "2026-08-25T12:00:00+03:00");
  await addSale(server, owner, branchId, 6000, "WEEKDAY-SALE", "2026-08-19T12:00:00+03:00");
  await addSale(server, owner, branchId, 4000, "LAST-YEAR-SALE", "2025-08-26T12:00:00+03:00");

  const base = `/api/financial/period?period=today&branchId=${branchId}&anchor=2026-08-26T12:00:00Z`;
  const previous = await request(server, `${base}&comparison=previous_period`, { token: owner.token });
  const weekday = await request(server, `${base}&comparison=same_weekday`, { token: owner.token });
  const previousYear = await request(server, `${base}&comparison=previous_year`, { token: owner.token });

  assert.equal(previous.payload.current.metrics.revenueMinor, 12000);
  assert.equal(previous.payload.comparison.metrics.revenueMinor, 8000);
  assert.equal(previous.payload.changes.revenueMinor, 4000);
  assert.deepEqual(previous.payload.comparison.lineage.sales, [
    { sourceType: "import", sourceReference: "YESTERDAY-SALE" }
  ]);
  assert.equal(weekday.payload.comparison.metrics.revenueMinor, 6000);
  assert.equal(weekday.payload.changes.revenueMinor, 6000);
  assert.equal(previousYear.payload.comparison.metrics.revenueMinor, 4000);
  assert.equal(previousYear.payload.changes.revenueMinor, 8000);
});

test("Task 3.3 honors daylight-saving boundaries and rejects invalid periods", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "period-dst", "America/New_York");

  const dst = await request(server, "/api/financial/period?period=today&comparison=none&anchor=2026-03-08T16:00:00Z", {
    token: owner.token
  });
  const missingCustomEnd = await request(server, "/api/financial/period?period=custom&from=2026-08-01T00:00:00Z", {
    token: owner.token
  });
  const reversed = await request(
    server,
    "/api/financial/period?period=custom&from=2026-08-02T00:00:00Z&to=2026-08-01T00:00:00Z",
    { token: owner.token }
  );
  const invalidWeekday = await request(server, "/api/financial/period?period=month&comparison=same_weekday", {
    token: owner.token
  });

  assert.equal(dst.status, 200);
  assert.equal(dst.payload.current.period.from, "2026-03-08T05:00:00.000Z");
  assert.equal(dst.payload.current.period.to, "2026-03-09T03:59:59.999Z");
  assert.equal(dst.payload.comparison, null);
  assert.equal(dst.payload.changes, null);
  assert.equal(missingCustomEnd.status, 400);
  assert.equal(reversed.status, 400);
  assert.equal(invalidWeekday.status, 400);
});

test("Task 3.3 period calculations enforce tenant and branch isolation", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "period-scope");
  const foreign = await registerOwner(server, "period-foreign");
  const firstBranchId = owner.branches[0].id;
  const secondBranch = await request(server, "/api/branches", {
    token: owner.token,
    method: "POST",
    body: { name: "Period Branch", code: `PERIOD-${Date.now()}`, city: "Jeddah" }
  });
  assert.equal(secondBranch.status, 201);
  await addSale(server, owner, firstBranchId, 5000, "FIRST-PERIOD-SALE", "2026-08-26T12:00:00+03:00");
  await addSale(server, owner, secondBranch.payload.id, 7000, "SECOND-PERIOD-SALE", "2026-08-26T12:00:00+03:00");
  await addSale(server, foreign, foreign.branches[0].id, 99000, "FOREIGN-PERIOD-SALE", "2026-08-26T12:00:00+03:00");

  const invited = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `period-manager-${Date.now()}@example.test`,
      name: "Period Manager",
      role: "branch_manager",
      branchId: secondBranch.payload.id
    }
  });
  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: invited.payload.email, password: invited.payload.temporaryPassword }
  });
  const query = "period=today&comparison=none&anchor=2026-08-26T12:00:00Z";
  const scoped = await request(server, `/api/financial/period?${query}`, { token: login.payload.token });
  const blockedOwnBranch = await request(server, `/api/financial/period?${query}&branchId=${firstBranchId}`, {
    token: login.payload.token
  });
  const blockedForeign = await request(server, `/api/financial/period?${query}&branchId=${foreign.branches[0].id}`, {
    token: owner.token
  });

  assert.equal(scoped.status, 200);
  assert.equal(scoped.payload.current.scope.branchId, secondBranch.payload.id);
  assert.equal(scoped.payload.current.metrics.revenueMinor, 7000);
  assert.equal(blockedOwnBranch.status, 404);
  assert.equal(blockedForeign.status, 404);
});
