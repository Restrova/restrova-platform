import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");

test("registration checks email in advance, normalizes case, and rechecks conflicts at final submit", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const email = `early-${crypto.randomUUID()}@example.test`;
  const before = await request("email-availability", { email: ` ${email.toUpperCase()} ` });
  assert.equal(before.status, 200);
  assert.deepEqual(before.data, { available: true });
  assert.equal(before.headers.get("cache-control"), "no-store");
  assert.ok(before.headers.get("ratelimit-limit"));
  for (const invalid of ["invalid", "x@", "a".repeat(255) + "@example.test", null]) {
    assert.equal((await request("email-availability", { email: invalid })).status, 400);
  }
  const profile = {
    name: "Owner",
    email: email.toUpperCase(),
    password: "email-test-password",
    organizationName: "Org",
    restaurantName: "Restaurant",
    branchName: "Main"
  };
  assert.equal((await request("register", profile)).status, 201);
  assert.deepEqual((await request("email-availability", { email })).data, { available: false });
  assert.equal((await request("register", { ...profile, email })).status, 409);
  assert.equal((await request("login", { email: ` ${email.toUpperCase()} `, password: profile.password })).status, 200);
});
