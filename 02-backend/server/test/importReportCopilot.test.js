import test from "node:test";
import assert from "node:assert/strict";
import { start, request, account, db } from "../test-support/operationsFixtures.js";
const header = "item_name,quantity,gross_sales,period_start,period_end,record_type,channel,source_sheet,source_row";
async function fixture(
  t,
  rows = [
    "Soup,12,240,2026-01-18,2026-09-08,period_summary,dine_in,Source,4",
    "Rice,20,500,2026-01-18,2026-09-08,period_summary,takeaway,Source,5",
    "Subtotal,32,740,2026-01-18,2026-09-08,subtotal,dine_in,Source,6"
  ]
) {
  const server = start(t),
    owner = await account(server);
  const preview = await request(server, "/data/import-jobs/preview?templateKey=sales&filename=aggregate.csv", {
    token: owner.token,
    method: "POST",
    raw: [header, ...rows].join("\n")
  });
  assert.equal(preview.status, 201, JSON.stringify(preview.payload));
  const id = preview.payload.id;
  return {
    server,
    owner,
    id,
    ask: (message, extra = {}) =>
      request(server, "/copilot/ask", {
        token: owner.token,
        method: "POST",
        body: {
          message,
          importJobId: id,
          language: "ar",
          scope: "restaurant",
          requestKey: crypto.randomUUID(),
          ...extra
        }
      })
  };
}
test("aggregate upload answers preserve provenance, exclude subtotals and support long-period followups", async (t) => {
  const f = await fixture(t);
  const before = db.prepare("SELECT COUNT(*) AS n FROM sales_lines").get();
  const r = await f.ask("حلل التقرير");
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const a = r.payload.answer;
  assert.equal(a.currencyCode, null);
  assert.deepEqual(a.period, { fromDate: "2026-01-18", toDate: "2026-09-08" });
  assert.equal(a.sources[0].data.excludedSubtotalRows, 1);
  assert.deepEqual(
    a.sources[0].data.topRows.map((r) => r.sales),
    [500, 240]
  );
  assert.equal(a.sources[0].data.topRows[0].sourceRow, "5");
  assert.match(a.content, /العملة غير مؤكدة/);
  assert.deepEqual(db.prepare("SELECT COUNT(*) AS n FROM sales_lines").get(), before);
  const follow = await f.ask("وش توصياتك؟", {
    threadId: r.payload.threadId,
    version: r.payload.version,
    importJobId: undefined
  });
  assert.equal(follow.status, 200, JSON.stringify(follow.payload));
  assert.equal(follow.payload.answer.importJobId, f.id);
  const history = await request(f.server, `/copilot/threads/${r.payload.threadId}`, { token: f.owner.token });
  assert.equal(history.status, 200);
  assert.equal(history.payload.turns.length, 2);
  const list = await request(f.server, "/copilot/threads", { token: f.owner.token });
  assert.equal(list.payload.threads[0].importJobId, f.id);
});
test("aggregate reports refuse unsupported granularity, profit and source switching", async (t) => {
  const f = await fixture(t);
  for (const question of ["مبيعات أمس", "كم الأرباح؟", "Show sales forecast"]) {
    const r = await f.ask(question);
    assert.equal(r.status, 200, JSON.stringify(r.payload));
    assert.deepEqual(r.payload.answer.sources[0].data.topRows, []);
    assert.match(r.payload.answer.content, /ما يحتوي أدلة كافية/);
  }
  const r = await f.ask("حلل التقرير");
  assert.equal(
    (await f.ask("حلل التقرير", { threadId: r.payload.threadId, version: 1, importJobId: f.id + 1 })).status,
    409
  );
  assert.equal((await f.ask("حلل التقرير", { fromDate: "2026-01-18", toDate: "2026-01-19" })).status, 400);
});
test("aggregate report authorization is rechecked on replay and history", async (t) => {
  const f = await fixture(t),
    key = crypto.randomUUID();
  const r = await f.ask("حلل التقرير", { requestKey: key });
  assert.equal(r.status, 200);
  const other = await account(f.server);
  const denied = await request(f.server, "/copilot/ask", {
    token: other.token,
    method: "POST",
    body: { message: "summary", importJobId: f.id, requestKey: crypto.randomUUID() }
  });
  assert.equal(denied.status, 404);
  db.prepare("UPDATE import_jobs SET status='cancelled' WHERE id=?").run(f.id);
  assert.equal((await f.ask("حلل التقرير", { requestKey: key })).status, 404);
  assert.equal(
    (await request(f.server, `/copilot/threads/${r.payload.threadId}`, { token: f.owner.token })).status,
    404
  );
});
test("aggregate report rejects malformed source numbers instead of silently coercing", async (t) => {
  const f = await fixture(t, ["Soup,12,unknown,2026-01-18,2026-09-08,period_summary,dine_in,Source,4"]);
  assert.equal((await f.ask("حلل التقرير")).status, 400);
});
