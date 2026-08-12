import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { db } = await import("../src/db.js");
const { app } = await import("../src/index.js");

async function jsonRequest(server, path, { token, method = "GET", body } = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

async function previewCsv(server, token, templateKey, filename, csv) {
  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/data/import-jobs/preview?templateKey=${encodeURIComponent(
      templateKey
    )}&filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        Authorization: `Bearer ${token}`
      },
      body: Buffer.from(csv, "utf8")
    }
  );
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

function registerOwner(server, stamp) {
  return jsonRequest(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Mapping Owner",
      email: `mapping-${stamp}@example.test`,
      password: "demo12345",
      organizationName: `Mapping Org ${stamp}`,
      restaurantName: `Mapping Restaurant ${stamp}`,
      branchName: "Guangzhou Main",
      branchCode: "GZ-01",
      city: "Guangzhou"
    }
  });
}

async function confirmJob(server, token, jobId, confirmationToken) {
  return jsonRequest(server, `/api/data/import-jobs/${jobId}/confirm`, {
    token,
    method: "POST",
    body: { confirmationToken }
  });
}

test("Task 2.3 automatically maps common column aliases", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;
  const restaurantId = registration.payload.restaurant.id;
  const itemCode = `ALIAS-${String(Date.now()).slice(-6)}`;

  const preview = await previewCsv(
    server,
    token,
    "menu",
    "menu-aliases.csv",
    `Item Code,Menu Item,Category,Sale Price,Enabled\n${itemCode},مندي خاص,Main,55.50,true`
  );

  assert.equal(preview.status, 201);
  assert.equal(preview.payload.status, "preview_ready");
  assert.equal(preview.payload.validationStatus, "ready");
  assert.equal(preview.payload.workflowStatus, "ready");
  assert.equal(preview.payload.statistics.accepted, 1);
  assert.equal(preview.payload.mapping.ready, true);
  assert.equal(
    preview.payload.mapping.columns.find((mapping) => mapping.sourceColumn === "Sale Price").targetField,
    "selling_price"
  );
  assert.equal(
    preview.payload.mapping.columns.find((mapping) => mapping.sourceColumn === "Menu Item").targetField,
    "name"
  );
  assert.equal(typeof preview.payload.confirmationToken, "string");

  const confirmed = await confirmJob(server, token, preview.payload.id, preview.payload.confirmationToken);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.payload.status, "confirmed");
  assert.equal(
    db.prepare("SELECT name FROM catalog_items WHERE restaurant_id=? AND item_code=?").get(restaurantId, itemCode).name,
    "مندي خاص"
  );
});

test("Task 2.3 returns needs_mapping and supports manual mapping correction", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;
  const code = `MAP-${String(Date.now()).slice(-5)}`;

  const preview = await previewCsv(
    server,
    token,
    "branches",
    "branches-custom.csv",
    `Code,Branch Name,City Name\n${code},فرع تجريبي,Shenzhen`
  );

  assert.equal(preview.status, 201);
  assert.equal(preview.payload.validationStatus, "needs_mapping");
  assert.equal(preview.payload.workflowStatus, "needs_mapping");
  assert.equal(preview.payload.confirmationToken, null);
  assert.equal(preview.payload.mapping.missingRequiredMappings.includes("branch_code"), true);
  assert.equal(preview.payload.mapping.missingRequiredMappings.includes("city"), true);
  assert.equal(preview.payload.previewRows[0].status, "pending_mapping");

  const blocked = await confirmJob(server, token, preview.payload.id, "not-ready");
  assert.equal(blocked.status, 409);

  const mappingUpdate = await jsonRequest(server, `/api/data/import-jobs/${preview.payload.id}/mapping`, {
    token,
    method: "PUT",
    body: {
      mappings: [
        { sourceColumn: "Code", targetField: "branch_code" },
        { sourceColumn: "Branch Name", targetField: "name" },
        { sourceColumn: "City Name", targetField: "city" }
      ]
    }
  });

  assert.equal(mappingUpdate.status, 200);
  assert.equal(mappingUpdate.payload.validationStatus, "ready");
  assert.equal(mappingUpdate.payload.mapping.ready, true);
  assert.equal(mappingUpdate.payload.statistics.accepted, 1);
  assert.equal(typeof mappingUpdate.payload.confirmationToken, "string");

  const confirmed = await confirmJob(server, token, preview.payload.id, mappingUpdate.payload.confirmationToken);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.payload.status, "confirmed");
});

test("Task 2.3 exposes row, source column, value, and blocking validation errors", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;

  const preview = await previewCsv(
    server,
    token,
    "menu",
    "invalid-menu.csv",
    "Item Code,Menu Item,Sale Price\nBAD-PRICE,Test Item,abc"
  );

  assert.equal(preview.status, 201);
  assert.equal(preview.payload.validationStatus, "validation_failed");
  assert.equal(preview.payload.workflowStatus, "validation_failed");
  assert.equal(preview.payload.statistics.rejected, 1);
  assert.equal(preview.payload.confirmationToken, null);

  const issue = preview.payload.rowErrors[0].errors.find((error) => error.code === "invalid_money");
  assert.equal(preview.payload.rowErrors[0].rowNumber, 2);
  assert.equal(issue.field, "selling_price");
  assert.equal(issue.sourceColumn, "Sale Price");
  assert.equal(issue.value, "abc");
  assert.equal(issue.severity, "error");

  const blocked = await confirmJob(server, token, preview.payload.id, "cannot-confirm");
  assert.equal(blocked.status, 409);
});

test("Task 2.3 separates unmapped optional columns into warnings", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;
  const code = `WARN-${String(Date.now()).slice(-5)}`;

  const preview = await previewCsv(
    server,
    token,
    "branches",
    "branches-notes.csv",
    `branch_code,name,city,Notes\n${code},Branch With Notes,Guangzhou,ignore me`
  );

  assert.equal(preview.status, 201);
  assert.equal(preview.payload.validationStatus, "ready");
  assert.equal(preview.payload.statistics.accepted, 1);
  assert.equal(preview.payload.statistics.warnings, 1);
  assert.deepEqual(preview.payload.mapping.unmappedColumns, ["Notes"]);
  assert.equal(preview.payload.mapping.warnings[0].code, "unmapped_optional_column");
  assert.equal(typeof preview.payload.confirmationToken, "string");
});

test("Task 2.3 rejects invalid manual mappings", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await registerOwner(server, stamp);
  const token = registration.payload.token;

  const preview = await previewCsv(
    server,
    token,
    "branches",
    "branches-custom.csv",
    "Code,Branch Name,City Name\nB-1,Test,Guangzhou"
  );

  const invalid = await jsonRequest(server, `/api/data/import-jobs/${preview.payload.id}/mapping`, {
    token,
    method: "PUT",
    body: {
      mappings: [
        { sourceColumn: "Code", targetField: "branch_code" },
        { sourceColumn: "Branch Name", targetField: "branch_code" },
        { sourceColumn: "City Name", targetField: "city" }
      ]
    }
  });

  assert.equal(invalid.status, 400);
});
