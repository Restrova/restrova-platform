import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "auth-sessions-test-secret-at-least-32-characters";
const { app } = await import("../src/index.js");
const { db } = await import("../src/db.js");
const { config } = await import("../src/config/appConfig.js");
const { requireRole } = await import("../src/middleware/auth.js");
const { authenticateBearerHeader } = await import("../src/services/authService.js");

async function request(server, route, { token, method = "GET", body } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, payload: await response.json() };
}

async function register(server) {
  const email = `session-${crypto.randomUUID()}@example.test`;
  const credentials = { email, password: "session-password-123" };
  const result = await request(server, "/auth/register", {
    method: "POST",
    body: {
      ...credentials,
      name: "Session Owner",
      organizationName: "Session Organization",
      restaurantName: "Session Restaurant",
      branchName: "Session Main"
    }
  });
  assert.equal(result.status, 201);
  return { ...result.payload, credentials };
}

function resign(token, overrides) {
  return jwt.sign({ ...jwt.decode(token), ...overrides }, config.jwt.secret, { algorithm: "HS256" });
}

test("bearer parsing rejects oversized and malformed whitespace headers with bounded work", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await register(server);
  assert.equal(authenticateBearerHeader(`bEaReR ${owner.token}`).owner_id, owner.user.id);
  for (const header of [
    "Bearer " + " ".repeat(1_000_000),
    "Bearer " + "a".repeat(8192),
    "Bearer " + " ".repeat(8000) + "\n",
    `Bearer\t${owner.token}`,
    `Bearer  ${owner.token}`,
    `Bearer \t${owner.token}`,
    `Bearer ${owner.token}\n`,
    `Bearer ${owner.token} `,
    ` Bearer ${owner.token}`,
    "Bearer ",
    null,
    [owner.token]
  ]) {
    assert.throws(
      () => authenticateBearerHeader(header),
      (error) => error.status === 401
    );
  }
});

test("logout revokes the presented durable session while another login remains valid", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await register(server);
  const login = await request(server, "/auth/login", { method: "POST", body: owner.credentials });
  assert.equal(login.status, 200);
  assert.notEqual(jwt.decode(owner.token).jti, jwt.decode(login.payload.token).jti);
  assert.equal((await request(server, "/auth/me", { token: owner.token })).status, 200);
  assert.equal((await request(server, "/auth/logout", { method: "POST", token: owner.token })).status, 200);
  assert.ok(db.prepare("SELECT revoked_at FROM auth_sessions WHERE id=?").get(jwt.decode(owner.token).jti).revoked_at);
  assert.equal((await request(server, "/auth/me", { token: owner.token })).status, 401);
  assert.equal((await request(server, "/auth/logout", { method: "POST", token: owner.token })).status, 401);
  assert.equal((await request(server, "/auth/logout", { method: "POST" })).status, 401);
  assert.equal((await request(server, "/auth/me", { token: login.payload.token })).status, 200);
});

test("removed owners cannot regain access through legacy ownership or a recreated membership", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await register(server);
  const sessionId = jwt.decode(owner.token).jti;
  db.prepare("DELETE FROM organization_users WHERE owner_id=? AND organization_id=?").run(
    owner.user.id,
    owner.organization.id
  );
  assert.equal(db.prepare("SELECT id FROM auth_sessions WHERE id=?").get(sessionId), undefined);
  assert.equal((await request(server, "/auth/me", { token: owner.token })).status, 401);
  assert.equal((await request(server, "/auth/login", { method: "POST", body: owner.credentials })).status, 403);
  db.prepare("INSERT INTO organization_users(organization_id,owner_id,role) VALUES (?,?,'owner')").run(
    owner.organization.id,
    owner.user.id
  );
  assert.equal((await request(server, "/auth/me", { token: owner.token })).status, 401);
  assert.equal((await request(server, "/auth/login", { method: "POST", body: owner.credentials })).status, 200);
});

test("signed tokens require a persisted session with exact owner, organization and restaurant scope", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await register(server);
  const other = await register(server);
  for (const overrides of [
    { jti: undefined },
    { jti: crypto.randomUUID() },
    { ownerId: other.user.id },
    { organizationId: other.organization.id },
    { restaurantId: other.restaurant.id }
  ]) {
    assert.equal((await request(server, "/auth/me", { token: resign(owner.token, overrides) })).status, 401);
  }
  for (const scope of [
    { organizationId: other.organization.id },
    { restaurantId: other.restaurant.id },
    { organizationId: owner.organization.id, restaurantId: other.restaurant.id }
  ]) {
    const result = await request(server, "/auth/login", { method: "POST", body: { ...owner.credentials, ...scope } });
    assert.equal(result.status, 403);
  }
  assert.equal((await request(server, "/auth/me", { token: owner.token })).status, 200);
});

