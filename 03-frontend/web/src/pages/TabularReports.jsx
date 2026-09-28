import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Button } from "../components/ui/Button.jsx";
const copy = {
  en: {
    title: "Detailed reports & exports",
    intro:
      "Confirmed imported records feed these reports. Aggregate upload previews remain separate. Select 1–31 completed local dates; blank dates use yesterday.",
    kind: "Detailed report type",
    financial: "Financial statement",
    branches: "Branch scorecards",
    menu: "Menu economics",
    ledger: "Ledger for downstream accounting",
    from: "Report start",
    to: "Report end",
    load: "Generate report",
    loading: "Preparing report…",
    error:
      "Unable to prepare the report. Check the dates and scope, then retry. Exports support up to 5,000 rows; choose a smaller scope for larger data.",
    empty: "No records in this period.",
    missing: "Insufficient data",
    supported: "Recorded",
    tax: "Tax is not modeled. This export is source data for review, not a tax return. Operating profit excludes unmodeled adjustments. Branch scorecards exclude restaurant-level unallocated entries.",
    evidence: "Source evidence",
    period: "Period",
    currency: "Currency",
    revision: "Data revision",
    previous: "Previous period",
    exportError: "Export failed or data changed. Generate the report again before exporting.",
    rows: "Rows",
    previousMissing: "A blank comparison means previous-period inputs are missing.",
    more: "Showing the first 100 rows. Exports contain all rows.",
    invalid: "Choose both dates in ascending order, or leave both empty."
  },
  ar: {
    title: "التقارير التفصيلية والتصدير",
    intro:
      "تعتمد التقارير على السجلات المستوردة والمؤكدة. معاينات الملفات المجمّعة منفصلة عنها. اختر من يوم إلى 31 يومًا مكتملًا حسب توقيت المطعم؛ ترك التاريخين فارغين يعرض أمس.",
    kind: "نوع التقرير",
    financial: "القائمة المالية",
    branches: "بطاقات أداء الفروع",
    menu: "اقتصاديات الأصناف",
    ledger: "دفتر السجلات للمراجعة المحاسبية",
    from: "بداية التقرير",
    to: "نهاية التقرير",
    load: "إنشاء التقرير",
    loading: "جارٍ إعداد التقرير…",
    error:
      "تعذّر إعداد التقرير. راجع التواريخ والنطاق وأعد المحاولة. الحد الأقصى للتصدير 5000 صف؛ قلّل الفترة أو اختر فرعًا للبيانات الكبيرة.",
    empty: "لا توجد سجلات في هذه الفترة.",
    missing: "بيانات غير كافية",
    supported: "مسجّل",
    tax: "الضريبة غير محسوبة. هذا التصدير بيانات مصدر للمراجعة وليس إقرارًا ضريبيًا. الربح التشغيلي يستثني التسويات غير المسجلة. بطاقات الفروع لا تشمل السجلات غير الموزعة على فرع.",
    evidence: "أدلة المصدر",
    period: "الفترة",
    currency: "العملة",
    revision: "إصدار البيانات",
    previous: "الفترة السابقة",
    exportError: "تعذّر التصدير أو تغيّرت البيانات. أنشئ التقرير مجددًا ثم أعد التصدير.",
    rows: "الصفوف",
    previousMissing: "خانة المقارنة الفارغة تعني نقص بيانات الفترة السابقة.",
    more: "يعرض الجدول أول 100 صف. التصدير يشمل جميع الصفوف.",
    invalid: "اختر التاريخين بترتيب صحيح أو اتركهما فارغين."
  },
  zh: {
    title: "详细报告与导出",
    intro: "报告使用已确认导入的记录。汇总文件预览单独分析。请选择餐厅时区内已结束的1至31天；日期留空时使用昨天。",
    kind: "报告类型",
    financial: "财务报表",
    branches: "门店绩效",
    menu: "菜品经济分析",
    ledger: "供会计审核的账簿",
    from: "报告开始日期",
    to: "报告结束日期",
    load: "生成报告",
    loading: "正在准备报告…",
    error: "无法生成报告，请检查日期与范围后重试。最多导出5000行，数据较多时请缩小范围。",
    empty: "该期间没有记录。",
    missing: "数据不足",
    supported: "已记录",
    tax: "税务尚未建模。导出仅用于审核，不是税务申报。营业利润不含未建模调整，门店报表不含未分配至门店的记录。",
    evidence: "来源证据",
    period: "期间",
    currency: "币种",
    revision: "数据版本",
    previous: "上一期间",
    exportError: "导出失败或数据已变化。请重新生成报告后导出。",
    rows: "行数",
    previousMissing: "空白比较值表示上一期间数据不足。",
    more: "仅显示前100行，导出包含全部行。",
    invalid: "请按顺序选择两个日期，或将两个日期都留空。"
  }
};
export function TabularReports({ scopeKey, scope, branchId, language, canExport }) {
  const c = copy[language] || copy.en;
  const [kind, setKind] = useState("financial"),
    [fromDate, setFrom] = useState(""),
    [toDate, setTo] = useState(""),
    [selection, setSelection] = useState(null),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState(false);
  const valid = (!fromDate && !toDate) || (Boolean(fromDate && toDate) && fromDate <= toDate);
  const query = useQuery({
    queryKey: ["tabular-report", scopeKey, selection],
    queryFn: ({ signal }) => api(`/reports/table?${new URLSearchParams(selection)}`, { signal }),
    enabled: Boolean(selection),
    retry: false
  });
  const report = query.data;
  function reset(setter, value) {
    setter(value);
    setSelection(null);
    setExportError(false);
  }
  async function download(format) {
    setExporting(true);
    setExportError(false);
    try {
      const params = new URLSearchParams({
        ...selection,
        fromDate: report.period.fromDate,
        toDate: report.period.toDate
      });
      params.set("expectedRevision", report.dataRevision.revision);
      const body = await api(`/reports/table.${format}?${params}`, { responseType: "blob" });
      const url = URL.createObjectURL(body),
        link = document.createElement("a");
      link.href = url;
      link.download = `restrova-${report.kind}-${report.period.fromDate}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }
  const formatValue = (row, column) => {
    const value = row[column.key];
    if (value == null) return c.missing;
    if (column.key === "status") return value === "supported" ? c.supported : c.missing;
    if (column.key === "taxStatus") return c.missing;
    if (column.type === "money_minor") {
      const options = { style: "currency", currency: report.currencyCode };
      const digits = new Intl.NumberFormat(language, options).resolvedOptions().maximumFractionDigits;
      return new Intl.NumberFormat(language, options).format(value / 10 ** digits);
    }
    if (column.type === "bps")
      return new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 2 }).format(value / 10000);
    return typeof value === "number" ? new Intl.NumberFormat(language).format(value) : value;
  };
  return (
    <section className="tabular-reports" aria-label={c.title}>
      <h2>{c.title}</h2>
      <p>{c.intro}</p>
      <form
        className="intelligence-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          setExportError(false);
          const nextSelection = {
            kind,
            scope,
            language,
            ...(scope === "branch" && branchId ? { branchId } : {}),
            ...(fromDate ? { fromDate, toDate } : {})
          };
          if (JSON.stringify(nextSelection) === JSON.stringify(selection)) query.refetch();
          else setSelection(nextSelection);
        }}
      >
        <label>
          {c.kind}
          <select value={kind} onChange={(e) => reset(setKind, e.target.value)}>
            {["financial", "branches", "menu", ...(canExport ? ["ledger"] : [])].map((key) => (
              <option key={key} value={key}>
                {c[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {c.from}
          <input type="date" value={fromDate} onChange={(e) => reset(setFrom, e.target.value)} />
        </label>
        <label>
          {c.to}
          <input type="date" min={fromDate} value={toDate} onChange={(e) => reset(setTo, e.target.value)} />
        </label>
        <Button type="submit" disabled={!valid || query.isFetching || (scope === "branch" && !branchId)}>
          {query.isFetching ? c.loading : c.load}
        </Button>
      </form>
      {!valid && <p role="alert">{c.invalid}</p>}
      {selection && query.isFetching && <p role="status">{c.loading}</p>}
      {selection && query.isError && <p role="alert">{c.error}</p>}
      {report && selection && !query.isError && (
        <>
          <h3>{c[report.kind]}</h3>
          <p>
            {c.period}:{" "}
            <bdi>
              {report.period.fromDate} — {report.period.toDate}
            </bdi>{" "}
            · {c.currency}: {report.currencyCode} · {c.revision}: {report.dataRevision.revision} · {c.rows}:{" "}
            {report.rows.length}
          </p>
          {report.period.comparison && (
            <p>
              {c.previous}:{" "}
              <bdi>
                {report.period.comparison.from} — {report.period.comparison.to}
              </bdi>
            </p>
          )}
          <p>{c.tax}</p>
          <p>{c.previousMissing}</p>
          {canExport && (
            <div className="decision-links">
              <Button disabled={exporting || query.isFetching} onClick={() => download("csv")}>
                CSV
              </Button>
              <Button disabled={exporting || query.isFetching} onClick={() => download("xlsx")}>
                Excel
              </Button>
            </div>
          )}
          {exportError && <p role="alert">{c.exportError}</p>}
          {!report.rows.length ? (
            <p>{c.empty}</p>
          ) : (
            <div className="report-table" role="region" aria-label={c[report.kind]} tabIndex={0}>
              <table>
                <caption>{c[report.kind]}</caption>
                <thead>
                  <tr>
                    {report.columns.map((col) => (
                      <th key={col.key} scope="col">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, 100).map((row, i) => (
                    <tr key={row.id || `${row.branch}:${row.key}:${i}`}>
                      {report.columns.map((col) => (
                        <td key={col.key}>
                          <bdi>{formatValue(row, col)}</bdi>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {report.rows.length > 100 && <p>{c.more}</p>}
          <details>
            <summary>{c.evidence}</summary>
            <p>
              <bdi>{report.digest}</bdi>
            </p>
            <pre className="decision-evidence">{JSON.stringify(report.sources, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
