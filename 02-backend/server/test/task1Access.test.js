import test from "node:test";
import assert from "node:assert/strict";

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

test("registration creates an isolated organization, restaurant, owner, and after-midnight branch", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const registered = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Owner One",
      email: `owner-${stamp}@example.test`,
      password: "demo12345",
      organizationName: `Org ${stamp}`,
      restaurantName: `Restaurant ${stamp}`,
      branchName: "Guangzhou Main",
      branchCode: "GZ-01",
      city: "Guangzhou"
    }
  });

  assert.equal(registered.status, 201);
  assert.equal(registered.payload.organization.currency, "CNY");
  assert.equal(registered.payload.organization.timezone, "Asia/Shanghai");
  assert.equal(registered.payload.organization.language, "ar");
  assert.equal(registered.payload.user.role, "owner");
  assert.equal(registered.payload.branches[0].operating_day_end, "02:00");

  const branch = await request(server, "/api/branches", {
    token: registered.payload.token,
    method: "POST",
    body: {
      name: "Shenzhen Branch",
      code: "SZ-01",
      city: "Shenzhen",
      operatingDayStart: "09:00",
      operatingDayEnd: "01:30"
    }
  });

  assert.equal(branch.status, 201);
  assert.equal(branch.payload.operating_day_end, "01:30");

  const invited = await request(server, "/api/users/invite", {
    token: registered.payload.token,
    method: "POST",
    body: {
      email: `manager-${stamp}@example.test`,
      name: "Branch Manager",
      role: "branch_manager",
      branchId: branch.payload.id
    }
  });

  assert.equal(invited.status, 201);
  assert.equal(invited.payload.role, "branch_manager");
  assert.notEqual(invited.payload.temporaryPassword, "ChangeMe123!");

  const managerLogin = await request(server, "/api/auth/login", {
    method: "POST",
    body: {
      email: `manager-${stamp}@example.test`,
      password: invited.payload.temporaryPassword
    }
  });

  assert.equal(managerLogin.status, 200);
  assert.equal(managerLogin.payload.user.role, "branch_manager");

  const managerBranches = await request(server, "/api/branches", { token: managerLogin.payload.token });
  assert.equal(managerBranches.status, 200);
  assert.equal(managerBranches.payload.length, 1);
  assert.equal(managerBranches.payload[0].id, branch.payload.id);

  const forbiddenBranchCreate = await request(server, "/api/branches", {
    token: managerLogin.payload.token,
    method: "POST",
    body: { name: "Unauthorized Branch", code: "NO-01", city: "Guangzhou" }
  });
  assert.equal(forbiddenBranchCreate.status, 403);

  const viewer = await request(server, "/api/users/invite", {
    token: registered.payload.token,
    method: "POST",
    body: {
      email: `viewer-${stamp}@example.test`,
      name: "Viewer",
      role: "viewer"
    }
  });
  const viewerLogin = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: `viewer-${stamp}@example.test`, password: viewer.payload.temporaryPassword }
  });
  const blockedImport = await request(server, "/api/data/import/preview", {
    token: viewerLogin.payload.token,
    method: "POST",
    body: { type: "inventory", csv: "item_name,quantity,threshold\nFlour,10,5" }
  });
  assert.equal(blockedImport.status, 403);
});

test("owners cannot edit branches in another organization", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const first = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: "First Owner",
      email: `first-${stamp}@example.test`,
      password: "demo12345",
      organizationName: `First Org ${stamp}`,
      restaurantName: `First Restaurant ${stamp}`,
      branchName: "First Main"
    }
  });

  const second = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Second Owner",
      email: `second-${stamp}@example.test`,
      password: "demo12345",
      organizationName: `Second Org ${stamp}`,
      restaurantName: `Second Restaurant ${stamp}`,
      branchName: "Second Main"
    }
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const secondBranchId = second.payload.branches[0].id;
  const blocked = await request(server, `/api/branches/${secondBranchId}`, {
    token: first.payload.token,
    method: "PATCH",
    body: { name: "Should Not Update" }
  });

  assert.equal(blocked.status, 404);
});
