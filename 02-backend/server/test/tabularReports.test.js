import test from "node:test";
import assert from "node:assert/strict";
import { start, request, account, branch, sale, ledger, roleToken, db } from "../test-support/operationsFixtures.js";
import { reportWorkbook } from "../src/services/reportWorkbook.js";
import { getTabularReport } from "../src/services/tabularReportService.js";
import { getAuthContext } from "../src/repositories/authRepository.js";
import { recordDataRevision } from "../src/services/dataRevisionService.js";
const dates = "fromDate=2026-08-17&toDate=2026-08-23";
async function fixture(t) {
  const server = start(t),
    owner = await account(server),
    id = await branch(server, owner, "=SUM(1,1) فرع 深圳");
  ledger(owner, id, "2026-08-18T12:00:00+03:00", {
    sales: 10000,
    discounts: 500,
    refunds: 100,
    food_costs: 2000,
    packaging: 200,
    delivery_commissions: 300,
    labor: 1000,
    rent: 500,
    utilities: 100,
    marketing: 100,
    miscellaneous_operating_expenses: 100
  });
  ledger(owner, id, "2026-08-11T12:00:00+03:00", {
    sales: 8000,
    discounts: 0,
    refunds: 0,
    food_costs: 2000,
    packaging: 200,
    delivery_commissions: 300,
    labor: 1000,
    rent: 500,
    utilities: 100,
    marketing: 100,
    miscellaneous_operating_expenses: 100
  });
  sale(owner, id, "2026-08-18T12:00:00+03:00", { gross: 10000 });
  const user = getAuthContext(owner.user.id, owner.organization.id, owner.restaurant.id);
  return {
    server,
    owner,
    id,
    user,
    get: (kind, extra = "") => request(server, `/reports/table?kind=${kind}&${dates}${extra}`, { token: owner.token })
  };
}
test("financial and branch reports reconcile current and previous imported-ledger inputs", async (t) => {
  const f = await fixture(t),
    r = await f.get("financial");
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const revenue = r.payload.rows.find((r) => r.key === "revenueMinor");
  assert.equal(revenue.current, 9400);
  assert.equal(revenue.previous, 8000);
  assert.equal(revenue.change, 1400);
  assert.equal(r.payload.rows.find((r) => r.key === "operatingProfitMinor").current, 5100);
  assert.equal(r.payload.taxTreatment, "not_modeled");
  assert.ok(r.payload.sources.financial.financials.current.lineage.sales.length);
  const b = await f.get("branches");
  assert.equal(b.status, 200);
  assert.deepEqual(
    b.payload.rows
      .filter((r) => r.key === "revenueMinor")
      .map((r) => r.current)
      .sort((a, b) => (a ?? -1) - (b ?? -1)),
    [null, 9400]
  );
});
test("missing costs and empty periods remain unavailable, while menu revenue remains recorded", async (t) => {
  const f = await fixture(t);
  const menu = await f.get("menu");
  assert.equal(menu.status, 200, JSON.stringify(menu.payload));
  assert.equal(menu.payload.rows[0].revenue, 10000);
  assert.equal(menu.payload.rows[0].profit, null);
  const empty = await request(f.server, "/reports/table?kind=financial&fromDate=2025-01-01&toDate=2025-01-02", {
    token: f.owner.token
  });
  assert.ok(empty.payload.rows.every((r) => r.current === null && r.previous === null && r.change === null));
});
test("ledger export keeps source ids and unknown tax instead of manufacturing a tax amount", async (t) => {
  const f = await fixture(t),
    r = await f.get("ledger");
  assert.equal(r.status, 200);
  assert.ok(r.payload.rows.length > 0);
  assert.ok(r.payload.rows.every((row) => row.tax === null && row.taxStatus === "not_modeled" && row.source));
  const res = await fetch(`http://127.0.0.1:${f.server.address().port}/api/reports/table.csv?kind=ledger&${dates}`, {
    headers: { Authorization: `Bearer ${f.owner.token}` }
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const csv = await res.text();
  assert.match(csv, /sourceType/);
  assert.match(csv, /not_modeled/);
  const audit = db.prepare("SELECT * FROM report_export_events WHERE restaurant_id=?").get(f.owner.restaurant.id);
  assert.equal(audit.row_count, r.payload.rows.length);
  assert.equal(audit.format, "csv");
});
test("exports defend against formula injection and reject stale imports and malformed query fields", async (t) => {
  const f = await fixture(t);
  const res = await fetch(`http://127.0.0.1:${f.server.address().port}/api/reports/table.csv?kind=branches&${dates}`, {
    headers: { Authorization: `Bearer ${f.owner.token}` }
  });
  assert.match(await res.text(), /'=SUM\(1,1\)/);
  recordDataRevision(f.user);
  assert.equal((await f.get("financial", "&expectedRevision=0")).status, 409);
  for (const suffix of ["&scope=organization", "&restaurantId=999", "&unknown=1", "&branchId=999&scope=branch"]) {
    assert.ok((await f.get("financial", suffix)).status >= 400);
  }
  assert.equal((await request(f.server, "/reports/table?fromDate=2026-08-17", { token: f.owner.token })).status, 400);
});
test("reports enforce tenant isolation, branch-manager boundaries, and viewer export denial", async (t) => {
  const f = await fixture(t),
    other = await account(f.server),
    manager = roleToken(f.owner, "branch_manager", f.id),
    viewer = roleToken(f.owner, "viewer");
  const scoped = await request(f.server, `/reports/table?kind=ledger&scope=branch&branchId=${f.id}&${dates}`, {
    token: manager
  });
  assert.equal(scoped.status, 200);
  assert.ok(scoped.payload.rows.every((r) => r.branch === f.id));
  assert.equal((await request(f.server, `/reports/table?scope=restaurant&${dates}`, { token: manager })).status, 403);
  assert.equal(
    (await request(f.server, `/reports/table?scope=branch&branchId=${f.id}&${dates}`, { token: other.token })).status,
    404
  );
  for (const path of ["/reports/table?kind=ledger", "/reports/table.csv", "/reports/table.xlsx"]) {
    assert.equal((await request(f.server, path, { token: viewer })).status, 403);
  }
});
function parts(buffer) {
  const result = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18),
      length = buffer.readUInt16LE(offset + 26),
      extra = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + length).toString();
    const start = offset + 30 + length + extra;
    result[name] = buffer.subarray(start, start + size).toString();
    offset = start + size;
  }
  return result;
}
test("formatted XLSX exports localized text as literal strings, with raw units and metadata sheets", async (t) => {
  const f = await fixture(t),
    report = getTabularReport(f.user, {
      kind: "branches",
      language: "ar",
      fromDate: "2026-08-17",
      toDate: "2026-08-23"
    });
  const data = reportWorkbook(report),
    files = parts(data);
  assert.ok(files["[Content_Types].xml"]);
  assert.match(files["xl/workbook.xml"], /Raw data/);
  assert.match(files["xl/worksheets/sheet1.xml"], /rightToLeft="1"/);
  assert.match(files["xl/worksheets/sheet1.xml"], /t="inlineStr"/);
  assert.match(files["xl/worksheets/sheet1.xml"], /=SUM\(1,1\) فرع 深圳/);
  assert.doesNotMatch(files["xl/worksheets/sheet1.xml"], /<f[ >]/);
  assert.match(files["xl/worksheets/sheet2.xml"], /<v>9400<\/v>/);
  assert.match(files["xl/worksheets/sheet3.xml"], /not_modeled/);
  const response = await fetch(
    `http://127.0.0.1:${f.server.address().port}/api/reports/table.xlsx?kind=financial&${dates}`,
    { headers: { Authorization: `Bearer ${f.owner.token}` } }
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /spreadsheetml.sheet/);
  assert.equal(Buffer.from(await response.arrayBuffer()).readUInt32LE(0), 0x04034b50);
});

