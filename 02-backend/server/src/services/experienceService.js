import { createHash } from "node:crypto";
import { conflict, forbidden, validationError } from "../errors/appError.js";
import { recordDataRevision } from "./dataRevisionService.js";
import { z } from "zod";
import { db } from "../db.js";
import { validate } from "../validation/schemas.js";
import { getFinancialReport } from "./financialReportService.js";
import { localDate } from "./historicalSeriesService.js";
import { listAlerts } from "./alertCenterService.js";
import { getDataRevision } from "./dataRevisionService.js";
export function getExperience(user, query = {}) {
  const parsed = validate(z.object({ branchId: z.coerce.number().int().positive().optional() }).strict(), query);
  const branchId = user.role === "branch_manager" ? user.branch_id : parsed.branchId;
  const scope = {
    scope: branchId ? "branch" : "restaurant",
    restaurantId: user.restaurant_id,
    ...(parsed.branchId ? { branchId: parsed.branchId } : branchId ? { branchId } : {})
  };
  const report = getFinancialReport(user, { ...scope, period: "today", throughNow: "true", comparison: "none" });
  const current = report.financials.current;
  const params = [user.organization_id, user.restaurant_id, branchId || null, branchId || null];
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS lines,COUNT(DISTINCT branch_id || ':' || external_order_id) AS orders,SUM(gross_sales_minor-discount_minor-refund_amount_minor) AS revenue,MAX(created_at) AS updated FROM sales_lines WHERE organization_id=? AND restaurant_id=? AND (? IS NULL OR branch_id=?)`
    )
    .get(...params);
  const today = db
    .prepare(
      `SELECT COUNT(*) AS lines,COUNT(DISTINCT branch_id || ':' || external_order_id) AS orders,SUM(gross_sales_minor-discount_minor-refund_amount_minor) AS revenue FROM sales_lines WHERE organization_id=? AND restaurant_id=? AND (? IS NULL OR branch_id=?) AND julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?)`
    )
    .get(...params, report.period.current.from, report.period.current.to);
  const costs = db
    .prepare(
      `SELECT COUNT(*) AS records,MAX(created_at) AS updated FROM item_costs WHERE organization_id=? AND restaurant_id=? AND (branch_id IS NULL OR ? IS NULL OR branch_id=?)`
    )
    .get(...params);
  const ledger = db
    .prepare(
      `SELECT COUNT(*) AS records,MAX(occurred_at) AS updated FROM financial_ledger_entries WHERE organization_id=? AND restaurant_id=? AND (? IS NULL OR branch_id=?)`
    )
    .get(...params);
  const alerts = listAlerts(user, { ...scope, order: "priority", limit: 1 });
  const knownRevenue = ["sales", "discounts", "refunds"].every((k) =>
    current.completeness.presentCategories.includes(k)
  );
  const hasManualSales = current.lineage.sales.some((r) => r.sourceType !== "import");
  const revenue = knownRevenue ? current.metrics.revenueMinor : !hasManualSales && today.lines ? today.revenue : null;
  const date = localDate(new Date().toISOString(), user.timezone);
  const manual = branchId
    ? db
        .prepare(
          "SELECT id,date,sales_minor,orders,costs_minor,waste_minor,created_at FROM manual_daily_summaries WHERE organization_id=? AND restaurant_id=? AND branch_id=? AND date=?"
        )
        .get(user.organization_id, user.restaurant_id, branchId, date)
    : null;
  const manualCount = db
    .prepare(
      "SELECT COUNT(*) AS n FROM manual_daily_summaries WHERE organization_id=? AND restaurant_id=? AND (? IS NULL OR branch_id=?)"
    )
    .get(...params).n;
  const useManual = Boolean(manual && !today.lines && !current.completeness.hasData);
  return {
    manual: manual || null,
    date: localDate(new Date().toISOString(), user.timezone),
    timezone: user.timezone,
    currencyCode: user.currency,
    scope: { restaurantId: user.restaurant_id, branchId: branchId || null },
    period: report.period.current,
    dataRevision: getDataRevision(user),
    hasData: Boolean(sales.lines || ledger.records || manualCount),
    today: {
      source: useManual ? "manual" : today.lines ? "import" : "ledger",
      revenueMinor: useManual ? manual.sales_minor : revenue,
      profitMinor: useManual
        ? manual.sales_minor - manual.costs_minor
        : current.completeness.hasData && !current.completeness.missingCategories.length
          ? current.metrics.operatingProfitMinor
          : null,
      orders: useManual ? manual.orders : today.lines && !hasManualSales ? today.orders : null
    },
    status: {
      sales: { count: sales.lines, updatedAt: sales.updated },
      orders: { count: sales.orders, updatedAt: sales.updated },
      costs: { count: costs.records, updatedAt: costs.updated },
      ledger: { count: ledger.records, updatedAt: ledger.updated }
    },
    alert: alerts.items[0] || null,
    moreAlerts: Boolean(alerts.nextBefore),
    coverage: current.completeness
  };
}

export function saveDailySummary(user, body) {
  if (!["owner", "branch_manager"].includes(user.role)) throw forbidden("Read-only account");
  const input = validate(
    z
      .object({
        branchId: z.number().int().positive(),
        date: z.iso.date(),
        sales: z.string().max(30),
        orders: z.number().int().min(0).max(10000000),
        costs: z.string().max(30),
        waste: z.string().max(30)
      })
      .strict(),
    body
  );
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: user.currency }).resolvedOptions()
    .maximumFractionDigits;
  const money = (value) => {
    if (!/^\d+(?:\.\d+)?$/.test(value) || (value.split(".")[1] || "").length > digits)
      throw validationError("Invalid currency precision");
    const [whole, fraction = ""] = value.split(".");
    const n = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
    if (n > 1000000000000n) throw validationError("Amount exceeds limit");
    return Number(n);
  };
  const sales = money(input.sales),
    costs = money(input.costs),
    waste = money(input.waste);
  if (waste > costs) throw validationError("Waste must be included in total costs");
  return db.transaction(() => {
    const overview = getExperience(user, { branchId: input.branchId });
    if (input.date !== overview.date) throw validationError("Manual entry is limited to the current restaurant date");
    if (overview.manual || overview.today.source === "import" || overview.coverage.hasData)
      throw conflict("Today's data already exists; do not duplicate it");
    db.prepare(
      "INSERT INTO manual_daily_summaries(organization_id,restaurant_id,branch_id,date,currency_code,sales_minor,orders,costs_minor,waste_minor,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(
      user.organization_id,
      user.restaurant_id,
      input.branchId,
      input.date,
      user.currency,
      sales,
      input.orders,
      costs,
      waste,
      user.owner_id
    );
    return { saved: true, dataRevision: recordDataRevision(user) };
  })();
}
export function todayCopilotAnswer(user, query) {
  if (query.scope === "restaurant" && query.branchId) throw validationError("Restaurant scope cannot include a branch");
  if (query.scope === "branch" && !query.branchId && !user.branch_id) throw validationError("Select a branch");
  const data = getExperience(user, query.scope === "branch" ? { branchId: query.branchId || user.branch_id } : {}),
    language = query.language;
  const c =
    language === "ar"
      ? {
          intro: "هذي أرقام اليوم حتى الآن حسب السجلات المتاحة. الأرقام جزئية، وما نقدر نثبت الربح إذا التكاليف ناقصة.",
          sales: "المبيعات",
          profit: "الربح التشغيلي",
          orders: "الطلبات",
          missing: "بيانات غير كافية",
          manual: "المصدر ملخصك اليدوي، والتكلفة تشمل الهدر."
        }
      : language === "zh"
        ? {
            intro: "这是餐厅时区内今日截至目前的记录，数据尚未完整。成本缺失时无法确认利润。",
            sales: "销售额",
            profit: "营业利润",
            orders: "订单",
            missing: "数据不足",
            manual: "来源为手动日汇总，总成本含损耗。"
          }
        : {
            intro:
              "Today's recorded results so far, in the restaurant timezone. Figures are partial; missing costs prevent confirming profit.",
            sales: "Sales",
            profit: "Operating profit",
            orders: "Orders",
            missing: "Insufficient data",
            manual: "Source: your manual daily summary; total costs include waste."
          };
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: data.currencyCode }).resolvedOptions()
    .maximumFractionDigits;
  const money = (n) =>
    n == null
      ? c.missing
      : new Intl.NumberFormat(language, { style: "currency", currency: data.currencyCode }).format(n / 10 ** digits);
  return {
    version: "today-v1",
    intent: "summary",
    language,
    scope: {
      kind: data.scope.branchId ? "branch" : "restaurant",
      restaurantId: user.restaurant_id,
      branchId: data.scope.branchId
    },
    period: { fromDate: data.date, toDate: data.date },
    dataRevision: data.dataRevision,
    currencyCode: data.currencyCode,
    claims: [],
    sources: [
      {
        id: "today",
        digest: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
        url: "/app/today",
        period: { fromDate: data.date, toDate: data.date },
        data
      }
    ],
    content: [
      c.intro,
      `${c.sales}: ${money(data.today.revenueMinor)}`,
      `${c.profit}: ${money(data.today.profitMinor)}`,
      `${c.orders}: ${data.today.orders ?? c.missing}`,
      ...(data.today.source === "manual" ? [c.manual] : [])
    ].join("\n"),
    aiMode: "builtin_evidence",
    model: "deterministic-today-v1",
    toolsUsed: ["today"],
    generatedAt: new Date().toISOString()
  };
}
