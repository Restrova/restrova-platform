import { executeTool } from "./tools.js";

export function analyticsRequest(text) {
  const q = text.toLowerCase().replace(/[أإآ]/g, "ا");
  let name;
  if (/(refund|استرداد|مرتجع|ارجاع)/.test(q)) name = "get_refund_summary";
  else if (/(worst|weak|low.?margin|hurt.*profit|اسوا|اضعف|يخسر|خسارة|هامش منخفض|يضر.*الربح)/.test(q))
    name = "get_low_performance_items";
  else if (/(top|best|popular|افضل|الاكثر مبيع)/.test(q) && /(dish|item|menu|selling|طبق|اطباق|مبيع)/.test(q))
    name = "get_top_dishes";
  else if (
    /(sales|revenue|profit|margin|orders|cost|performance|summary|مبيعات|ايراد|ارباح|ربح|هامش|طلبات|تكلفة|اداء|ملخص)/.test(
      q
    )
  )
    name = "get_profit_summary";
  else return null;
  if (/(inventory|stock|staff|attention|priority|مخزون|موظف|وردية|انتباه|الاولوية|المشاكل)/.test(q)) return null;
  const range = /(month|شهر)/.test(q)
    ? "month"
    : /(week|اسبوع)/.test(q)
      ? "week"
      : /(yesterday|امس)/.test(q)
        ? "yesterday"
        : /(today|اليوم)/.test(q)
          ? "today"
          : ["get_top_dishes", "get_low_performance_items"].includes(name)
            ? "month"
            : "today";
  const dates = q.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  if (dates.length > 2) return { unsupported: true };
  const date = dates.length === 1 ? dates[0] : null;
  const args = dates.length === 2 ? { fromDate: dates[0], toDate: dates[1] } : date ? { date } : { range };
  // Do not silently relabel a comparison or an unsupported historical period as the current period.
  if (
    /(compare|comparison|قارن|مقارن)/.test(q) ||
    (/(last|previous|الماضي|السابق|منذ|\b\d{4}\b)/.test(q) && !dates.length)
  )
    return { unsupported: true };
  if (
    name === "get_profit_summary" &&
    dates.length < 2 &&
    (date || range === "today" || range === "yesterday") &&
    !/(profit|margin|cost|ارباح|ربح|هامش|تكلفة)/.test(q)
  )
    name = "get_daily_sales";
  return { name, args };
}

export function formatImportedAnswer(name, data, arabic) {
  const meta = Array.isArray(data) ? data.metadata : data;
  if (meta?.source !== "imports") return null;
  const localDate = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: meta.timezone }).format(new Date(value));
  const money = (value) =>
    value == null
      ? arabic
        ? "غير متاح"
        : "Unavailable"
      : new Intl.NumberFormat("en", { style: "currency", currency: meta.currency }).format(value);
  const from = localDate(meta.period.from);
  const to = localDate(meta.period.to);
  const scope = meta.branch_name || (arabic ? "المطعم" : "Restaurant");
  const heading = arabic
    ? `الفرع: ${scope}\nالفترة: ${from} — ${to} (${meta.timezone})\nالمصدر: البيانات المستوردة`
    : `Scope: ${scope}\nPeriod: ${from} — ${to} (${meta.timezone})\nSource: imported data`;
  const noSales = arabic
    ? "لا توجد بيانات مبيعات مسجلة لهذا الفرع خلال الفترة المطلوبة. هذا لا يعني أن المبيعات الفعلية تساوي صفرًا."
    : "No sales records are available for this scope and period. This does not establish that actual sales were zero.";
  const coverage = meta.coverage?.first
    ? arabic
      ? `\nتواريخ المبيعات المتاحة: ${localDate(meta.coverage.first)} — ${localDate(meta.coverage.last)}.`
      : `\nAvailable sales dates: ${localDate(meta.coverage.first)} — ${localDate(meta.coverage.last)}.`
    : "";
  if (!meta.has_sales && (name !== "get_refund_summary" || !meta.has_data))
    return `${heading}\n\n${noSales}${coverage}`;
  if (Array.isArray(data)) {
    if (!data.length)
      return `${heading}\n\n${arabic ? "لا توجد أطباق مطابقة في السجلات المتاحة لهذه الفترة." : "No matching dishes were found in the available records for this period."}`;
    const title =
      name === "get_top_dishes"
        ? arabic
          ? "أفضل الأطباق حسب صافي المبيعات"
          : "Top dishes by net sales"
        : arabic
          ? "أطباق تحتاج مراجعة المبيعات أو التكلفة"
          : "Dishes needing sales or cost review";
    return `${heading}\n\n${title}\n${data
      .slice(0, 5)
      .map(
        (item, index) =>
          `${index + 1}. ${item.name}: ${item.units} ${arabic ? "وحدة، صافي المبيعات" : "units, net sales"} ${money(item.revenue)}، ${arabic ? "هامش المساهمة" : "contribution margin"} ${item.margin_percent == null ? (arabic ? "غير متاح: بيانات التكلفة ناقصة" : "unavailable: missing cost records") : `${item.margin_percent}%`}`
      )
      .join("\n")}`;
  }
  if (name === "get_refund_summary")
    return `${heading}\n\n${arabic ? "المبلغ المسترد المسجل" : "Recorded refunds"}: ${money(data.refunded_amount)}\n${arabic ? "أسباب الاسترداد غير متوفرة في البيانات المستوردة." : "Refund reasons are not available in the imported data."}${!meta.has_data ? `\n${noSales}${coverage}` : ""}`;
  const title = arabic ? "ملخص الفترة المطلوبة" : "Requested period summary";
  const caveat = arabic
    ? "الربح تقديري بعد التكاليف المسجلة فقط؛ قد تنقص بيانات مثل الأجور والإيجار والمصروفات الأخرى."
    : "Profit is an estimate after recorded costs only; labor, rent and other expenses may be incomplete.";
  return `${heading}\n\n${title}\n${arabic ? "صافي المبيعات" : "Net sales"}: ${money(data.net_revenue)}\n${arabic ? "الطلبات" : "Orders"}: ${data.orders}\n${arabic ? "التكاليف المسجلة" : "Recorded costs"}: ${money(data.cost)}\n${arabic ? "الربح التقديري" : "Estimated profit"}: ${money(data.profit)}\n${arabic ? "هامش الربح" : "Profit margin"}: ${data.margin_percent == null ? (arabic ? "غير متاح" : "Unavailable") : `${data.margin_percent}%`}\n\n${data.cost_complete ? caveat : arabic ? "لا يمكن حساب الربح والهامش لأن بيانات التكلفة غير مكتملة." : "Profit and margin are unavailable because cost records are incomplete."}`;
}

export function importedQuestionReply(text, context) {
  const request = analyticsRequest(text);
  if (!request || request.unsupported) return null;
  return formatImportedAnswer(
    request.name,
    executeTool(request.name, request.args, context),
    /[\u0600-\u06FF]/.test(text)
  );
}
