import crypto from "node:crypto";
import { z } from "zod";
import { notFound, validationError } from "../errors/appError.js";
import { findImportJobInScope, listImportJobRows } from "../repositories/stagedImportRepository.js";
import { getDataRevision } from "./dataRevisionService.js";

const copy = {
  ar: {
    intro: "هذا تحليل للملف المرفوع فقط، مو لسجل المبيعات التشغيلي.",
    rows: "صفوف التقرير",
    excluded: "صفوف إجمالي مستبعدة من ترتيب الأصناف",
    top: "أعلى صفوف الأصناف حسب المبيعات المعلنة",
    limit:
      "الفترة تخص التقرير كاملًا. ما نقدر نستنتج مبيعات يومية أو أرباح أو توقعات أو مقارنة فروع من هالبيانات. العملة غير مؤكدة، والمبالغ معروضة بوحدة المصدر. صفوف الإجمالي ما جمعناها مع التفاصيل، وما حسبنا إجماليًا جديدًا.",
    review: "راجع الأصناف الأعلى مبيعًا وتوفرها بالمخزون. تقييم الربحية والتسعير يحتاج بيانات التكلفة والخصومات أولًا.",
    unsupported: "الملف ما يحتوي أدلة كافية للإجابة عن هذا السؤال. أقدر أوضح ترتيب صفوف الأصناف والمبيعات المعلنة فقط."
  },
  en: {
    intro: "This analysis uses only the uploaded report, not the operational sales ledger.",
    rows: "Report rows",
    excluded: "Subtotal rows excluded from item ranking",
    top: "Highest item rows by reported sales",
    limit:
      "The period covers the whole report. Daily sales, profit, forecasts and branch comparisons cannot be inferred. Currency is unverified; amounts use source units. Subtotals are not added to details and no new grand total is calculated.",
    review:
      "Review availability of the highest-selling items. Profitability and pricing decisions require costs and discounts first.",
    unsupported:
      "This report has insufficient evidence for that question. Only item-row rankings and reported sales can be described."
  },
  zh: {
    intro: "本分析仅使用上传的汇总报告，不代表运营销售账簿。",
    rows: "报告行数",
    excluded: "菜品排名排除的小计行",
    top: "按报告销售额排序的菜品行",
    limit:
      "日期范围覆盖整份报告。无法据此推断每日销售、利润、预测或门店比较。币种未核实，金额沿用来源单位。小计不与明细重复累加，也不计算新的总额。",
    review: "检查畅销菜品的库存供应。利润和定价决策还需要成本与折扣数据。",
    unsupported: "该报告不足以回答此问题，仅支持菜品行排名与报告销售额说明。"
  }
};

export function authorizedImportReport(user, id) {
  const job = findImportJobInScope(user, id);
  if (
    user.role !== "owner" ||
    !job ||
    job.created_by !== user.owner_id ||
    job.status !== "preview_ready" ||
    job.template_key !== "sales"
  )
    throw notFound("Uploaded report not found");
  return job;
}

// Deliberately narrow aggregate-report contract. Never infer transactions or currency.
export function buildImportReportAnalysis(user, id, language, intent, question = "") {
  const job = authorizedImportReport(user, id);
  const rows = listImportJobRows(id).map((row) => ({ ...JSON.parse(row.raw_json), rowNumber: row.row_number }));
  if (!rows.length) throw validationError("The report has no stored rows.");
  const fromDate = rows[0].period_start,
    toDate = rows[0].period_end;
  if (!z.iso.date().safeParse(fromDate).success || !z.iso.date().safeParse(toDate).success || fromDate > toDate)
    throw validationError("The aggregate report needs a valid period_start and period_end.");
  const number = (value) => {
    if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
    const n = Number(value);
    return Number.isFinite(n) && n <= Number.MAX_SAFE_INTEGER / 100 ? n : null;
  };
  if (
    rows.some(
      (row) =>
        row.period_start !== fromDate ||
        row.period_end !== toDate ||
        !String(row.item_name || "").trim() ||
        number(row.quantity) === null ||
        number(row.gross_sales) === null ||
        !["مبيعات مجمعة للفترة", "إجمالي يحتاج مراجعة", "period_summary", "subtotal"].includes(row.record_type)
    )
  )
    throw validationError(
      "The aggregate report needs consistent periods, item names, nonnegative quantities and sales, and explicit record types."
    );
  const details = rows.filter(
    (row) =>
      !["إجمالي يحتاج مراجعة", "subtotal"].includes(row.record_type) &&
      !/إجمالي|اجمالي|subtotal|total|合计|总计/i.test(row.item_name)
  );
  const top = details
    .toSorted((a, b) => Number(b.gross_sales) - Number(a.gross_sales) || a.rowNumber - b.rowNumber)
    .slice(0, 5)
    .map((row) => ({
      name: row.item_name,
      channel: row.channel || "",
      quantity: Number(row.quantity),
      sales: Number(row.gross_sales),
      sourceSheet: row.source_sheet || "",
      sourceRow: row.source_row || row.rowNumber
    }));
  const c = copy[language] || copy.en;
  const partialPeriod =
    /yesterday|today|week|month|daily|20\d{2}-\d{2}-\d{2}|[اأ]مس|اليوم|[اأ]سبوع|شهر|يومي|昨天|今天|本周|本月|每日/i.test(
      question
    );
  const supported = !partialPeriod && ["summary", "menu", "recommendations"].includes(intent);
  const data = {
    filename: job.original_filename,
    fileSha256: job.file_sha256,
    rowCount: rows.length,
    excludedSubtotalRows: rows.length - details.length,
    period: { fromDate, toDate },
    topRows: supported ? top : []
  };
  const digest = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const format = (n) => n.toLocaleString(language === "zh" ? "zh-CN" : language, { maximumFractionDigits: 2 });
  const content = [
    c.intro,
    job.original_filename,
    `${fromDate} — ${toDate}`,
    `${c.rows}: ${rows.length} · ${c.excluded}: ${rows.length - details.length}`,
    supported ? c.top : c.unsupported,
    ...(supported ? top.map((row) => `${row.name} (${row.channel}): ${format(row.sales)}`) : []),
    c.limit,
    ...(supported ? [c.review] : [])
  ].join("\n");
  return {
    version: "import-report-v1",
    intent,
    language,
    importJobId: id,
    scope: { kind: "restaurant", restaurantId: user.restaurant_id, branchId: null },
    period: { fromDate, toDate },
    dataRevision: getDataRevision(user),
    currencyCode: null,
    toolsUsed: ["uploaded_report"],
    claims: [],
    sources: [{ id: "upload1", url: "/app/imports", period: { fromDate, toDate }, digest, data }],
    content,
    aiMode: "builtin_evidence",
    model: "deterministic-import-report-v1",
    generatedAt: new Date().toISOString()
  };
}
