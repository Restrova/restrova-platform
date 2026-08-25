import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.IMPORT_MAX_FILE_SIZE_BYTES = "2048";
process.env.IMPORT_MAX_ROWS = "25";
process.env.IMPORT_MAX_COLUMNS = "12";
process.env.IMPORT_MAX_CELL_LENGTH = "128";
process.env.IMPORT_PREVIEW_ROWS = "20";
process.env.IMPORT_CONFIRMATION_TOKEN_TTL_SECONDS = "60";

const { db } = await import("../src/db.js");
const { app } = await import("../src/index.js");
const { createRateLimiter } = await import("../src/middleware/security.js");

async function request(server, path, { token, method = "GET", body, rawBody, contentType, requestId } = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      "Content-Type": contentType || "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestId ? { "X-Request-Id": requestId } : {})
    },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

function registerOwner(server, prefix) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return request(server, "/api/auth/register", {
    method: "POST",
    body: {
      name: `${prefix} Owner`,
      email: `${prefix}-${stamp}@example.test`,
      password: "demo12345",
      organizationName: `${prefix} Org ${stamp}`,
      restaurantName: `${prefix} Restaurant ${stamp}`,
      branchName: `${prefix} Main`,
      branchCode: `${prefix.slice(0, 2).toUpperCase()}-${String(Date.now()).slice(-4)}`,
      city: "Guangzhou"
    }
  });
}

function previewFile(server, token, templateKey, filename, body, options = {}) {
  return request(
    server,
    `/api/data/import-jobs/preview?templateKey=${encodeURIComponent(templateKey)}&filename=${encodeURIComponent(filename)}`,
    {
      token,
      method: "POST",
      rawBody: Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8"),
      contentType: options.contentType || "text/csv; charset=utf-8",
      requestId: options.requestId
    }
  );
}

test("Task 2.5/2.6 traces history, caps preview rows, and reports metrics", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "audit");
  assert.equal(owner.status, 201);

  const rows = Array.from({ length: 21 }, (_, index) => `AUD-${Date.now()}-${index},Branch ${index},广州`).join("\n");
  const preview = await previewFile(
    server,
    owner.payload.token,
    "branches",
    "branches.csv",
    `branch_code,name,city\n${rows}`,
    { requestId: "audit-preview-request" }
  );

  assert.equal(preview.status, 201);
  assert.equal(preview.payload.statistics.total, 21);
  assert.equal(preview.payload.previewRows.length, 20);
  assert.equal(
    preview.payload.auditEvents.some((event) => event.eventType === "file_uploaded"),
    true
  );
  assert.equal(
    preview.payload.auditEvents.some((event) => event.eventType === "import_ready"),
    true
  );
  assert.equal(
    preview.payload.auditEvents.every((event) => event.requestId === "audit-preview-request"),
    true
  );
  assert.equal(JSON.stringify(preview.payload.auditEvents).includes("confirmationToken"), false);

  const history = await request(server, "/api/data/import-jobs?status=ready&template=branches", {
    token: owner.payload.token
  });
  assert.equal(history.status, 200);
  assert.equal(
    history.payload.jobs.some((job) => job.id === preview.payload.id),
    true
  );

  const confirmed = await request(server, `/api/data/import-jobs/${preview.payload.id}/confirm`, {
    token: owner.payload.token,
    method: "POST",
    body: { confirmationToken: preview.payload.confirmationToken },
    requestId: "audit-confirm-request"
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.payload.statistics.imported, 21);
  assert.equal(
    confirmed.payload.auditEvents.some(
      (event) => event.eventType === "import_completed" && event.requestId === "audit-confirm-request"
    ),
    true
  );
  assert.equal(confirmed.payload.confirmationExpiresAt, null);

  const metrics = await request(server, "/api/data/import-jobs/metrics", { token: owner.payload.token });
  assert.equal(metrics.status, 200);
  assert.equal(metrics.payload.importsStarted >= 1, true);
  assert.equal(metrics.payload.importsCompleted >= 1, true);
  assert.equal(metrics.payload.rowsImported >= 21, true);

  const completedHistory = await request(server, "/api/data/import-jobs?status=completed", {
    token: owner.payload.token
  });
  assert.equal(
    completedHistory.payload.jobs.some((job) => job.id === preview.payload.id),
    true
  );
});

