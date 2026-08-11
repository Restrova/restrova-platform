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
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return { status: response.status, payload, headers: response.headers };
}

async function registerOwner(server) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const response = await request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Template Owner",
      email: `template-${stamp}@example.test`,
      password: "demo12345",
      organizationName: `Template Org ${stamp}`,
      restaurantName: `Template Restaurant ${stamp}`,
      branchName: "Guangzhou Main",
      branchCode: "GZ-01",
      city: "Guangzhou"
    }
  });
  assert.equal(response.status, 201);
  return response.payload.token;
}

test("authenticated users can list the four Task 2 import templates", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const token = await registerOwner(server);

  const response = await request(server, "/api/data/templates", { token });

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.payload.map((template) => template.key),
    ["branches", "costs", "menu", "sales"]
  );
  assert.equal(response.payload.every((template) => template.version === 1), true);
  assert.equal(response.payload.every((template) => template.downloadPath.endsWith("/download")), true);
});

test("template metadata exposes required fields and UTF-8 examples", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const token = await registerOwner(server);

  const menu = await request(server, "/api/data/templates/menu", { token });
  assert.equal(menu.status, 200);
  assert.deepEqual(menu.payload.requiredColumns, ["item_code", "name", "selling_price"]);
  assert.equal(menu.payload.exampleRow.name, "مندي دجاج");

  const sales = await request(server, "/api/data/templates/sales", { token });
  assert.equal(sales.status, 200);
  assert.match(sales.payload.exampleRow.created_at, /\+08:00$/);
  assert.equal(sales.payload.columns.find((column) => column.name === "channel").type, "enum");
});

test("template download returns a BOM-prefixed CSV header without sample data", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const token = await registerOwner(server);

  const response = await request(server, "/api/data/templates/branches/download", { token });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/csv/);
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="restrova-branches-template-v1.csv"'
  );
  assert.deepEqual([...response.payload.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(
    response.payload.subarray(3).toString("utf8"),
    "branch_code,name,city,address,phone,pos_system,operating_day_start,operating_day_end\n"
  );
});

test("template API requires authentication and rejects unknown template keys safely", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const unauthenticated = await request(server, "/api/data/templates");
  assert.equal(unauthenticated.status, 401);

  const token = await registerOwner(server);
  const unknown = await request(server, "/api/data/templates/unknown", { token });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.payload.code, "VALIDATION_ERROR");
});
