import test from "node:test";
import assert from "node:assert/strict";
import { analyticsRequest, formatImportedAnswer } from "../src/analyticsAnswer.js";
import { resolveFinancialDateRange, resolveFinancialPeriodRanges } from "../src/services/financialPeriodService.js";

test("assistant periods use local calendar boundaries, including UTC midnight and DST", () => {
  const month = resolveFinancialPeriodRanges(
    { period: "month", comparison: "none", anchor: "2026-08-31T17:00:00Z" },
    "Asia/Shanghai"
  );
  assert.equal(month.current.from, "2026-08-31T16:00:00.000Z");
  assert.equal(month.current.to, "2026-09-30T15:59:59.999Z");
  const day = resolveFinancialDateRange("2026-09-01", "Asia/Shanghai");
  assert.equal(day.current.from, "2026-08-31T16:00:00.000Z");
  assert.equal(day.current.to, "2026-09-01T15:59:59.999Z");
  const dst = resolveFinancialDateRange("2026-03-08", "America/New_York");
  assert.equal(Date.parse(dst.current.to) - Date.parse(dst.current.from) + 1, 23 * 3600000);
  assert.throws(() => resolveFinancialDateRange("2026-02-30", "Asia/Shanghai"), /Invalid calendar date/);
});

test("Arabic analytics distinguish today, month, yesterday, explicit dates and unsupported comparisons", () => {
  assert.deepEqual(analyticsRequest("كم مبيعات اليوم"), { name: "get_daily_sales", args: { range: "today" } });
  assert.deepEqual(analyticsRequest("مبيعات الشهر"), { name: "get_profit_summary", args: { range: "month" } });
  assert.deepEqual(analyticsRequest("مبيعات أمس"), { name: "get_daily_sales", args: { range: "yesterday" } });
  assert.deepEqual(analyticsRequest("مبيعات 2026-08-20"), { name: "get_daily_sales", args: { date: "2026-08-20" } });
  assert.equal(analyticsRequest("أفضل الأطباق هذا الشهر").name, "get_top_dishes");
  assert.deepEqual(analyticsRequest("مبيعات من 2026-08-01 إلى 2026-08-20"), {
    name: "get_profit_summary",
    args: { fromDate: "2026-08-01", toDate: "2026-08-20" }
  });
  assert.equal(analyticsRequest("قارن مبيعات الشهر الماضي").unsupported, true);
  assert.equal(analyticsRequest("ما الأولوية اليوم؟"), null);
});

test("missing period records are distinct from recorded zero sales and missing costs", () => {
  const data = {
    source: "imports",
    currency: "USD",
    timezone: "Asia/Shanghai",
    branch_name: "Test Branch",
    period: { from: "2026-08-31T16:00:00Z", to: "2026-09-01T15:59:59.999Z" },
    has_sales: false,
    coverage: { first: "2026-08-01T01:00:00Z", last: "2026-08-02T01:00:00Z" }
  };
  const missing = formatImportedAnswer("get_daily_sales", data, true);
  assert.match(missing, /لا توجد بيانات مبيعات/);
  assert.match(missing, /2026-08-01 — 2026-08-02/);
  assert.doesNotMatch(missing, /0\.00/);
  const zero = formatImportedAnswer(
    "get_daily_sales",
    {
      ...data,
      has_sales: true,
      net_revenue: 0,
      orders: 1,
      cost: 0,
      profit: null,
      margin_percent: null,
      cost_complete: false
    },
    false
  );
  assert.match(zero, /Net sales: \$0\.00/);
  assert.match(zero, /Estimated profit: Unavailable/);
  assert.doesNotMatch(zero, /CN|¥|No sales records/);
});
