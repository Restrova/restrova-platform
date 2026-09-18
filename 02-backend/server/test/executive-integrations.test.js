import test from "node:test";
import assert from "node:assert/strict";
import { start, request, account, branch, sale, ledger, roleToken } from "../test-support/operationsFixtures.js";
import { getAuthContext } from "../src/repositories/authRepository.js";
import { rankReportActions, csvCell } from "../src/services/executiveReportService.js";
import { localDate, dayOffset } from "../src/services/historicalSeriesService.js";
const today = () => localDate(new Date().toISOString(), "Asia/Riyadh");
async function fixture(t) {
  const server = start(t),
    owner = await account(server),
    id = await branch(server, owner, "Report branch"),
    user = getAuthContext(owner.user.id, owner.organization.id, owner.restaurant.id);
  return {
    server,
    owner,
    id,
    user,
    get: (path) => request(server, path, { token: owner.token }),
    post: (path, body) => request(server, path, { token: owner.token, body, method: "POST" })
  };
}
test("#78 only three unique evidence-backed actions survive deterministic risk ranking; no savings invented", () => {
  const item = (n, action) => ({
    key: String(n),
    branchId: 1,
    item: { id: n },
    recommendedAction: action,
    lineage: { sales: [n] },
    confidence: { level: "medium" }
  });
  const candidates = [
    item(1, "promote_item"),
    item(2, "raise_price"),
    item(3, "review_high_refunds"),
    item(4, "reduce_ingredient_cost"),
    item(4, "reduce_ingredient_cost"),
    { ...item(5, "raise_price"), lineage: {} }
  ];
  assert.deepEqual(
    rankReportActions([{ recommendations: candidates }]).map((r) => r.key),
    ["3", "4", "2"]
  );
  assert.deepEqual(rankReportActions([{ recommendations: [] }]), []);
});
test("#79 weekly report reconciles dated trend evidence and keeps missing days unavailable", async (t) => {
  const f = await fixture(t);
  for (let i = -7; i < 0; i++) {
    sale(f.owner, f.id, `${dayOffset(today(), i)}T12:00:00+03:00`, { gross: 10000 });
    ledger(f.owner, f.id, `${dayOffset(today(), i)}T12:00:00+03:00`, { sales: 10000, food_costs: 3000 });
  }
  const r = await f.get(`/reports/executive?scope=branch&branchId=${f.id}&cadence=weekly&language=en`);
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  assert.equal(r.payload.trend.length, 7);
  assert.equal(r.payload.claims.find((c) => c.key === "revenue").value, 70000);
  assert.equal(
    r.payload.trend.reduce((sum, d) => sum + d.revenueMinor, 0),
    70000
  );
  assert.ok(r.payload.trend.every((d) => r.payload.sources.some((s) => s.id === d.sourceIds[0])));
  assert.ok(r.payload.topActions.length <= 3);
  assert.ok(r.payload.topActions.every((a) => a.expectedSavingsMinor === null));
  const empty = await f.get(
    `/reports/executive?scope=branch&branchId=${f.id}&cadence=weekly&fromDate=2025-01-01&toDate=2025-01-07`
  );
  assert.ok(empty.payload.trend.every((d) => d.revenueMinor === null));
});
test("#80 monthly uses previous complete calendar month in restaurant timezone and includes operational and financial pack", async (t) => {
  const f = await fixture(t),
    r = await f.get(`/reports/executive?scope=branch&branchId=${f.id}&cadence=monthly&language=zh`);
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const last = dayOffset(`${today().slice(0, 7)}-01`, -1);
  assert.equal(r.payload.period.toDate, last);
  assert.equal(r.payload.period.fromDate, last.slice(0, 7) + "-01");
  assert.equal(r.payload.trend.length, Number(last.slice(8)));
  for (const key of ["profit", "margin", "orders", "aov", "best", "top", "worst", "alerts"])
    assert.ok(r.payload.claims.some((c) => c.key === key));
  assert.equal(r.payload.language, "zh");
  const other = await account(f.server);
  assert.equal(
    (await request(f.server, `/reports/executive?scope=branch&branchId=${f.id}`, { token: other.token })).status,
    404
  );
  assert.equal((await f.get("/reports/executive?fromDate=2025-01-01")).status, 400);
  assert.equal((await f.get("/reports/executive?cadence=yearly")).status, 400);
});
test("#81 exports scoped exact values, unavailable blanks and spreadsheet-safe text", async (t) => {
  const f = await fixture(t);
  const response = await fetch(
    `http://127.0.0.1:${f.server.address().port}/api/reports/export.csv?scope=branch&branchId=${f.id}&language=ar`,
    { headers: { Authorization: `Bearer ${f.owner.token}` } }
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.match(response.headers.get("content-disposition"), /attachment/);
  const csv = await response.text();
  assert.match(csv, /insufficient_data/);
  assert.match(csv, /الربح/);
  assert.match(csv, /source_ids/);
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.equal(csvCell(-50), '"-50"');
  assert.equal(csvCell("\t+formula"), '"\'\t+formula"');
  const manager = roleToken(f.owner, "branch_manager", f.id);
  assert.equal((await request(f.server, "/reports/executive?scope=restaurant", { token: manager })).status, 403);
});
test("#82 source adapter maps, validates and confirms through the shared import store with lineage and revision", async (t) => {
  const f = await fixture(t),
    created = await f.post("/integrations", { name: "POS export", templateKey: "sales" });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  const id = created.payload.id;
  const csv = `Ticket,Line,Location,Time,Channel,SKU,Qty,Amount,Discount,Refund,Commission\nEXT-1,1,MAIN,${dayOffset(today(), -1)}T12:00:00+03:00,dine_in,ITEM,1,50,0,0,0`;
  const preview = await request(f.server, `/integrations/${id}/preview?filename=source.csv`, {
    token: f.owner.token,
    method: "POST",
    raw: csv
  });
  assert.equal(preview.status, 201, JSON.stringify(preview.payload));
  assert.equal(preview.payload.confirmationToken, null);
  const targets = [
    "external_order_id",
    "external_line_id",
    "branch_code",
    "created_at",
    "channel",
    "item_code",
    "quantity",
    "gross_sales",
    "discount",
    "refund_amount",
    "delivery_commission"
  ];
  const mappings = csv
    .split("\n")[0]
    .split(",")
    .map((sourceColumn, i) => ({ sourceColumn, targetField: targets[i] }));
  const mapped = await f.post(`/integrations/${id}/jobs/${preview.payload.id}/mapping`, { mappings });
  assert.equal(mapped.status, 200, JSON.stringify(mapped.payload));
  assert.ok(mapped.payload.confirmationToken);
  assert.equal((await f.get("/data/revision")).payload.revision, 0);
  const confirmed = await f.post(`/integrations/${id}/jobs/${preview.payload.id}/confirm`, {
    confirmationToken: mapped.payload.confirmationToken
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.payload));
  assert.equal(confirmed.payload.dataRevision.revision, 1);
  const report = await f.get(`/reports/executive?scope=branch&branchId=${f.owner.branches[0].id}`);
  assert.equal(report.payload.claims.find((c) => c.key === "revenue").value, 5000);
  assert.ok(report.payload.sources.some((s) => JSON.stringify(s.data).includes("EXT-1")));
  const second = await request(f.server, `/integrations/${id}/preview?filename=source.csv`, {
    token: f.owner.token,
    method: "POST",
    raw: csv.replace("EXT-1", "EXT-2")
  });
  assert.equal(second.payload.validationStatus, "ready");
  assert.ok(second.payload.confirmationToken);
  const history = await f.get(`/integrations/${id}/history`);
  assert.equal(history.payload.jobs.length, 2);
  assert.equal(history.payload.connector.liveConnection, false);
});
test("connector boundaries reject foreign owners, branch roles, arbitrary adapters and mismatched jobs", async (t) => {
  const f = await fixture(t),
    other = await account(f.server),
    created = await f.post("/integrations", { name: "Costs", templateKey: "costs" }),
    id = created.payload.id;
  assert.equal((await request(f.server, `/integrations/${id}/history`, { token: other.token })).status, 404);
  for (const role of ["viewer", "branch_manager"]) {
    const token = roleToken(f.owner, role, f.id);
    assert.equal((await request(f.server, "/integrations", { token })).status, 403);
  }
  assert.equal(
    (await f.post("/integrations", { name: "Unsafe", templateKey: "sales", url: "http://localhost" })).status,
    400
  );
  assert.equal((await f.post(`/integrations/${id}/jobs/99999/confirm`, { confirmationToken: "bad" })).status, 404);
  const invalid = await request(f.server, `/integrations/${id}/preview?filename=test.csv`, {
    token: f.owner.token,
    method: "POST",
    raw: "item_code,direct_food_cost,effective_from\nITEM,-2,2025-01-01T00:00:00Z"
  });
  assert.equal(invalid.status, 201);
  assert.equal(invalid.payload.confirmationToken, null);
  assert.equal((await f.get("/data/revision")).payload.revision, 0);
});
