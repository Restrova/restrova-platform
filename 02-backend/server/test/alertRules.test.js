import test from "node:test";
import assert from "node:assert/strict";
import {
  start,
  request,
  account,
  branch,
  sale,
  ledger,
  roleToken,
  periodQuery,
  db
} from "../test-support/operationsFixtures.js";

async function fixture(t, previous = {}, current = {}) {
  const server = start(t);
  const owner = await account(server);
  const id = await branch(server, owner, "فرع التنبيهات / 预警分店");
  for (let day = 10; day <= 23; day++) {
    const values = { gross: 10000, discount: 0, refund: 0, food: 1000, ...(day < 17 ? previous : current) };
    const date = `2026-08-${day}T12:00:00+03:00`;
    sale(owner, id, date, values);
    ledger(owner, id, date, {
      sales: values.gross,
      discounts: values.discount,
      refunds: values.refund,
      food_costs: values.food
    });
  }
  const query = `/alerts/evaluate?${periodQuery}&scope=branch&branchId=${id}`;
  const evaluate = (extra = "") => request(server, query + extra, { token: owner.token });
  return { server, owner, id, evaluate };
}

const find = (payload, type) => payload.evaluations.find((item) => item.type === type);

test("five alert rules expose reproducible, localized figures, thresholds and lineage", async (t) => {
  const { evaluate, id } = await fixture(t, {}, { gross: 9000, discount: 1000, refund: 500, food: 4000 });
  const response = await evaluate();
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  const data = response.payload;
  assert.deepEqual(data, (await evaluate()).payload);
  assert.equal(data.alerts.length, 5);
  assert.equal(data.summary.triggered, 5);
  assert.equal(data.summary.insufficient_data, 0);
  for (const alert of data.alerts) {
    assert.equal(alert.branchId, id);
    assert.equal(alert.expectedImpactMinor, null);
    assert.equal(alert.evidence.current.lineage.length, 7);
    assert.equal(alert.evidence.comparison.lineage.length, 7);
    assert.equal(alert.evidence.current.revenueMinor, 52500);
    assert.equal(alert.evidence.comparison.revenueMinor, 70000);
    assert.match(alert.suggestedAction, /راجع/);
  }
  assert.equal(find(data, "sales_drop").measuredBps, 2500);
  assert.equal(find(data, "food_cost_above_target").measuredBps, 5333);
  assert.equal(find(data, "profit_margin_drop").measuredBps, 4333);
  assert.ok(find(data, "profit_margin_drop").evidence.ledger.lineage.current);
  const english = (await evaluate("&language=en")).payload;
  const chinese = (await evaluate("&language=zh")).payload;
  assert.equal(find(english, "sales_drop").title, "Sales declined");
  assert.equal(find(chinese, "sales_drop").title, "销售额下降");
  assert.deepEqual(
    english.alerts.map((a) => a.measuredBps),
    data.alerts.map((a) => a.measuredBps)
  );
  assert.deepEqual(
    chinese.alerts.map((a) => a.id),
    data.alerts.map((a) => a.id)
  );
});

test("threshold equality is not an alert and sub-basis-point excess is evaluated before rounding", async (t) => {
  const { evaluate, id } = await fixture(t, {}, { gross: 10000, discount: 300, refund: 200, food: 3325 });
  const data = (await evaluate()).payload;
  assert.equal(find(data, "food_cost_above_target").measuredBps, 3500);
  for (const type of ["food_cost_above_target", "refund_rate_increase", "discount_rate_increase"])
    assert.equal(find(data, type).status, "not_triggered");
  // Add one minor unit: 35.0015% displays as 35.00% but strictly exceeds 35%.
  db.prepare(
    "UPDATE financial_ledger_entries SET amount_minor=amount_minor+1 WHERE id=(SELECT MIN(id) FROM financial_ledger_entries WHERE branch_id=? AND category='food_costs' AND occurred_at LIKE '2026-08-17%')"
  ).run(id);
  const increased = (await evaluate()).payload;
  assert.equal(find(increased, "food_cost_above_target").measuredBps, 3500);
  assert.equal(find(increased, "food_cost_above_target").status, "triggered");
  assert.equal(
    find((await evaluate("&foodCostTargetBps=3600")).payload, "food_cost_above_target").status,
    "not_triggered"
  );
  assert.equal(find((await evaluate()).payload, "food_cost_above_target").thresholdBps, 3500);
});

