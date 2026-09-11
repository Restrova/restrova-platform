import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");
const { db } = await import("../src/db.js");
const { signContext } = await import("../src/services/authService.js");
const { financialCategories } = await import("../src/services/financialService.js");
const periodQuery =
  "period=custom&fromDate=2026-08-17&toDate=2026-08-23&anchor=2026-08-24T12:00:00Z&comparison=previous_period";

function start(t) {
  const server = app.listen(0);
  t.after(() => server.close());
  return server;
}
async function request(server, path, { token, body, method = "GET", raw } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method,
    headers: {
      "Content-Type": raw ? "text/csv" : "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: raw || (body ? JSON.stringify(body) : undefined)
  });
  return { status: response.status, payload: await response.json() };
}
async function account(server, timezone = "Asia/Riyadh", currency = "SAR") {
  const response = await request(server, "/auth/register", {
    method: "POST",
    body: {
      email: `operations-${crypto.randomUUID()}@example.test`,
      password: "operations-test-password",
      name: "Operations Owner",
      organizationName: "Operations Group",
      restaurantName: "مطعم الاختبار",
      branchName: "الفرع الرئيسي",
      branchCode: "MAIN",
      city: "Riyadh",
      timezone,
      currency
    }
  });
  assert.equal(response.status, 201);
  const result = response.payload;
  result.itemId = Number(
    db
      .prepare(
        "INSERT INTO catalog_items(organization_id,restaurant_id,item_code,name,selling_price_minor) VALUES (?,?,?,?,?)"
      )
      .run(result.organization.id, result.restaurant.id, "ITEM", "مندي / 米饭", 10000).lastInsertRowid
  );
  return result;
}
async function branch(server, owner, name, lifecycle = { openedOn: "2025-01-01" }) {
  const response = await request(server, "/branches", {
    token: owner.token,
    method: "POST",
    body: { name, code: crypto.randomUUID(), city: "Riyadh", ...lifecycle }
  });
  assert.equal(response.status, 201);
  return response.payload.id;
}
function sale(
  owner,
  branchId,
  date,
  {
    gross = 10000,
    discount = 0,
    refund = 0,
    commission = 0,
    channel = "dine_in",
    aggregator = null,
    order = crypto.randomUUID(),
    line = "1"
  } = {}
) {
  db.prepare(
    `INSERT INTO sales_lines(organization_id,restaurant_id,branch_id,catalog_item_id,external_order_id,external_line_id,created_at,channel,aggregator_name,quantity,gross_sales_minor,discount_minor,refund_amount_minor,delivery_commission_minor) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?)`
  ).run(
    owner.organization.id,
    owner.restaurant.id,
    branchId,
    owner.itemId,
    order,
    line,
    date,
    channel,
    aggregator,
    gross,
    discount,
    refund,
    commission
  );
}
function ledger(owner, branchId, date, amounts) {
  const insert = db.prepare(
    `INSERT INTO financial_ledger_entries(organization_id,restaurant_id,branch_id,category,amount_minor,currency_code,occurred_at,source_type,source_reference,evidence_json,created_by,scope_key) VALUES (?,?,?,?,?,?,?,'manual',?,'{}',?,?)`
  );
  for (const { key } of financialCategories)
    insert.run(
      owner.organization.id,
      owner.restaurant.id,
      branchId,
      key,
      amounts[key] || 0,
      owner.organization.currency,
      date,
      `${branchId}:${date}:${key}`,
      owner.user.id,
      `branch:${branchId}`
    );
}
function roleToken(owner, role, branchId = null) {
  const id = Number(
    db
      .prepare("INSERT INTO owners(email,password_hash,name) VALUES (?,'unused','Viewer')")
      .run(`${role}-${crypto.randomUUID()}@example.test`).lastInsertRowid
  );
  db.prepare("INSERT INTO organization_users(organization_id,owner_id,role,branch_id) VALUES (?,?,?,?)").run(
    owner.organization.id,
    id,
    role,
    branchId
  );
  return signContext({
    owner_id: id,
    organization_id: owner.organization.id,
    restaurant_id: owner.restaurant.id,
    role
  });
}

export { start, request, account, branch, sale, ledger, roleToken, periodQuery, db };
