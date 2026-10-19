import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
const { createRateLimiter, configureSecurity } = await import("../src/middleware/security.js");
const { default: express } = await import("express");
function hit(limiter, ip = "1", path = "/orders/1", user) {
  const headers = {};
  let error;
  limiter(
    { ip, path, user, baseUrl: "/api" },
    { setHeader: (key, value) => (headers[key] = value) },
    (e) => (error = e)
  );
  return { headers, error };
}
test("arbitrary routes share a client limit, supply reset/retry and recover", () => {
  let clock = 1000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, message: "limited", now: () => clock });
  const a = hit(limiter);
  assert.equal(a.headers["RateLimit-Remaining"], "1");
  assert.equal(a.headers["RateLimit-Reset"], "2");
  hit(limiter, "1", "/orders/2?nonce=1");
  const blocked = hit(limiter, "1", "/other-random-route");
  assert.equal(blocked.error.status, 429);
  assert.equal(blocked.headers["Retry-After"], "1");
  assert.equal(hit(limiter, "2").error, undefined);
  clock = 2000;
  assert.equal(hit(limiter).error, undefined);
});
test("bounded buckets fail closed without evicting active users and prune expired clients", () => {
  let clock = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, maxBuckets: 2, message: "limited", now: () => clock });
  hit(limiter, "1");
  hit(limiter, "2");
  assert.equal(hit(limiter, "3").error.status, 429);
  assert.equal(hit(limiter, "1").error.status, 429);
  clock = 1000;
  assert.equal(hit(limiter, "3").error, undefined);
});
test("authenticated action limits follow the user rather than changing IP", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, message: "limited" });
  hit(limiter, "1", "/confirm", { owner_id: 7 });
  assert.equal(hit(limiter, "2", "/confirm", { owner_id: 7 }).error.status, 429);
  assert.equal(hit(limiter, "1", "/confirm", { owner_id: 8 }).error, undefined);
  assert.throws(() => createRateLimiter({ windowMs: 0, max: 1 }));
});

test("rotating IPv6 addresses within one allocation cannot bypass the unauthenticated limit", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, message: "limited" });
  assert.equal(hit(limiter, "2001:db8:abcd:1200::1").error, undefined);
  assert.equal(hit(limiter, "2001:db8:abcd:12ff::2").error.status, 429);
  assert.equal(hit(limiter, "2001:db8:abcd:1300::1").error, undefined);
});

test("direct ingress ignores forged forwarding headers rather than granting fresh rate buckets", async (t) => {
  const app = express();
  configureSecurity(app);
  app.get("/probe", createRateLimiter({ windowMs: 10000, max: 1, message: "limited" }), (_req, res) =>
    res.json({ ok: true })
  );
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code }));
  const server = app.listen(0);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/probe`;
  assert.equal((await fetch(url, { headers: { "X-Forwarded-For": "198.51.100.1" } })).status, 200);
  assert.equal((await fetch(url, { headers: { "X-Forwarded-For": "198.51.100.2" } })).status, 429);
});