test("confirmed sales import feeds financial, menu and ledger reports at the new revision", async (t) => {
  const server = start(t),
    owner = await account(server);
  const preview = await request(server, "/data/import-jobs/preview?templateKey=sales&filename=report-flow.csv", {
    token: owner.token,
    method: "POST",
    raw: "external_order_id,external_line_id,branch_code,created_at,channel,item_code,quantity,gross_sales,discount,refund_amount,delivery_commission\nREPORT-ORDER,1,MAIN,2026-08-18T12:00:00+03:00,dine_in,ITEM,2,120,5,0,0"
  });
  assert.equal(preview.status, 201, JSON.stringify(preview.payload));
  const confirm = await request(server, `/data/import-jobs/${preview.payload.id}/confirm`, {
    token: owner.token,
    method: "POST",
    body: { confirmationToken: preview.payload.confirmationToken }
  });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.payload));
  assert.equal(confirm.payload.firstInsight.revenueMinor, 11500);
  assert.equal(confirm.payload.firstInsight.orders, 1);
  assert.equal(confirm.payload.firstInsight.bestDish, "مندي / 米饭");
  const get = (kind) => request(server, `/reports/table?kind=${kind}&${dates}`, { token: owner.token });
  const financial = await get("financial"),
    menu = await get("menu"),
    ledgerReport = await get("ledger");
  assert.equal(financial.payload.dataRevision.revision, confirm.payload.dataRevision.revision);
  assert.equal(financial.payload.rows.find((r) => r.key === "revenueMinor").current, 11500);
  assert.equal(menu.payload.rows[0].revenue, 11500);
  assert.equal(menu.payload.rows[0].quantity, 2);
  assert.ok(ledgerReport.payload.rows.some((r) => r.source.includes("REPORT-ORDER")));
  assert.equal(financial.payload.rows.find((r) => r.key === "operatingProfitMinor").current, null);
});

test("oversized ledger exports fail explicitly instead of silently truncating", async (t) => {
  const f = await fixture(t);
  const insert = db.prepare(
    "INSERT INTO financial_ledger_entries(organization_id,restaurant_id,branch_id,category,amount_minor,occurred_at,source_type,source_reference,currency_code,created_by,scope_key) VALUES (?,?,?,'sales',1,'2026-08-18T12:00:00Z','manual',?,'SAR',?,?)"
  );
  db.transaction(() => {
    for (let i = 0; i < 5001; i++)
      insert.run(f.owner.organization.id, f.owner.restaurant.id, f.id, `limit-${i}`, f.owner.user.id, `branch:${f.id}`);
  })();
  const r = await f.get("ledger");
  assert.equal(r.status, 400);
  assert.match(r.payload.error, /5000/);
});
