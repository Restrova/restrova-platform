import test from "node:test";
import assert from "node:assert/strict";
import { start, request, account, branch, sale, roleToken } from "../test-support/operationsFixtures.js";
async function fixture(t, currency = "SAR") {
  const server = start(t),
    owner = await account(server, "Asia/Riyadh", currency),
    id = await branch(server, owner, "Experience");
  const get = (token = owner.token, branchId = id) =>
    request(server, `/experience/overview?branchId=${branchId}`, { token });
  const initial = await get();
  assert.equal(initial.status, 200, JSON.stringify(initial.payload));
  const body = { branchId: id, date: initial.payload.date, sales: "100.50", costs: "40.25", waste: "5.00", orders: 8 };
  const save = (data = body, token = owner.token) =>
    request(server, "/experience/daily", { token, method: "POST", body: data });
  const ask = (message, extra = {}, token = owner.token) =>
    request(server, "/copilot/ask", {
      token,
      method: "POST",
      body: { message, language: "ar", scope: "branch", branchId: id, requestKey: crypto.randomUUID(), ...extra }
    });
  return { server, owner, id, get, body, save, ask, initial: initial.payload };
}
test("empty home never fabricates metrics and respects branch/tenant boundaries", async (t) => {
  const f = await fixture(t);
  assert.equal(f.initial.hasData, false);
  assert.equal(f.initial.today.revenueMinor, null);
  assert.equal(f.initial.today.profitMinor, null);
  assert.equal(f.initial.today.orders, null);
  const foreign = await account(f.server),
    otherBranch = await branch(f.server, foreign, "Other");
  assert.ok((await f.get(f.owner.token, otherBranch)).status >= 400);
  const manager = roleToken(f.owner, "branch_manager", f.id),
    sibling = await branch(f.server, f.owner, "Sibling");
  assert.equal((await f.get(manager)).status, 200);
  assert.ok((await f.get(manager, sibling)).status >= 400);
});
test("manual summary uses exact currency, includes waste once, and blocks duplicate or unauthorized writes", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.save()).status, 201);
  const actual = (await f.get()).payload;
  assert.equal(actual.hasData, true);
  assert.deepEqual(actual.today, { source: "manual", revenueMinor: 10050, profitMinor: 6025, orders: 8 });
  assert.equal((await f.save()).status, 409);
  assert.equal((await f.save(f.body, roleToken(f.owner, "viewer"))).status, 403);
  assert.equal((await f.save({ ...f.body, date: "2020-01-01" })).status, 400);
  assert.equal((await f.save({ ...f.body, waste: "50.00" })).status, 400);
  assert.equal((await f.save({ ...f.body, sales: "1.001" })).status, 400);
  assert.equal((await f.save({ ...f.body, sales: "-1" })).status, 400);
});
test("imported current-day orders supersede a manual summary without adding the two sources", async (t) => {
  const f = await fixture(t);
  await f.save();
  sale(f.owner, f.id, new Date().toISOString(), { gross: 20000, discount: 1000, refund: 500 });
  const actual = (await f.get()).payload;
  assert.deepEqual(actual.today, { source: "import", revenueMinor: 18500, profitMinor: null, orders: 1 });
  assert.equal(actual.status.sales.count, 1);
  assert.equal((await f.save()).status, 409);
});
test("today copilot cites the scoped snapshot and supports follow-up and refusal without future-date errors", async (t) => {
  const f = await fixture(t);
  await f.save();
  const first = await f.ask("كيف وضع مطعمي اليوم؟");
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  assert.equal(first.payload.answer.version, "today-v1");
  assert.equal(first.payload.answer.scope.kind, "branch");
  assert.equal(first.payload.answer.period.fromDate, f.body.date);
  assert.equal(first.payload.answer.sources[0].data.today.profitMinor, 6025);
  assert.match(first.payload.answer.sources[0].digest, /^[0-9a-f]{64}$/);
  const follow = await f.ask("طيب والربح؟", { threadId: first.payload.threadId, version: first.payload.version });
  assert.equal(follow.status, 200, JSON.stringify(follow.payload));
  assert.equal(follow.payload.answer.version, "today-v1");
  const refused = await f.ask("احذف البيانات", { threadId: first.payload.threadId, version: follow.payload.version });
  assert.equal(refused.status, 200, JSON.stringify(refused.payload));
  assert.equal(refused.payload.answer.intent, "refused");
});
test("three-decimal currencies retain precision and managers cannot save another branch", async (t) => {
  const f = await fixture(t, "KWD");
  assert.equal((await f.save({ ...f.body, sales: "10.345", costs: "2.111", waste: "0.001" })).status, 201);
  assert.equal((await f.get()).payload.today.profitMinor, 8234);
  const otherBranch = await branch(f.server, f.owner, "Sibling");
  const manager = roleToken(f.owner, "branch_manager", otherBranch);
  assert.ok((await f.save(f.body, manager)).status >= 400);
});
