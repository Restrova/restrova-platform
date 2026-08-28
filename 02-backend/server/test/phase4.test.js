import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");
const { isSameOrigin } = await import("../src/middleware/security.js");

// The global API rate limiter is mounted in configureSecurity via
// app.use("/api", apiRateLimit): every /api endpoint — including the health
// probe, which platform deploy checks hit regularly within the same budget —
// advertises the per-client budget. This test pins that mounting so it cannot
// silently regress.
test("global API rate limiter is mounted on all /api endpoints", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const address = server.address();

  const me = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`);
  assert.equal(me.status, 401);
  assert.ok(me.headers.get("ratelimit-limit"), "RateLimit-Limit header must be present on API routes");

  const health = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.equal(health.status, 200);
  assert.ok(health.headers.get("ratelimit-limit"), "health probe shares the global API budget by design");
  assert.equal(health.headers.get("content-type").includes("application/json"), true);
});

// Production bug found by the Phase 4 production-like test: browsers send an
// Origin header on module scripts and POST fetches even for same-origin
// requests. The CORS allowlist used to 403 them whenever CLIENT_ORIGIN was
// not set (e.g. the render.yaml deployment), breaking the built frontend and
// every browser POST. Same-origin requests must skip CORS entirely.
test("same-origin requests with an Origin header are never rejected by CORS", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email: "nobody@example.test", password: "wrongpassword" })
  });
  assert.equal(login.status, 401, "same-origin POST must reach the auth layer, not be CORS-rejected");
  assert.equal(login.headers.get("access-control-allow-origin"), null, "same-origin skips the CORS middleware");

  // Cross-origin requests still go through the allowlist. In the test
  // environment loopback origins are NOT allowed either, so a cross-port
  // origin is rejected — proving the same-origin skip is not a blanket allow.
  const crossPort = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:9999" },
    body: JSON.stringify({ email: "nobody@example.test", password: "wrongpassword" })
  });
  assert.equal(crossPort.status, 403);
  assert.equal(crossPort.headers.get("access-control-allow-origin"), null);
});

test("isSameOrigin matches only the request's own host", () => {
  const req = (host, protocol = "http") => ({ headers: { host }, protocol, get: () => host });
  assert.equal(isSameOrigin("http://app.example.com", req("app.example.com")), true);
  assert.equal(isSameOrigin("https://app.example.com", req("app.example.com", "https")), true);
  assert.equal(isSameOrigin("https://app.example.com", req("app.example.com")), true);
  assert.equal(isSameOrigin("https://evil.example", req("app.example.com", "https")), false);
  assert.equal(isSameOrigin("http://app.example.com:4000", req("app.example.com")), false);
  assert.equal(isSameOrigin(null, req("app.example.com")), false);
  assert.equal(isSameOrigin("http://app.example.com", req(null)), false);
});
