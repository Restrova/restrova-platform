import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db.js";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");

async function request(server, path, { token, method = "GET", body } = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function registerOwner(server, prefix) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const response = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: `${prefix} Owner`,
      email: `${prefix}-${stamp}@example.test`,
      password: "qa-password-123",
      organizationName: `${prefix} Organization ${stamp}`,
      restaurantName: `${prefix} Restaurant ${stamp}`,
      branchName: `${prefix} Main`,
      branchCode: `${prefix.toUpperCase()}-01`,
      city: "Riyadh",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      language: "en",
      operatingDayStart: "09:00",
      operatingDayEnd: "01:00"
    }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

test("Task 1.3 keeps organization, restaurant, users, and branches isolated", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const first = await registerOwner(server, "qa-a");
  const second = await registerOwner(server, "qa-b");

  const [organization, restaurant, users, branches, session] = await Promise.all([
    request(server, "/api/organizations/current", { token: first.token }),
    request(server, "/api/restaurants/current", { token: first.token }),
    request(server, "/api/users", { token: first.token }),
    request(server, "/api/branches", { token: first.token }),
    request(server, "/api/auth/me", { token: first.token })
  ]);

  assert.equal(organization.status, 200);
  assert.equal(organization.payload.id, first.organization.id);
  assert.notEqual(organization.payload.id, second.organization.id);
  assert.equal(restaurant.payload.id, first.restaurant.id);
  assert.notEqual(restaurant.payload.id, second.restaurant.id);
  assert.deepEqual(
    users.payload.map((user) => user.id),
    [first.user.id]
  );
  assert.deepEqual(
    branches.payload.map((branch) => branch.id),
    [first.branches[0].id]
  );
  assert.equal(session.payload.organization.id, first.organization.id);
  assert.equal(session.payload.restaurant.id, first.restaurant.id);
  assert.deepEqual(
    session.payload.branches.map((branch) => branch.id),
    [first.branches[0].id]
  );

  const crossTenantEdit = await request(server, `/api/branches/${second.branches[0].id}`, {
    token: first.token,
    method: "PATCH",
    body: { name: "Cross-tenant mutation" }
  });
  assert.equal(crossTenantEdit.status, 404);

  const crossTenantAssignment = await request(server, "/api/users/invite", {
    token: first.token,
    method: "POST",
    body: {
      email: `foreign-branch-${Date.now()}@example.test`,
      role: "branch_manager",
      branchId: second.branches[0].id
    }
  });
  assert.equal(crossTenantAssignment.status, 404);

  const firstUsersAfterFailure = await request(server, "/api/users", { token: first.token });
  assert.deepEqual(
    firstUsersAfterFailure.payload.map((user) => user.id),
    [first.user.id]
  );
});

test("Task 1.3 scopes a branch manager's session, branch list, and dashboard evidence", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "qa-branch");
  const firstBranchId = owner.branches[0].id;
  const secondBranch = await request(server, "/api/branches", {
    token: owner.token,
    method: "POST",
    body: {
      name: "North Branch",
      code: `NORTH-${Date.now()}`,
      city: "Jeddah",
      operatingDayStart: "00:00",
      operatingDayEnd: "23:59"
    }
  });
  assert.equal(secondBranch.status, 201);

  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO orders(restaurant_id,branch_id,items,total_price,cost,created_at,source_key) VALUES (?,?,?,?,?,?,?)"
  ).run(owner.restaurant.id, firstBranchId, "[]", 999, 100, now, `qa-first-${Date.now()}`);
  db.prepare(
    "INSERT INTO orders(restaurant_id,branch_id,items,total_price,cost,created_at,source_key) VALUES (?,?,?,?,?,?,?)"
  ).run(owner.restaurant.id, secondBranch.payload.id, "[]", 125, 25, now, `qa-second-${Date.now()}`);

  const invited = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `scoped-manager-${Date.now()}@example.test`,
      name: "Scoped Manager",
      role: "branch_manager",
      branchId: secondBranch.payload.id
    }
  });
  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: invited.payload.email, password: invited.payload.temporaryPassword }
  });
  assert.equal(login.status, 200);

  const [session, branches, dashboard] = await Promise.all([
    request(server, "/api/auth/me", { token: login.payload.token }),
    request(server, "/api/branches", { token: login.payload.token }),
    request(server, "/api/dashboard", { token: login.payload.token })
  ]);

  assert.equal(session.payload.user.role, "branch_manager");
  assert.deepEqual(
    session.payload.branches.map((branch) => branch.id),
    [secondBranch.payload.id]
  );
  assert.deepEqual(
    branches.payload.map((branch) => branch.id),
    [secondBranch.payload.id]
  );
  assert.equal(dashboard.payload.sales.branch_id, secondBranch.payload.id);
  assert.equal(dashboard.payload.sales.revenue, 125);
  assert.equal(dashboard.payload.sales.orders, 1);

  const blockedOwnerRead = await request(server, "/api/users", { token: login.payload.token });
  const blockedBranchCreate = await request(server, "/api/branches", {
    token: login.payload.token,
    method: "POST",
    body: { name: "Blocked", code: "BLOCKED", city: "Riyadh" }
  });
  const blockedForeignImport = await request(server, "/api/data/import", {
    token: login.payload.token,
    method: "POST",
    body: {
      type: "inventory",
      branchId: firstBranchId,
      confirm: true,
      csv: "item_name,quantity,threshold\nFlour,5,2"
    }
  });

  assert.equal(blockedOwnerRead.status, 403);
  assert.equal(blockedBranchCreate.status, 403);
  assert.equal(blockedForeignImport.status, 403);
});

test("Task 1.3 onboarding HTTP journey persists defaults and restores the same scoped session", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `onboarding-${stamp}@example.test`;
  const password = "onboarding-password-123";

  const registered = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Onboarding Owner",
      email,
      password,
      organizationName: `Onboarding Organization ${stamp}`,
      restaurantName: `Onboarding Restaurant ${stamp}`,
      branchName: "Riyadh Main",
      branchCode: "RUH-01",
      city: "Riyadh",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      language: "ar",
      operatingDayStart: "10:00",
      operatingDayEnd: "02:00"
    }
  });

  assert.equal(registered.status, 201);
  assert.equal(registered.payload.user.role, "owner");
  assert.deepEqual(
    {
      currency: registered.payload.organization.currency,
      timezone: registered.payload.organization.timezone,
      language: registered.payload.organization.language
    },
    { currency: "SAR", timezone: "Asia/Riyadh", language: "ar" }
  );
  assert.equal(registered.payload.branches[0].code, "RUH-01");
  assert.equal(registered.payload.branches[0].operating_day_end, "02:00");

  const restored = await request(server, "/api/auth/me", { token: registered.payload.token });
  assert.equal(restored.status, 200);
  assert.equal(restored.payload.organization.id, registered.payload.organization.id);
  assert.equal(restored.payload.restaurant.id, registered.payload.restaurant.id);
  assert.equal(restored.payload.branches[0].id, registered.payload.branches[0].id);

  const loggedIn = await request(server, "/api/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      organizationId: registered.payload.organization.id,
      restaurantId: registered.payload.restaurant.id
    }
  });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.payload.organization.id, registered.payload.organization.id);
  assert.equal(loggedIn.payload.restaurant.id, registered.payload.restaurant.id);
  assert.deepEqual(
    loggedIn.payload.branches.map((branch) => branch.id),
    [registered.payload.branches[0].id]
  );
});
