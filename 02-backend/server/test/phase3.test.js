import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");
const { db } = await import("../src/db.js");

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

const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

async function registerOrg(server, overrides = {}) {
  const unique = `${stamp}-${Math.floor(Math.random() * 100000)}`;
  const body = {
    name: "Phase3 Owner",
    email: `p3-${unique}@example.test`,
    password: "demo12345",
    organizationName: `Org ${unique}`,
    restaurantName: `Restaurant ${unique}`,
    branchName: "Main Branch",
    branchCode: `MB-${unique.slice(-6)}`,
    city: "Aden",
    currency: "YER",
    timezone: "Asia/Aden",
    ...overrides
  };
  const registered = await request(server, "/api/auth/register", { method: "POST", body });
  assert.equal(registered.status, 201, `registration failed: ${JSON.stringify(registered.payload)}`);
  return registered.payload;
}

test("login rejects a foreign restaurantId instead of silently entering the first restaurant (H4)", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const ownerA = await registerOrg(server);
  const ownerB = await registerOrg(server);

  // Own restaurant → normal login.
  const own = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: ownerA.user.email, password: "demo12345", restaurantId: ownerA.restaurant.id }
  });
  assert.equal(own.status, 200);
  assert.equal(own.payload.restaurant.id, ownerA.restaurant.id);

  // Foreign restaurant → clear rejection, never a silent fallback.
  const foreign = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: ownerA.user.email, password: "demo12345", restaurantId: ownerB.restaurant.id }
  });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.payload.code, "FORBIDDEN");

  // Nonexistent restaurant → rejection as well.
  const missing = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: ownerA.user.email, password: "demo12345", restaurantId: 999999 }
  });
  assert.equal(missing.status, 403);

  // Foreign organization → rejection.
  const foreignOrg = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: ownerA.user.email, password: "demo12345", organizationId: ownerB.organization.id }
  });
  assert.equal(foreignOrg.status, 403);

  // Default login (no target) keeps working for everyone.
  const regular = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: ownerA.user.email, password: "demo12345" }
  });
  assert.equal(regular.status, 200);
});

test("logout invalidates the current token server-side (M3)", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const session = await registerOrg(server);

  const before = await request(server, "/api/auth/me", { token: session.token });
  assert.equal(before.status, 200);

  // JWT iat has one-second granularity: leave the issuing second so the
  // invalidation cutoff is strictly after this token's iat.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const logout = await request(server, "/api/auth/logout", { token: session.token, method: "POST" });
  assert.equal(logout.status, 200);
  assert.equal(logout.payload.ok, true);

  // The old token must stop working immediately.
  const after = await request(server, "/api/auth/me", { token: session.token });
  assert.equal(after.status, 401);

  // A fresh login works and its token is valid.
  const relogin = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: session.user.email, password: "demo12345" }
  });
  assert.equal(relogin.status, 200);
  const refreshed = await request(server, "/api/auth/me", { token: relogin.payload.token });
  assert.equal(refreshed.status, 200);
});

test("operational tables have the hot-path indexes (M7)", () => {
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index'")
    .all()
    .map((row) => row.name);
  for (const expected of [
    "idx_orders_scope_time",
    "idx_refunds_scope_time",
    "idx_staff_shifts_scope",
    "idx_menu_items_restaurant",
    "idx_inventory_scope",
    "idx_chat_messages_session",
    "idx_chat_sessions_scope",
    "idx_branches_scope",
    "idx_reports_restaurant"
  ]) {
    assert.ok(indexes.includes(expected), `missing index: ${expected}`);
  }
});

test("request id spoofing is sanitized (Low/L-1)", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`, {
    headers: { "x-request-id": 'bad id with spaces and "quotes" and a very long tail' }
  });
  assert.equal(response.status, 200);
  const echoed = response.headers.get("x-request-id");
  assert.match(echoed, /^[0-9a-f-]{36}$/, "unsafe request id must be replaced by a server-generated UUID");
});
