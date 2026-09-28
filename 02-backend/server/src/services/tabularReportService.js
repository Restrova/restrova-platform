import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db.js";
import { validate } from "../validation/schemas.js";
import { conflict, forbidden, validationError } from "../errors/appError.js";
import { copilotScopeSchema, resolveCopilotContext } from "./copilotService.js";
import { getMenuMargins } from "./menuMarginService.js";
import { financialCategories } from "./financialService.js";
import { csvCell } from "./executiveReportService.js";

const schema = copilotScopeSchema
  .extend({
    kind: z.enum(["financial", "branches", "menu", "ledger"]).default("financial"),
    expectedRevision: z.coerce.number().int().nonnegative().optional()
  })
  .strict();
const costs = financialCategories.map((c) => c.key).filter((k) => !["sales", "discounts", "refunds"].includes(k));
const revenue = ["sales", "discounts", "refunds"];
const metrics = {
  grossSalesMinor: ["sales"],
  discountsMinor: ["discounts"],
  refundsMinor: ["refunds"],
  revenueMinor: revenue,
  cogsMinor: ["food_costs"],
  grossProfitMinor: [...revenue, "food_costs"],
  contributionProfitMinor: [...revenue, "food_costs", "packaging", "delivery_commissions"],
  operatingExpensesMinor: costs.filter((k) => !["food_costs", "packaging", "delivery_commissions"].includes(k)),
  operatingProfitMinor: [...revenue, ...costs],
  totalCostsMinor: costs
};
const labels = {
  en: [
    "Gross sales",
    "Discounts",
    "Refunds",
    "Net revenue",
    "Food costs",
    "Gross profit",
    "Contribution profit",
    "Operating expenses",
    "Operating profit (before unmodeled adjustments)",
    "Total costs"
  ],
  ar: [
    "إجمالي المبيعات",
    "الخصومات",
    "المبالغ المستردة",
    "صافي الإيراد",
    "تكلفة الطعام",
    "مجمل الربح",
    "ربح المساهمة",
    "المصروفات التشغيلية",
    "الربح التشغيلي قبل التسويات غير المسجلة",
    "إجمالي التكاليف"
  ],
  zh: [
    "销售总额",
    "折扣",
    "退款",
    "净收入",
    "食材成本",
    "毛利润",
    "贡献利润",
    "运营费用",
    "未建模调整前的营业利润",
    "总成本"
  ]
};
const headerCopy = {
  en: {
    metric: "Metric",
    current: "Current",
    previous: "Previous",
    change: "Change",
    status: "Coverage",
    branch: "Branch",
    name: "Name",
    quantity: "Quantity",
    revenue: "Net revenue",
    profit: "Contribution profit",
    margin: "Margin %",
    category: "Category",
    amount: "Amount",
    date: "Recorded date",
    source: "Source reference",
    tax: "Tax amount",
    taxStatus: "Tax treatment"
  },
  ar: {
    metric: "المؤشر",
    current: "الحالي",
    previous: "السابق",
    change: "التغيّر",
    status: "اكتمال البيانات",
    branch: "الفرع",
    name: "الاسم",
    quantity: "الكمية",
    revenue: "صافي الإيراد",
    profit: "ربح المساهمة",
    margin: "الهامش %",
    category: "الفئة",
    amount: "المبلغ",
    date: "تاريخ السجل",
    source: "مرجع المصدر",
    tax: "مبلغ الضريبة",
    taxStatus: "حالة الضريبة"
  },
  zh: {
    metric: "指标",
    current: "本期",
    previous: "上期",
    change: "变化",
    status: "数据完整性",
    branch: "门店",
    name: "名称",
    quantity: "数量",
    revenue: "净收入",
    profit: "贡献利润",
    margin: "利润率 %",
    category: "类别",
    amount: "金额",
    date: "记录日期",
    source: "来源引用",
    tax: "税额",
    taxStatus: "税务处理"
  }
};
function metricValue(result, key) {
  return result && metrics[key].every((k) => result.completeness.presentCategories.includes(k))
    ? result.metrics[key]
    : null;
}
function metricRows(bundle, language, prefix = {}) {
  return Object.keys(metrics).map((key, i) => {
    const current = metricValue(bundle.current, key),
      previous = metricValue(bundle.comparison, key);
    const change = current !== null && previous !== null ? current - previous : null;
    if (change !== null && !Number.isSafeInteger(change))
      throw validationError("Report change exceeds the supported range.");
    return {
      ...prefix,
      metric: labels[language][i],
      key,
      current,
      previous,
      change,
      status: current === null ? "insufficient_data" : "supported",
      previousStatus: previous === null ? "insufficient_data" : "supported"
    };
  });
}
// Older import ledgers omit zero deductions. Recover only explicit zeros from
// matching imported order lines; missing manual entries and costs stay unknown.
function recoverRecordedImportZeros(user, financial) {
  const cache = new Map();
  function hydrate(result) {
    if (!result) return;
    const refs = result.lineage.sales;
    if (!refs.length || refs.some((ref) => ref.sourceType !== "import")) return;
    const key = JSON.stringify([result.period, result.scope.branchId]);
    if (!cache.has(key)) {
      const orders = db
        .prepare(
          `SELECT branch_id,external_order_id,SUM(gross_sales_minor) AS gross,SUM(discount_minor) AS discounts,SUM(refund_amount_minor) AS refunds,SUM(delivery_commission_minor) AS delivery_commissions FROM sales_lines WHERE organization_id=? AND restaurant_id=? AND (? IS NULL OR branch_id=?) AND julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?) GROUP BY branch_id,external_order_id`
        )
        .all(
          user.organization_id,
          user.restaurant_id,
          result.scope.branchId,
          result.scope.branchId,
          result.period.from,
          result.period.to
        );
      cache.set(key, new Map(orders.map((row) => [`${row.branch_id}:${row.external_order_id}`, row])));
    }
    const matched = refs.map((ref) => cache.get(key).get(`${ref.branchId}:${ref.sourceReference}`));
    if (
      matched.some((row) => !row) ||
      matched.reduce((sum, row) => sum + BigInt(row.gross), 0n) !== BigInt(result.metrics.grossSalesMinor)
    )
      return;
    const zeroCategories = ["discounts", "refunds", "delivery_commissions"].filter(
      (category) =>
        !result.completeness.presentCategories.includes(category) && matched.every((row) => row[category] === 0)
    );
    result.completeness.presentCategories.push(...zeroCategories);
    result.completeness.missingCategories = result.completeness.missingCategories.filter(
      (category) => !zeroCategories.includes(category)
    );
    if (zeroCategories.length)
      result.coverageEvidence = { sourceType: "sales_lines", zeroCategories, orderCount: matched.length };
  }
  const bundles = new Set([financial.financials]);
  for (const restaurant of financial.restaurants) {
    if (restaurant.financials) bundles.add(restaurant.financials);
    if (restaurant.unallocated) bundles.add(restaurant.unallocated);
    for (const branch of restaurant.branches) bundles.add(branch.financials);
  }
  for (const bundle of bundles) {
    hydrate(bundle.current);
    hydrate(bundle.comparison);
  }
}
export function getTabularReport(user, query) {
  const { kind, expectedRevision, ...scope } = validate(schema, query);
  if (Boolean(scope.fromDate) !== Boolean(scope.toDate)) throw validationError("Supply both report dates.");
  if (kind === "ledger" && user.role === "viewer")
    throw forbidden("Ledger reports require owner or branch manager access.");
  const context = resolveCopilotContext(user, scope);
  if (expectedRevision !== undefined && expectedRevision !== context.dataRevision.revision)
    throw conflict("Imported data changed. Refresh the report before exporting.");
  recoverRecordedImportZeros(user, context.financial);
  const h = headerCopy[context.language];
  const col = (key, type = "text") => ({ key, label: h[key] || key, type });
  let columns, rows, sources;
  if (kind === "financial" || kind === "branches") {
    columns = [
      ...(kind === "branches" ? [col("branch"), col("name")] : []),
      col("metric"),
      col("current", "money_minor"),
      col("previous", "money_minor"),
      col("change", "money_minor"),
      col("status")
    ];
    rows =
      kind === "financial"
        ? metricRows(context.financial.financials, context.language)
        : context.financial.restaurants.flatMap((r) =>
            r.branches.flatMap((b) => metricRows(b.financials, context.language, { branch: b.id, name: b.name }))
          );
    if (rows.length > 5000) throw validationError("Report exceeds 5000 rows. Select one branch.");
    sources = { financial: context.financial };
  } else if (kind === "menu") {
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM catalog_items WHERE organization_id=? AND restaurant_id=?")
      .get(user.organization_id, user.restaurant_id).n;
    if (count > 5000) throw validationError("Menu report exceeds 5000 items.");
    const menu = getMenuMargins(
      user,
      {
        ...(context.branchId ? { branchId: context.branchId } : {}),
        from: context.from,
        to: context.to,
        status: "all"
      },
      { allItems: true }
    );
    columns = [
      col("name"),
      col("quantity", "number"),
      col("revenue", "money_minor"),
      col("profit", "money_minor"),
      col("margin", "bps"),
      col("status")
    ];
    rows = menu.items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      quantity: item.metrics.quantitySold,
      revenue: item.completeness.hasSalesData ? item.metrics.itemRevenueMinor : null,
      profit: item.metrics.contributionProfitMinor,
      margin: item.metrics.contributionMarginBps,
      status: item.completeness.ready ? "supported" : "insufficient_data"
    }));
    sources = { menu };
  } else {
    const entries = db
      .prepare(
        `SELECT id,restaurant_id,branch_id,category,amount_minor,occurred_at,source_type,source_reference FROM financial_ledger_entries WHERE organization_id=? AND restaurant_id=? AND (? IS NULL OR branch_id=?) AND julianday(occurred_at)>=julianday(?) AND julianday(occurred_at)<=julianday(?) ORDER BY occurred_at,id LIMIT 5001`
      )
      .all(user.organization_id, user.restaurant_id, context.branchId, context.branchId, context.from, context.to);
    if (entries.length > 5000)
      throw validationError("Ledger report exceeds 5000 rows. Choose a shorter period or one branch.");
    columns = [
      col("date"),
      col("branch"),
      col("category"),
      col("amount", "money_minor"),
      col("source"),
      col("tax", "money_minor"),
      col("taxStatus")
    ];
    rows = entries.map((e) => ({
      id: e.id,
      date: e.occurred_at,
      branch: e.branch_id,
      category: e.category,
      amount: e.amount_minor,
      source: e.source_reference,
      sourceType: e.source_type,
      tax: null,
      taxStatus: "not_modeled"
    }));
    sources = { ledgerEntryIds: entries.map((e) => e.id) };
  }
  const report = {
    version: "tabular-report-v1",
    kind,
    language: context.language,
    scope: {
      organizationId: user.organization_id,
      restaurantId: user.restaurant_id,
      branchId: context.branchId,
      kind: context.scope
    },
    period: {
      fromDate: context.fromDate,
      toDate: context.toDate,
      from: context.from,
      to: context.to,
      comparison: context.financial.period.comparison
    },
    timezone: context.timezone,
    currencyCode: context.currencyCode.toUpperCase(),
    amountStorage: "integer_minor_units",
    dataRevision: context.dataRevision,
    taxTreatment: "not_modeled",
    columns,
    rows,
    sources
  };
  return {
    ...report,
    digest: crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex"),
    generatedAt: new Date().toISOString()
  };
}
export function reportExportRows(report) {
  const metadata = [
    "report_version",
    "report_kind",
    "organization_id",
    "restaurant_id",
    "scope",
    "branch_id",
    "from_date",
    "to_date",
    "timezone",
    "currency",
    "amount_storage",
    "comparison_from",
    "comparison_to",
    "import_revision",
    "report_sha256",
    "tax_treatment"
  ];
  const values = [
    report.version,
    report.kind,
    report.scope.organizationId,
    report.scope.restaurantId,
    report.scope.kind,
    report.scope.branchId,
    report.period.fromDate,
    report.period.toDate,
    report.timezone,
    report.currencyCode,
    report.amountStorage,
    report.period.comparison?.from || null,
    report.period.comparison?.to || null,
    report.dataRevision.revision,
    report.digest,
    report.taxTreatment
  ];
  // Stable machine keys and raw storage units support downstream reconciliation.
  const keys = [...new Set(report.rows.flatMap((row) => Object.keys(row)))];
  if (!keys.length) keys.push(...report.columns.map((c) => c.key));
  return [[...metadata, ...keys], ...report.rows.map((row) => [...values, ...keys.map((key) => row[key] ?? null)])];
}
export function tabularCsv(report) {
  return (
    "\uFEFF" +
    reportExportRows(report)
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function recordReportExport(user, report, format) {
  db.prepare(
    "INSERT INTO report_export_events(organization_id,restaurant_id,owner_id,branch_id,report_kind,format,row_count,report_digest,revision) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(
    user.organization_id,
    user.restaurant_id,
    user.owner_id,
    report.scope.branchId,
    report.kind,
    format,
    report.rows.length,
    report.digest,
    report.dataRevision.revision
  );
}