test("Task 2.7 rejects unsafe, malformed, and excessive uploads", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const owner = await registerOwner(server, "limits");
  const token = owner.payload.token;

  const unsupported = await previewFile(server, token, "branches", "branches.txt", "branch_code,name,city\nA,A,A");
  assert.equal(unsupported.status, 400);

  const mismatched = await previewFile(server, token, "branches", "branches.csv", Buffer.from("PK\x03\x04bad"));
  assert.equal(mismatched.status, 400);

  const malformedXlsx = await previewFile(server, token, "branches", "branches.xlsx", Buffer.from("not-a-zip"), {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  assert.equal(malformedXlsx.status, 400);

  const invalidUtf8 = await previewFile(server, token, "branches", "branches.csv", Buffer.from([0xff, 0xfe, 0xfd]));
  assert.equal(invalidUtf8.status, 400);
  assert.match(invalidUtf8.payload.error, /UTF-8/);

  const oversized = await previewFile(server, token, "branches", "branches.csv", "x".repeat(3000));
  assert.equal(oversized.status, 413);
  assert.equal(oversized.payload.error, "File exceeds the maximum allowed upload size.");

  const tooManyRows = Array.from({ length: 26 }, (_, index) => `R-${index},Name ${index},City`).join("\n");
  const excessiveRows = await previewFile(
    server,
    token,
    "branches",
    "branches.csv",
    `branch_code,name,city\n${tooManyRows}`
  );
  assert.equal(excessiveRows.status, 400);
  assert.match(excessiveRows.payload.error, /25 rows/);

  const headers = Array.from({ length: 13 }, (_, index) => `column_${index}`).join(",");
  const excessiveColumns = await previewFile(server, token, "branches", "branches.csv", `${headers}\n${headers}`);
  assert.equal(excessiveColumns.status, 400);
  assert.match(excessiveColumns.payload.error, /12 columns/);

  const excessiveCell = await previewFile(
    server,
    token,
    "branches",
    "branches.csv",
    `branch_code,name,city\nCELL,${"a".repeat(129)},City`
  );
  assert.equal(excessiveCell.status, 400);

  const formula = await previewFile(
    server,
    token,
    "branches",
    "branches.csv",
    "branch_code,name,city\nFORMULA,=HYPERLINK(1),City"
  );
  assert.equal(formula.status, 201);
  assert.equal(formula.payload.validationStatus, "validation_failed");
  assert.equal(
    formula.payload.rowErrors[0].errors.some((error) => error.code === "unsafe_formula"),
    true
  );

  const timezone = await previewFile(
    server,
    token,
    "sales",
    "sales.csv",
    "external_order_id,external_line_id,branch_code,created_at,channel,item_code,quantity,gross_sales\nO-1,L-1,NOPE,2026-08-25T12:00:00,dine_in,NOPE,1,10.00"
  );
  assert.equal(timezone.status, 201);
  assert.equal(
    timezone.payload.rowErrors[0].errors.some((error) => error.code === "invalid_datetime"),
    true
  );
});

test("Task 2.5/2.7 enforce tenant access, token expiry, cancellation, and owner-only imports", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const first = await registerOwner(server, "access-a");
  const second = await registerOwner(server, "access-b");

  const preview = await previewFile(
    server,
    first.payload.token,
    "branches",
    "branches.csv",
    `branch_code,name,city\nEXP-${Date.now()},Expiring,Guangzhou`
  );
  assert.equal(preview.status, 201);

  const unauthenticated = await request(server, "/api/data/import-jobs");
  assert.equal(unauthenticated.status, 401);

  const crossTenant = await request(server, `/api/data/import-jobs/${preview.payload.id}`, {
    token: second.payload.token
  });
  assert.equal(crossTenant.status, 404);

  db.prepare("UPDATE import_jobs SET confirmation_token_expires_at=? WHERE id=?").run(
    "2000-01-01T00:00:00.000Z",
    preview.payload.id
  );
  const expired = await request(server, `/api/data/import-jobs/${preview.payload.id}/confirm`, {
    token: first.payload.token,
    method: "POST",
    body: { confirmationToken: preview.payload.confirmationToken },
    requestId: "expired-token-request"
  });
  assert.equal(expired.status, 403);

  const expiredJob = await request(server, `/api/data/import-jobs/${preview.payload.id}`, {
    token: first.payload.token
  });
  assert.equal(expiredJob.payload.workflowStatus, "failed");
  assert.equal(
    expiredJob.payload.auditEvents.some(
      (event) => event.eventType === "import_failed" && event.details.failureStage === "confirmation"
    ),
    true
  );
  const failedMetrics = await request(server, "/api/data/import-jobs/metrics", { token: first.payload.token });
  assert.equal(failedMetrics.payload.importsFailed >= 1, true);

  const cancellable = await previewFile(
    server,
    first.payload.token,
    "branches",
    "branches.csv",
    `branch_code,name,city\nCAN-${Date.now()},Cancelled,Shenzhen`
  );
  const cancelled = await request(server, `/api/data/import-jobs/${cancellable.payload.id}/cancel`, {
    token: first.payload.token,
    method: "POST",
    requestId: "cancel-request"
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.status, "cancelled");
  assert.equal(
    cancelled.payload.auditEvents.some((event) => event.eventType === "import_cancelled"),
    true
  );

  const invite = await request(server, "/api/users/invite", {
    token: first.payload.token,
    method: "POST",
    body: {
      email: `import-manager-${Date.now()}@example.test`,
      name: "Import Manager",
      role: "branch_manager",
      branchId: first.payload.branches[0].id
    }
  });
  const login = await request(server, "/api/auth/login", {
    method: "POST",
    body: { email: invite.payload.email, password: invite.payload.temporaryPassword }
  });
  const managerImport = await previewFile(
    server,
    login.payload.token,
    "branches",
    "branches.csv",
    "branch_code,name,city\nNOPE,Nope,City"
  );
  assert.equal(managerImport.status, 403);
});

test("Task 2.7 rate limits repeated import actions", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, message: "Import limit reached" });
  const req = {
    user: { owner_id: 999_999 },
    baseUrl: "/api",
    path: "/data/import-jobs/preview",
    route: { path: "/data/import-jobs/preview" }
  };
  const res = { setHeader() {} };
  const results = [];

  limiter(req, res, (error) => results.push(error || null));
  limiter(req, res, (error) => results.push(error || null));
  limiter(req, res, (error) => results.push(error || null));

  assert.deepEqual(results.slice(0, 2), [null, null]);
  assert.equal(results[2].status, 429);
  assert.equal(results[2].message, "Import limit reached");
});
