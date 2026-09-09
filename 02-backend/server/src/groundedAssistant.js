import { analyticsPeriod, analyticsRequest, formatImportedAnswer, normalizeQuestion } from "./analyticsAnswer.js";
import { hasFinancialData } from "./services/importedAnalyticsService.js";
import { executeTool } from "./tools.js";

const timePattern =
  /\d{4}-\d{2}-\d{2}|today|yesterday|week|month|year|quarter|last|previous|اليوم|امس|اسبوع|شهر|سنه|سنة|عام|ربع|السابق|الماضي/;
const broadPattern =
  /حلل|تحليل|بياناتي|البيانات|رفعته|رفعتها|استورد|ايجابيات|سلبيات|نقاط.*(قوه|قوة|ضعف)|تنصح|توصي|اولوي|انتباه|المشاكل|موجز|analy[sz]e|uploaded|imported|my data|strength|weakness|attention|priority|manager brief/;

export function groundedReply(text, context, history = []) {
  if (!hasFinancialData(context.restaurantId)) return null;
  const q = normalizeQuestion(text);
  const arabic = /[\u0600-\u06FF]/.test(text);
  // Keep writes, tutorials, hypothetical arithmetic and general questions on their own routes.
  if (
    /(^|\s)(احذف|اوقف|عطل|فعل|انشئ|لو|اذا)(\s|$)|\b(delete|disable|deactivate|activate|if)\b|create.*report|كيف.*(ارفع|استورد)|how.*(upload|import)/.test(
      q
    )
  )
    return null;
  if (/(كتاب|دليل|سياسة|وصفة|تدريب|manual|policy|recipe|training)/.test(q)) return null;
  const request = analyticsRequest(q);
  const broad = broadPattern.test(q);
  const inventoryOnly = /(inventory|stock|مخزون|مكونات)/.test(q) && !broad;
  if (inventoryOnly || (!request && !broad)) return null;
  const unsupported =
    request?.unsupported ||
    /قارن|مقارن|compare|comparison/.test(q) ||
    (timePattern.test(q) && !/\d{4}-\d{2}-\d{2}|today|yesterday|week|month|اليوم|امس|اسبوع|شهر/.test(q));
  if (unsupported)
    return {
      content: arabic
        ? "عشان أعطيك نتيجة دقيقة، حدّد تاريخ البداية والنهاية بصيغة YYYY-MM-DD. المقارنة بين فترتين متاحة من صفحة مركز القرار؛ ما راح أستبدل الفترة اللي طلبتها بفترة ثانية."
        : "Specify a start and end date using YYYY-MM-DD. Use the decision dashboard to compare periods; I will not substitute a different period.",
      toolsUsed: [],
      aiMode: "builtin"
    };
  let args = request?.args || { range: "available" };
  if (!timePattern.test(q)) {
    args = { range: "available" };
    // Only short follow-ups inherit dates; a fresh question about uploads uses their full coverage.
    if (/^(وش|طيب|و |وماذا|what about|and |then )/.test(q)) {
      for (const message of history.slice(0, -1).reverse()) {
        if (message.role !== "user") continue;
        const previousText = normalizeQuestion(message.content);
        const previous = analyticsPeriod(previousText);
        if (
          (analyticsRequest(previousText) || broadPattern.test(previousText)) &&
          !previous.unsupported &&
          timePattern.test(previousText)
        ) {
          args = previous.args;
          break;
        }
      }
    }
  } else if (!request) {
    const periodRequest = analyticsPeriod(q);
    if (periodRequest?.unsupported)
      return {
        content: arabic
          ? "حدّد تاريخ البداية والنهاية للفترة اللي تبي أحللها."
          : "Specify the start and end date to analyze.",
        toolsUsed: [],
        aiMode: "builtin"
      };
    args = periodRequest?.args || args;
  }
  const toolsUsed = [];
  const read = (name) => {
    toolsUsed.push(name);
    return executeTool(name, args, context);
  };
  const name = request?.name || "get_profit_summary";
  const data = read(name);
  const meta = Array.isArray(data) ? data.metadata : data;
  let content = formatImportedAnswer(name, data, arabic);
  if (!content) return null;
  if (meta.has_sales && broad && !Array.isArray(data)) {
    const top = read("get_top_dishes")[0];
    const weak = read("get_low_performance_items");
    const risk = weak.find((item) => item.margin_percent != null && item.margin_percent < 35);
    const missing = weak.find((item) => item.margin_percent == null);
    if (top)
      content += arabic
        ? `\n\nنقطة قوة في المبيعات: «${top.name}» يتصدر الأصناف حسب صافي المبيعات في نفس الفترة. أنصحك تتأكد من توفر مكوناته وتراجع هامشه قبل زيادة الترويج له.`
        : `\n\nSales strength: ${top.name} leads item net sales for the same period. Check availability and contribution margin before increasing promotion.`;
    if (missing)
      content += arabic
        ? `\n\nنقطة تحتاج استكمال: تكلفة «${missing.name}» غير مكتملة؛ ما نقدر نصنفه كصنف رابح أو خاسر حاليًا.`
        : `\n\nData gap: ${missing.name} has incomplete costs, so its profitability cannot be classified.`;
    if (risk)
      content += arabic
        ? `\n\nنقطة تحتاج مراجعة: هامش مساهمة «${risk.name}» هو ${risk.margin_percent}%. راجع تكلفة الحصة والسعر؛ هذا تنبيه حسب حد المراجعة في النظام، وما يعني بالضرورة أن الصنف خاسر.`
        : `\n\nReview point: ${risk.name} has a ${risk.margin_percent}% contribution margin. Review portion cost and price; a review threshold alone does not mean a loss.`;
  }
  if (broad && /(attention|priority|انتباه|اولوي|مخزون|inventory|stock)/.test(q)) {
    const inventory = read("get_inventory_status");
    const low = inventory.items.filter((item) => item.status === "low");
    content += arabic
      ? !inventory.items.length
        ? "\n\nالمخزون: ما عندي سجلات مخزون لهذا الفرع. ارفع الكميات وحدود إعادة الطلب عشان أقيّم وضعه."
        : low.length
          ? `\n\nالمخزون الحالي: ${low
              .slice(0, 5)
              .map((item) => `${item.item_name}: المتبقي ${item.quantity} وحد إعادة الطلب ${item.threshold}`)
              .join("؛ ")}. أنصحك تتأكد من الكميات الفعلية قبل التوريد.`
          : "\n\nالمخزون الحالي: ما فيه عنصر تحت حد إعادة الطلب في السجلات المتاحة. تأكد من تحديث الكميات قبل الوردية."
      : !inventory.items.length
        ? "\n\nInventory: no records are available for this branch. Import quantities and reorder thresholds."
        : low.length
          ? `\n\nCurrent inventory: ${low
              .slice(0, 5)
              .map((item) => `${item.item_name}: ${item.quantity} remaining, reorder threshold ${item.threshold}`)
              .join("; ")}. Verify on-hand quantities before ordering.`
          : "\n\nCurrent inventory: no recorded item is below its reorder threshold. Verify quantities are up to date.";
  }
  if (meta.has_sales && Array.isArray(data) && data.length)
    content += arabic
      ? name === "get_top_dishes"
        ? "\n\nأنصحك تراجع هامش المساهمة للأصناف المتصدرة قبل العروض؛ الصنف الأعلى مبيعًا مو بالضرورة الأعلى ربحًا."
        : "\n\nأنصحك تبدأ باستكمال التكاليف الناقصة، وبعدها تراجع السعر وتكلفة الحصة. ضعف المبيعات أو الهامش لحاله ما يبرر إيقاف الصنف."
      : "\n\nNext action: complete missing costs and review contribution margins before changing prices or item availability.";
  return {
    content,
    toolsUsed,
    aiMode: "builtin",
    evidence: {
      source: "imports",
      branchId: meta.branch_id,
      branchName: meta.branch_name,
      period: meta.period,
      currency: meta.currency,
      timezone: meta.timezone,
      hasSales: meta.has_sales,
      missingCategories: meta.missing_categories || []
    }
  };
}
