import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";
process.env.JWT_ISSUER = "ai-restaurant-manager";
process.env.JWT_AUDIENCE = "restaurant-manager-api";
process.env.CLIENT_ORIGIN = "http://allowed.test";
process.env.REQUEST_BODY_LIMIT = "2kb";

const { app } = await import("../src/index.js");
const { isCorsOriginAllowed } = await import("../src/middleware/security.js");

async function request(server, path, { token, method = "GET", body, rawBody, headers = {} } = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: rawBody ?? (body ? JSON.stringify(body) : undefined)
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, headers: response.headers, payload };
}

async function registerOwner(server, prefix) {
  const response = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: `${prefix} Owner`,
      email: `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`,
      password: "demo12345",
      organizationName: `${prefix} Org`,
      restaurantName: `${prefix} Restaurant`,
      branchName: `${prefix} Main`,
      branchCode: `${prefix.slice(0, 2).toUpperCase()}-01`,
      city: "Guangzhou"
    }
  });
  assert.equal(response.status, 201);
  return response.payload;
}

test("private APIs reject unauthenticated, invalid, and expired JWT requests", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "auth");

  const unauthenticated = await request(server, "/api/dashboard");
  assert.equal(unauthenticated.status, 401);

  const invalid = await request(server, "/api/dashboard", { token: "not-a-valid-token" });
  assert.equal(invalid.status, 401);

  const expiredToken = jwt.sign(
    {
      ownerId: owner.user.id,
      organizationId: owner.organization.id,
      restaurantId: owner.restaurant.id,
      role: "owner"
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "-60s",
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    }
  );
  const expired = await request(server, "/api/dashboard", { token: expiredToken });
  assert.equal(expired.status, 401);
});

test("organization and restaurant isolation block cross-tenant access", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const first = await registerOwner(server, "tenant-a");
  const second = await registerOwner(server, "tenant-b");

  const blocked = await request(server, `/api/branches/${second.branches[0].id}`, {
    token: first.token,
    method: "PATCH",
    body: { name: "Illegal cross-tenant edit" }
  });

  assert.equal(blocked.status, 404);
});

test("branch managers are scoped to their assigned branch only", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const owner = await registerOwner(server, "branch");
  const secondBranch = await request(server, "/api/branches", {
    token: owner.token,
    method: "POST",
    body: {
      name: "Second Branch",
      code: "BR-02",
      city: "Shenzhen"
    }
  });
  assert.equal(secondBranch.status, 201);

  const invite = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `branch-manager-${Date.now()}@example.test`,
      name: "Scoped Manager",
      role: "branch_manager",
      branchId: secondBranch.payload.id
    }
  });
  assert.equal(invite.status, 201);

  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: {
      email: invite.payload.email,
      password: invite.payload.temporaryPassword
    }
  });
  assert.equal(login.status, 200);

  const branches = await request(server, "/api/branches", { token: login.payload.token });
  assert.equal(branches.status, 200);
  assert.deepEqual(
    branches.payload.map((branch) => branch.id),
    [secondBranch.payload.id]
  );
  assert.notEqual(branches.payload[0].id, owner.branches[0].id);
});

test("viewer users cannot mutate protected resources", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const owner = await registerOwner(server, "viewer");
  const invite = await request(server, "/api/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `viewer-${Date.now()}@example.test`,
      role: "viewer"
    }
  });
  assert.equal(invite.status, 201);

  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: {
      email: invite.payload.email,
      password: invite.payload.temporaryPassword
    }
  });
  assert.equal(login.status, 200);

  const mutation = await request(server, "/api/data/import/preview", {
    token: login.payload.token,
    method: "POST",
    body: { type: "inventory", csv: "item_name,quantity,threshold\nFlour,10,5" }
  });
  assert.equal(mutation.status, 403);
});

test("malformed and oversized JSON bodies are rejected with sanitized errors", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const malformed = await request(server, "/api/auth/login", {
    method: "POST",
    rawBody: "{ this is not json"
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.payload.error, "Malformed JSON body");
  assert.equal(Object.hasOwn(malformed.payload, "stack"), false);

  const oversized = await request(server, "/api/auth/login", {
    method: "POST",
    rawBody: JSON.stringify({ email: "user@example.test", password: "x".repeat(3000) })
  });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.payload.error, "Payload too large");
  assert.equal(Object.hasOwn(oversized.payload, "stack"), false);
});

test("security headers and restrictive CORS are active", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const health = await request(server, "/api/health");
  assert.equal(health.status, 200);
  assert.ok(health.headers.get("x-request-id"));
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(health.headers.get("content-security-policy") || "", /default-src 'self'/);

  const ready = await request(server, "/api/ready", { headers: { "X-Request-Id": "test-request-id" } });
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get("x-request-id"), "test-request-id");
  assert.equal(ready.payload.status, "ready");
  assert.equal(ready.payload.checks.database, "ok");

  const allowed = await request(server, "/api/health", { headers: { Origin: "http://allowed.test" } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://allowed.test");

  const denied = await request(server, "/api/health", { headers: { Origin: "https://evil.example" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.payload.error, "Origin not allowed");
});

test("development CORS accepts changing loopback ports without weakening configured origins", () => {
  const development = { allowedOrigins: new Set(["http://localhost:5173"]), allowLoopbackOrigins: true };
  const strict = { allowedOrigins: new Set(["https://app.example"]), allowLoopbackOrigins: false };

  assert.equal(isCorsOriginAllowed("http://localhost:5180", development), true);
  assert.equal(isCorsOriginAllowed("http://127.0.0.1:5174", development), true);
  assert.equal(isCorsOriginAllowed("http://192.168.1.10:5173", development), false);
  assert.equal(isCorsOriginAllowed("https://evil.example", development), false);
  assert.equal(isCorsOriginAllowed("http://localhost:5180", strict), false);
  assert.equal(isCorsOriginAllowed("https://app.example", strict), true);
});
