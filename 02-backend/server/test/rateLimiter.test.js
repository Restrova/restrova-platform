import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
const { createRateLimiter } = await import("../src/middleware/security.js");
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