test("missing dates, partial periods, unknown lifecycle and incomplete or mismatched ledgers do not fabricate alerts", async (t) => {
  const { evaluate, server, owner, id } = await fixture(t, {}, { gross: 8000, food: 4000 });
  db.prepare("DELETE FROM financial_ledger_entries WHERE branch_id=? AND category='rent'").run(id);
  let data = (await evaluate()).payload;
  assert.equal(find(data, "profit_margin_drop").reason, "missing_ledger_categories");
  assert.equal(find(data, "food_cost_above_target").status, "triggered");
  db.prepare(
    "UPDATE financial_ledger_entries SET amount_minor=amount_minor+100 WHERE branch_id=? AND category='sales'"
  ).run(id);
  data = (await evaluate()).payload;
  assert.equal(find(data, "food_cost_above_target").reason, "ledger_sales_mismatch");
  assert.equal(find(data, "sales_drop").status, "triggered");
  const partial = await request(
    server,
    `/alerts/evaluate?period=custom&fromDate=2026-08-17&toDate=2026-08-23&anchor=2026-08-22T12:00:00Z&branchId=${id}&scope=branch`,
    { token: owner.token }
  );
  assert.equal(find(partial.payload, "food_cost_above_target").reason, "ledger_period_not_fully_aligned");
  db.prepare("DELETE FROM sales_lines WHERE branch_id=? AND created_at LIKE '2026-08-18%'").run(id);
  data = (await evaluate()).payload;
  assert.equal(data.alerts.length, 0);
  assert.equal(data.summary.insufficient_data, 5);
  assert.ok(data.evaluations.every((item) => item.evidence.excludedReasons.includes("missing_current_sales_days")));
  const unknown = await request(
    server,
    `/alerts/evaluate?${periodQuery}&scope=branch&branchId=${owner.branches[0].id}`,
    {
      token: owner.token
    }
  );
  assert.ok(
    unknown.payload.evaluations.every((item) => item.evidence.excludedReasons.includes("opening_date_unknown"))
  );
});

test("zero denominators are insufficient evidence, and unsafe totals fail explicitly", async (t) => {
  const { evaluate, owner, id } = await fixture(t, { gross: 0, food: 0 }, { gross: 0, food: 0 });
  const data = (await evaluate()).payload;
  assert.equal(data.alerts.length, 0);
  assert.ok(data.evaluations.every((item) => item.reason === "non_positive_denominator"));
  sale(owner, id, "2026-08-18T14:00:00+03:00", { gross: Number.MAX_SAFE_INTEGER });
  sale(owner, id, "2026-08-18T15:00:00+03:00", { gross: 1 });
  assert.equal((await evaluate()).status, 400);
});

test("alert evaluation enforces authentication, tenant and role scopes and validates every threshold", async (t) => {
  const { evaluate, owner, server, id } = await fixture(t);
  assert.equal((await request(server, "/alerts/evaluate")).status, 401);
  const other = await account(server);
  assert.equal(
    (await request(server, `/alerts/evaluate?${periodQuery}&scope=branch&branchId=${id}`, { token: other.token }))
      .status,
    404
  );
  const manager = roleToken(owner, "branch_manager", id);
  let response = await request(server, `/alerts/evaluate?${periodQuery}`, { token: manager });
  assert.equal(response.status, 200);
  assert.ok(response.payload.evaluations.every((item) => item.branchId === id));
  for (const query of ["scope=organization", "scope=restaurant", `scope=branch&branchId=${owner.branches[0].id}`]) {
    response = await request(server, `/alerts/evaluate?${periodQuery}&${query}`, { token: manager });
    assert.equal(response.status, query.startsWith("scope=branch") ? 404 : 403);
  }
  const viewer = roleToken(owner, "viewer");
  assert.equal((await request(server, `/alerts/evaluate?${periodQuery}`, { token: viewer })).status, 200);
  assert.equal((await request(server, "/alerts/evaluate?scope=organization", { token: viewer })).status, 403);
  for (const extra of [
    "foodCostTargetBps=",
    "foodCostTargetBps=100001",
    "salesDropBps=-1",
    "salesDropBps=10001",
    "profitMarginDropBps=1.5",
    "refundRateIncreaseBps=abc",
    "discountRateIncreaseBps=Infinity",
    "language=fr",
    "unexpected=1",
    "salesDropBps=1&salesDropBps=2"
  ]) {
    assert.equal((await evaluate(`&${extra}`)).status, 400, extra);
  }
  const disabled = await request(
    server,
    `/alerts/evaluate?period=yesterday&comparison=none&branchId=${id}&scope=branch`,
    { token: owner.token }
  );
  assert.equal(disabled.payload.alerts.length, 0);
  assert.equal(disabled.payload.summary.insufficient_data, 5);
});

test("sales and margin equality stay quiet, losses trigger and improving performance stays quiet", async (t) => {
  const { evaluate, id } = await fixture(t, {}, { gross: 8000, food: 2400 });
  let data = (await evaluate("&salesDropBps=2000&profitMarginDropBps=2000")).payload;
  assert.equal(find(data, "sales_drop").status, "not_triggered");
  assert.equal(find(data, "profit_margin_drop").status, "not_triggered");
  db.prepare(
    "UPDATE financial_ledger_entries SET amount_minor=10000 WHERE branch_id=? AND category='food_costs' AND occurred_at>='2026-08-17'"
  ).run(id);
  data = (await evaluate()).payload;
  assert.equal(find(data, "profit_margin_drop").status, "triggered");
  assert.equal(find(data, "profit_margin_drop").measuredBps, 11500);
  const improved = await fixture(
    t,
    { gross: 10000, food: 4000, refund: 500, discount: 1000 },
    { gross: 12000, food: 1000 }
  );
  const healthy = (await improved.evaluate()).payload;
  assert.equal(healthy.alerts.length, 0);
  assert.equal(healthy.summary.not_triggered, 5);
});