test("persisted session expiry is enforced even when the signed JWT has not expired", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await register(server);
  const now = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE auth_sessions SET issued_at=?,expires_at=? WHERE id=?").run(
    now - 120,
    now - 60,
    jwt.decode(owner.token).jti
  );
  assert.equal((await request(server, "/auth/me", { token: owner.token })).status, 401);
  const login = await request(server, "/auth/login", { method: "POST", body: owner.credentials });
  assert.equal(login.status, 200);
  assert.equal(db.prepare("SELECT id FROM auth_sessions WHERE id=?").get(jwt.decode(owner.token).jti), undefined);
});

test("branch managers can authenticate only to the restaurant containing their assigned branch", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await register(server);
  const sibling = await request(server, "/restaurants", {
    token: owner.token,
    method: "POST",
    body: { name: "Sibling Restaurant", businessType: "yemeni" }
  });
  assert.equal(sibling.status, 201);
  const invite = await request(server, "/users/invite", {
    token: owner.token,
    method: "POST",
    body: {
      email: `manager-${crypto.randomUUID()}@example.test`,
      role: "branch_manager",
      branchId: owner.branches[0].id
    }
  });
  assert.equal(invite.status, 201);
  const credentials = { email: invite.payload.email, password: invite.payload.temporaryPassword };
  const forbidden = await request(server, "/auth/login", {
    method: "POST",
    body: { ...credentials, organizationId: owner.organization.id, restaurantId: sibling.payload.id }
  });
  assert.equal(forbidden.status, 403);
  const allowed = await request(server, "/auth/login", { method: "POST", body: credentials });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.payload.restaurant.id, owner.restaurant.id);
  // Moving the assigned branch outside this token's restaurant immediately removes access.
  db.prepare("UPDATE branches SET restaurant_id=? WHERE id=?").run(sibling.payload.id, owner.branches[0].id);
  try {
    assert.equal((await request(server, "/auth/me", { token: allowed.payload.token })).status, 401);
  } finally {
    db.prepare("UPDATE branches SET restaurant_id=? WHERE id=?").run(owner.restaurant.id, owner.branches[0].id);
  }
});

test("authorization reloads current roles and denies invalid role names", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await register(server);
  db.prepare("UPDATE organization_users SET role='viewer' WHERE owner_id=? AND organization_id=?").run(
    owner.user.id,
    owner.organization.id
  );
  const me = await request(server, "/auth/me", { token: owner.token });
  assert.equal(me.payload.user.role, "viewer");
  assert.equal((await request(server, "/users", { token: owner.token })).status, 403);
  for (const role of [undefined, "unknown", "toString"]) {
    let error;
    requireRole("owner")({ user: { role } }, {}, (value) => {
      error = value;
    });
    assert.ok(error);
  }
});

test("restart preserves sessions and never recreates a removed membership", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "restrova-auth-restart-"));
  try {
    const databasePath = path.join(directory, "restaurant.db");
    const env = { ...process.env, NODE_ENV: "test", DATABASE_PATH: databasePath };
    const execute = (source) => {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
        cwd: new URL("..", import.meta.url),
        env,
        encoding: "utf8"
      });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const credentials = { email: `restart-${crypto.randomUUID()}@example.test`, password: "restart-password-123" };
    const registered = execute(`
      import { register } from './src/services/authService.js';
      import { db } from './src/db.js';
      console.log(JSON.stringify(register(${JSON.stringify({ ...credentials, name: "Restart Owner", organizationName: "Restart Org", restaurantName: "Restart Restaurant", branchName: "Main" })})));
      db.close();
    `);
    const firstRestart = execute(`
      import { authenticateBearerHeader } from './src/services/authService.js';
      import { db } from './src/db.js';
      const context = authenticateBearerHeader(${JSON.stringify(`Bearer ${registered.token}`)});
      db.prepare('INSERT INTO restaurants(name,owner_id,organization_id) VALUES (?,?,?)')
        .run('Restaurant awaiting configuration', context.owner_id, context.organization_id);
      db.prepare('DELETE FROM organization_users WHERE id=?').run(context.membership_id);
      console.log(JSON.stringify({ ownerId: context.owner_id }));
      db.close();
    `);
    assert.equal(firstRestart.ownerId, registered.user.id);
    const secondRestart = execute(`
      import { db } from './src/db.js';
      console.log(JSON.stringify({
        count: db.prepare('SELECT count(*) count FROM organization_users WHERE owner_id=?').get(${registered.user.id}).count,
        branches: db.prepare('SELECT count(*) count FROM branches WHERE organization_id=?').get(${registered.organization.id}).count
      }));
      db.close();
    `);
    assert.equal(secondRestart.count, 0);
    assert.equal(secondRestart.branches, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("JWT expiry configuration rejects ambiguous, invalid and excessive lifetimes", () => {
  for (const expiresIn of ["3600", "0s", "-1h", "25h", "2d", "invalid"]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", "import './src/config/appConfig.js'"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, NODE_ENV: "test", JWT_EXPIRES_IN: expiresIn },
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_EXPIRES_IN must be a positive duration/);
  }
});
