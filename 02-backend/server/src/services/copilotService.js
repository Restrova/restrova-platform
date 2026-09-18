import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db.js";
import { validate } from "../validation/schemas.js";
import { conflict, notFound, validationError } from "../errors/appError.js";
import { getFinancialReport } from "./financialReportService.js";
import { getBranchOperations } from "./branchOperationsService.js";
import { getMenuMargins } from "./menuMarginService.js";
import { getAlertRules } from "./alertRulesService.js";
import { getForecast } from "./forecastService.js";
import { getDecisions } from "./decisionService.js";
import { getDataRevision } from "./dataRevisionService.js";
import { safe, rounded, dayOffset, localDate } from "./historicalSeriesService.js";
import { resolveFinancialDateRange } from "./financialPeriodService.js";
import { copilotCopy } from "./copilotCopy.js";

export const copilotScopeSchema = z
  .object({
    scope: z.enum(["restaurant", "branch"]).optional(),
    branchId: z.coerce.number().int().positive().optional(),
    fromDate: z.iso.date().optional(),
    toDate: z.iso.date().optional(),
    language: z.enum(["ar", "en", "zh"]).default("ar")
  })
  .strict();
const profitReady = (result) => result.completeness.hasData && result.completeness.missingCategories.length === 0;
const revenueReady = (result) =>
  ["sales", "discounts", "refunds"].every((key) => result.completeness.presentCategories.includes(key));
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function resolveCopilotContext(user, query) {
  const parsed = validate(copilotScopeSchema, query),
    today = localDate(new Date().toISOString(), user.timezone),
    toDate = parsed.toDate || dayOffset(today, -1),
    fromDate = parsed.fromDate || toDate;
  if (fromDate > toDate || toDate >= today || Date.parse(toDate) - Date.parse(fromDate) > 30 * 86400000)
    throw validationError("Select 1–31 completed local dates.");
  const scope = parsed.scope || (user.role === "branch_manager" || parsed.branchId ? "branch" : "restaurant"),
    branchId = scope === "branch" ? parsed.branchId || user.branch_id : undefined;
  if (scope === "restaurant" && parsed.branchId) throw validationError("Restaurant scope cannot include a branch.");
  const from = resolveFinancialDateRange(fromDate, user.timezone).current.from,
    to = resolveFinancialDateRange(toDate, user.timezone).current.to;
  const filters = {
    scope,
    restaurantId: user.restaurant_id,
    ...(branchId ? { branchId } : {}),
    period: "custom",
    anchor: new Date(Date.parse(to) + 1).toISOString(),
    from,
    to,
    comparison: "previous_period"
  };
  // Financial engine resolves current role and membership before any source rows are read.
  const financial = getFinancialReport(user, filters),
    branches = financial.restaurants.flatMap((r) => r.branches.map((b) => ({ id: b.id, name: b.name })));
  return {
    version: "9.1-v1",
    organizationId: user.organization_id,
    restaurantId: user.restaurant_id,
    scope,
    branchId: branchId || null,
    language: parsed.language,
    currencyCode: user.currency,
    timezone: user.timezone,
    fromDate,
    toDate,
    from,
    to,
    filters,
    branches,
    financial,
    dataRevision: getDataRevision(user),
    availableTools: ["financial", "branches", "menu", "alerts", "forecasts", "recommendations"]
  };
}
export function executeCopilotTool(user, context, name) {
  const scope = {
    scope: context.scope,
    restaurantId: user.restaurant_id,
    ...(context.branchId ? { branchId: context.branchId } : {})
  };
  // Only server-resolved inputs reach this allowlist. No SQL, mutation tools or model-supplied scopes.
  switch (name) {
    case "financial":
      return context.financial;
    case "branches":
      return getBranchOperations(user, {
        ...scope,
        period: "custom",
        anchor: context.filters.anchor,
        fromDate: context.fromDate,
        toDate: context.toDate,
        comparison: "previous_period"
      });
    case "menu":
      return getMenuMargins(user, {
        ...(context.branchId ? { branchId: context.branchId } : {}),
        from: context.from,
        to: context.to,
        status: "all",
        limit: 500
      });
    case "alerts":
      return getAlertRules(user, {
        ...scope,
        period: "custom",
        anchor: context.filters.anchor,
        fromDate: context.fromDate,
        toDate: context.toDate,
        comparison: "previous_period",
        language: context.language
      });
    case "forecasts":
      return getForecast(user, { ...scope, horizon: 7, historyDays: 57, language: context.language });
    case "recommendations": {
      if (context.branches.length > 20)
        throw validationError("Select a branch for recommendations across more than 20 branches.");
      return context.branches.map((b) =>
        getDecisions(user, { branchId: b.id, fromDate: context.fromDate, toDate: context.toDate })
      );
    }
    default:
      throw validationError("Unsupported read-only analysis tool.");
  }
}
function sourceCollector(context) {
  const sources = [];
  return {
    sources,
    add(tool, data, url) {
      const id = `e${sources.length + 1}`;
      sources.push({
        id,
        tool,
        version: data.formulaVersion || data.reportVersion || data.version || "9.1-v1",
        digest: hash(data),
        url,
        scope: { restaurantId: context.restaurantId, branchId: context.branchId },
        period:
          tool === "forecasts" && data.daily?.length
            ? { fromDate: data.daily[0].date, toDate: data.daily.at(-1).date }
            : { fromDate: context.fromDate, toDate: context.toDate },
        data
      });
      return id;
    }
  };
}
function format(value, unit, context) {
  if (value == null) return copilotCopy[context.language].insufficient;
  if (unit === "money") {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: context.currencyCode }).resolvedOptions()
      .maximumFractionDigits;
    return new Intl.NumberFormat(context.language, { style: "currency", currency: context.currencyCode }).format(
      value / 10 ** digits
    );
  }
  if (unit === "bps")
    return new Intl.NumberFormat(context.language, { style: "percent", maximumFractionDigits: 2 }).format(
      value / 10000
    );
  return new Intl.NumberFormat(context.language).format(value);
}
function makeClaim(context, key, value, unit, sourceIds, extra = {}) {
  return {
    key,
    label: copilotCopy[context.language][key] || key,
    value,
    unit,
    text: `${copilotCopy[context.language][key] || key}: ${format(value, unit, context)}`,
    status: value == null ? "insufficient_data" : "supported",
    sourceIds,
    ...extra,
    ...(extra.noLoss
      ? { status: "supported", text: `${copilotCopy[context.language][key]}: ${copilotCopy[context.language].noLoss}` }
      : {})
  };
}
function transactionMetrics(user, context) {
  const rows = db
    .prepare(
      `SELECT id,branch_id,external_order_id,created_at,gross_sales_minor,discount_minor,refund_amount_minor FROM sales_lines WHERE organization_id=? AND restaurant_id=? AND (? IS NULL OR branch_id=?) AND julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?) ORDER BY id LIMIT 50001`
    )
    .all(user.organization_id, user.restaurant_id, context.branchId, context.branchId, context.from, context.to);
  if (rows.length > 50000) throw validationError("Selected period exceeds 50000 sales lines.");
  const revenueMinor = safe(
    rows.reduce(
      (n, r) => n + BigInt(r.gross_sales_minor) - BigInt(r.discount_minor) - BigInt(r.refund_amount_minor),
      0n
    )
  );
  return {
    orderCount: rows.length ? new Set(rows.map((r) => `${r.branch_id}:${r.external_order_id}`)).size : null,
    revenueMinor: rows.length ? revenueMinor : null,
    lineage: rows.map((r) => ({ id: r.id, branchId: r.branch_id, orderId: r.external_order_id })),
    observedDates: [...new Set(rows.map((r) => localDate(r.created_at, context.timezone)))].sort()
  };
}
export function buildCopilotAnalysis(user, query, intent = "summary") {
  const context = resolveCopilotContext(user, query),
    c = copilotCopy[context.language],
    collector = sourceCollector(context),
    claims = [],
    toolsUsed = [],
    results = {};
  function run(name) {
    if (!results[name]) {
      results[name] = executeCopilotTool(user, context, name);
      toolsUsed.push(name);
    }
    return results[name];
  }
  const financial = run("financial"),
    current = financial.financials.current,
    previous = financial.financials.comparison;
  const financialId = collector.add(
    "financial",
    financial,
    `/app/profit?${new URLSearchParams({ scope: context.scope, fromDate: context.fromDate, toDate: context.toDate, ...(context.branchId ? { branchId: context.branchId } : {}) })}`
  );
  const claim = (key, value, unit = "money", ids = [financialId], extra = {}) =>
    claims.push(makeClaim(context, key, value, unit, ids, extra));
  let sales,
    salesId,
    revenueMinor = revenueReady(current) ? current.metrics.revenueMinor : null;
  let previousRevenue = previous && revenueReady(previous) ? previous.metrics.revenueMinor : null;
  const revenueSources = [financialId];
  if (["summary", "changes", "profit", "food"].includes(intent)) {
    sales = transactionMetrics(user, context);
    const priorSales = financial.period.comparison
      ? transactionMetrics(user, { ...context, ...financial.period.comparison })
      : null;
    salesId = collector.add("transactions", { current: sales, comparison: priorSales }, "/app/imports");
    revenueSources.push(salesId);
    if (revenueMinor == null) revenueMinor = sales.revenueMinor;
    if (previousRevenue == null) previousRevenue = priorSales?.revenueMinor ?? null;
    claim("revenue", revenueMinor, "money", revenueSources);
    claim("profit", profitReady(current) ? current.metrics.netProfitMinor : null);
    claim("margin", profitReady(current) ? current.metrics.netMarginBps : null, "bps");
    if (previous) {
      claim(
        "change",
        revenueMinor != null && previousRevenue != null ? safe(BigInt(revenueMinor) - BigInt(previousRevenue)) : null,
        "money",
        revenueSources
      );
      claim(
        "profitChange",
        profitReady(current) && profitReady(previous)
          ? safe(BigInt(current.metrics.netProfitMinor) - BigInt(previous.metrics.netProfitMinor))
          : null
      );
      claim(
        "foodChange",
        [current, previous].every((r) => r.completeness.presentCategories.includes("food_costs"))
          ? safe(BigInt(current.metrics.cogsMinor) - BigInt(previous.metrics.cogsMinor))
          : null
      );
      claim(
        "costChange",
        profitReady(current) && profitReady(previous)
          ? safe(BigInt(current.metrics.totalCostsMinor) - BigInt(previous.metrics.totalCostsMinor))
          : null
      );
    }
  }
  if (intent === "food")
    claim("food", current.completeness.presentCategories.includes("food_costs") ? current.metrics.cogsMinor : null);
  if (intent === "summary") {
    claim("orders", sales.orderCount, "count", [salesId]);
    claim(
      "aov",
      sales.orderCount && revenueMinor != null && sales.revenueMinor === revenueMinor
        ? rounded(BigInt(sales.revenueMinor), sales.orderCount)
        : null,
      "money",
      [salesId, financialId]
    );
  }
  if (["summary", "menu"].includes(intent)) {
    const menu = run("menu"),
      source = collector.add("menu", menu, "/app/menu-profitability"),
      observed = menu.items.filter((item) => item.completeness.hasSalesData),
      complete = observed.filter((item) => item.completeness.hasCompleteCosts);
    const truncated = menu.pagination.totalItems > menu.items.length;
    const top =
        !truncated &&
        observed.sort((a, b) => b.metrics.itemRevenueMinor - a.metrics.itemRevenueMinor || a.id - b.id)[0],
      worst =
        !truncated &&
        complete.length === observed.length &&
        complete.sort(
          (a, b) => a.metrics.contributionProfitMinor - b.metrics.contributionProfitMinor || a.id - b.id
        )[0];
    claim("top", top?.metrics?.itemRevenueMinor ?? null, "money", [source], {
      name: top?.name || null,
      itemId: top?.id || null
    });
    claim("worst", worst?.metrics?.contributionProfitMinor ?? null, "money", [source], {
      name: worst?.name || null,
      itemId: worst?.id || null
    });
  }
  if (["summary", "branches"].includes(intent)) {
    const operations = run("branches"),
      source = collector.add("branches", operations, "/app/sales-comparison"),
      all = financial.restaurants.flatMap((r) => r.branches),
      complete = all.filter((b) => profitReady(b.financials.current));
    const best = [...complete].sort(
        (a, b) =>
          b.financials.current.metrics.netProfitMinor - a.financials.current.metrics.netProfitMinor || a.id - b.id
      )[0],
      loss = [...complete]
        .filter((b) => b.financials.current.metrics.netProfitMinor < 0)
        .sort(
          (a, b) =>
            a.financials.current.metrics.netProfitMinor - b.financials.current.metrics.netProfitMinor || a.id - b.id
        )[0];
    claim("best", best?.financials.current.metrics.netProfitMinor ?? null, "money", [financialId, source], {
      name: best?.name || null,
      eligibleBranches: complete.length,
      excludedBranches: all.length - complete.length
    });
    if (intent === "branches")
      claim("loss", loss?.financials.current.metrics.netProfitMinor ?? null, "money", [financialId, source], {
        name: loss?.name || null,
        noLoss: !loss && complete.length === all.length && all.length > 0
      });
  }
  if (["summary", "alerts"].includes(intent)) {
    const alerts = run("alerts"),
      source = collector.add("alerts", alerts, "/app/alerts");
    claim("alerts", alerts.summary.insufficient_data ? null : alerts.alerts.length, "count", [source], {
      confirmedCount: alerts.alerts.length,
      insufficientCount: alerts.summary.insufficient_data,
      items: alerts.alerts.map((a) => ({ title: a.title, action: a.suggestedAction, branchId: a.branchId }))
    });
  }
  if (["pricing", "food", "recommendations"].includes(intent)) {
    const groups = run("recommendations"),
      source = collector.add("recommendations", { groups }, "/app/recommendations"),
      items = groups
        .flatMap((g) => g.recommendations)
        .filter((r) =>
          intent === "pricing" ? r.category === "pricing" : intent === "food" ? r.category === "cost" : true
        );
    claim(intent === "pricing" ? "reprice" : "recommendation", items.length, "count", [source], {
      items: items.slice(0, 50).map((r) => ({
        key: r.key,
        name: r.item?.name || null,
        branchId: r.branchId,
        action: r.recommendedAction,
        problem: r.problem,
        evidence: r.evidence
      })),
      truncated: items.length > 50
    });
  }
  if (intent === "forecasts") {
    const forecast = run("forecasts"),
      source = collector.add("forecasts", forecast, "/app/forecasts");
    claim("forecast", forecast.totals.revenueMinor, "money", [source], {
      forecastDates: forecast.daily.map((d) => d.date),
      uncertainty: "historical_estimate_not_guaranteed"
    });
  }
  const notes = [c.coverage, ...(["profit", "food", "changes", "summary"].includes(intent) ? [c.cause] : [])];
  const executiveSummary = explainChanges(claims, context);
  const content = [
    ...executiveSummary.map((item) => `${item.text} [${item.sourceIds.join(", ")}]`),
    `${c.period}: ${context.fromDate} — ${context.toDate}`,
    ...claims.map((item) => `${item.text}${item.name ? ` · ${item.name}` : ""} [${item.sourceIds.join(", ")}]`),
    ...notes,
    c.review
  ].join("\n");
  return {
    version: "9.8-v1",
    intent,
    language: context.language,
    scope: { kind: context.scope, restaurantId: context.restaurantId, branchId: context.branchId },
    period: { fromDate: context.fromDate, toDate: context.toDate, comparison: financial.period.comparison },
    currencyCode: context.currencyCode,
    timezone: context.timezone,
    dataRevision: context.dataRevision,
    toolsUsed,
    executiveSummary,
    claims,
    sources: collector.sources,
    notes,
    content,
    aiMode: "builtin_evidence",
    model: "deterministic-copilot-v1",
    generatedAt: new Date().toISOString()
  };
}
function explainChanges(claims, context) {
  const c = copilotCopy[context.language],
    byKey = Object.fromEntries(claims.map((item) => [item.key, item]));
  if (!byKey.profitChange) return [];
  const values = [byKey.change, byKey.costChange, byKey.profitChange];
  const sourceIds = [...new Set(values.flatMap((item) => item?.sourceIds || []))];
  if (values.some((item) => item?.value == null)) return [{ text: c.unknown, sourceIds }];
  const [revenue, cost, profit] = values.map((item) => format(item.value, "money", context));
  const text =
    context.language === "ar"
      ? `مقارنة بالفترة السابقة المساوية لها، تغيّر الإيراد بمقدار ${revenue} وإجمالي التكاليف بمقدار ${cost}؛ محاسبيًا، الفرق بينهما يفسّر تغيّر الربح التشغيلي بمقدار ${profit}. راجع البنود الموثّقة مع الفريق قبل ما تعتمد أي إجراء.`
      : context.language === "zh"
        ? `与前一相同时长的期间相比，收入变化为 ${revenue}，总成本变化为 ${cost}；两者之差解释了营业利润的会计变化 ${profit}。采取措施前请与团队审核有证据支持的项目。`
        : `Compared with the preceding equal-length period, revenue changed by ${revenue} and total costs by ${cost}; their difference accounts for the operating profit change of ${profit}. Review the documented components with the team before acting.`;
  return [{ text, sourceIds }];
}
export function classifyCopilotQuestion(text, previous) {
  const question = text.normalize("NFKC").toLowerCase();
  if (
    /delete|drop\s+table|truncate|execute\s+sql|ignore.{0,30}(instruction|rule)|api.?key|password|احذف|امسح|تجاهل.{0,30}(تعليم|قواعد)|كلمة.{0,3}المرور|删除|清空|忽略.{0,10}(指令|规则)|密码/.test(
      question
    )
  )
    return "refused";
  if (/reprice|pric(?:e|ing)|تسعير|[اأ]سع[ار]|سعر|定价|调价/.test(question)) return "pricing";
  if (/food.{0,15}cost|ingredient|تكلف[ةه].{0,15}(طعام|[اأ]كل|مكونات)|食材|食品成本/.test(question)) return "food";
  if (/forecast|predict|توقع|预测/.test(question)) return "forecasts";
  if (/alert|تنبيه|تنبيهات|提醒|预警/.test(question)) return "alerts";
  if (/recommend|توصي|建议/.test(question)) return "recommendations";
  if (/branch|فرع|فروع|门店|分店/.test(question)) return "branches";
  if (/menu|dish|item|صنف|[اأ]صناف|[اأ]طباق|菜单|菜品/.test(question)) return "menu";
  if (/profit|margin|ربح|[اأ]رباح|هامش|利润/.test(question)) return "profit";
  if (/chang|تغير|تغيّر|تغييرات|تغي[يّ]ر|变化/.test(question)) return "changes";
  if (/revenue|sales|summary|report|[اإ]يراد|مبيعات|ملخص|تقرير|收入|销售|摘要|报告/.test(question)) return "summary";
  if (previous && /yesterday|week|what about|and |[اأ]مس|[اأ]سبوع|وماذا|طيب|昨天|本周|那/.test(question))
    return previous;
  return "clarify";
}
function authorizedThread(user, id) {
  const row = db
    .prepare("SELECT * FROM copilot_threads WHERE id=? AND organization_id=? AND restaurant_id=? AND owner_id=?")
    .get(id, user.organization_id, user.restaurant_id, user.owner_id);
  if (!row) throw notFound("Conversation not found");
  resolveCopilotContext(user, { scope: row.scope, ...(row.branch_id ? { branchId: row.branch_id } : {}) });
  return row;
}
export function listCopilotThreads(user) {
  const manager = user.role === "branch_manager";
  return {
    threads: db
      .prepare(
        "SELECT id,title,scope,branch_id AS branchId,version,created_at AS createdAt FROM copilot_threads WHERE organization_id=? AND restaurant_id=? AND owner_id=? AND (?=0 OR (scope='branch' AND branch_id=?)) ORDER BY id DESC LIMIT 50"
      )
      .all(user.organization_id, user.restaurant_id, user.owner_id, manager ? 1 : 0, user.branch_id || null)
  };
}
export function getCopilotThread(user, id) {
  const thread = authorizedThread(user, id),
    revision = getDataRevision(user).revision;
  return {
    id: thread.id,
    version: thread.version,
    scope: thread.scope,
    branchId: thread.branch_id,
    turns: db
      .prepare(
        "SELECT id,question,response_json,created_at AS createdAt FROM copilot_turns WHERE thread_id=? ORDER BY id LIMIT 100"
      )
      .all(thread.id)
      .map((row) => {
        const answer = JSON.parse(row.response_json);
        return {
          id: row.id,
          question: row.question,
          createdAt: row.createdAt,
          answer: {
            ...answer,
            sources: answer.sources.map(({ data, ...source }) => ({
              ...source,
              evidenceUrl: `/copilot/threads/${thread.id}/turns/${row.id}/evidence/${source.id}`
            })),
            stale: answer.dataRevision.revision !== revision
          }
        };
      })
  };
}
export function askCopilot(user, body) {
  const parsed = validate(
    copilotScopeSchema
      .extend({
        message: z.string().trim().min(1).max(4000),
        threadId: z.number().int().positive().optional(),
        version: z.number().int().min(0).default(0),
        requestKey: z.string().uuid()
      })
      .strict(),
    body
  );
  const { version: requestVersion, threadId: requestedThread, requestKey, ...requestBody } = parsed;
  const requestHash = hash(requestBody);
  const prior = db
    .prepare(
      `SELECT t.thread_id,t.question,t.response_json,t.request_hash FROM copilot_turns t JOIN copilot_threads c ON c.id=t.thread_id WHERE c.organization_id=? AND c.restaurant_id=? AND c.owner_id=? AND t.request_key=?`
    )
    .get(user.organization_id, user.restaurant_id, user.owner_id, requestKey);
  const thread = parsed.threadId
    ? authorizedThread(user, parsed.threadId)
    : prior
      ? authorizedThread(user, prior.thread_id)
      : null;
  if (
    thread &&
    ((parsed.scope && parsed.scope !== thread.scope) || (parsed.branchId && parsed.branchId !== thread.branch_id))
  )
    throw conflict("Start a new conversation when changing scope.");
  if (prior) {
    if (prior.thread_id !== thread.id || prior.request_hash !== requestHash)
      throw conflict("Request key was already used for a different question or scope.");
    return { threadId: thread.id, version: thread.version, answer: JSON.parse(prior.response_json), replayed: true };
  }
  if (thread && thread.version !== parsed.version) throw conflict("Conversation changed; reload before continuing.");
  if (thread?.version >= 100) throw conflict("Start a new conversation after 100 turns.");
  const last =
      thread &&
      db.prepare("SELECT response_json FROM copilot_turns WHERE thread_id=? ORDER BY id DESC LIMIT 1").get(thread.id),
    previous = last ? JSON.parse(last.response_json) : null,
    intent = classifyCopilotQuestion(parsed.message, previous?.intent);
  const today = localDate(new Date().toISOString(), user.timezone),
    text = parsed.message.toLowerCase(),
    explicitYesterday = /yesterday|[اأ]مس|昨天/.test(text),
    explicitWeek = /week|[اأ]سبوع|本周|这周/.test(text);
  const period =
    parsed.fromDate || parsed.toDate
      ? { fromDate: parsed.fromDate, toDate: parsed.toDate }
      : explicitYesterday
        ? { fromDate: dayOffset(today, -1), toDate: dayOffset(today, -1) }
        : explicitWeek
          ? { fromDate: dayOffset(today, -7), toDate: dayOffset(today, -1) }
          : previous?.period
            ? { fromDate: previous.period.fromDate, toDate: previous.period.toDate }
            : {};
  const query = {
    scope: thread?.scope || parsed.scope,
    ...(thread?.branch_id || parsed.branchId ? { branchId: thread?.branch_id || parsed.branchId } : {}),
    ...period,
    language: parsed.language
  };
  let answer;
  if (["refused", "clarify"].includes(intent)) {
    const context = resolveCopilotContext(user, query);
    answer = {
      version: "9.8-v1",
      intent,
      language: parsed.language,
      scope: { kind: context.scope, restaurantId: user.restaurant_id, branchId: context.branchId },
      period: { fromDate: context.fromDate, toDate: context.toDate },
      dataRevision: context.dataRevision,
      content: copilotCopy[parsed.language][intent],
      claims: [],
      sources: [],
      toolsUsed: [],
      generatedAt: new Date().toISOString()
    };
  } else answer = buildCopilotAnalysis(user, query, intent);
  if (Buffer.byteLength(JSON.stringify(answer), "utf8") > 2_000_000)
    throw validationError("Evidence exceeds 2 MB; select a shorter period or one branch.");
  return db.transaction(() => {
    let id = thread?.id;
    if (!id)
      id = Number(
        db
          .prepare(
            "INSERT INTO copilot_threads(organization_id,restaurant_id,owner_id,branch_id,scope,title) VALUES (?,?,?,?,?,?)"
          )
          .run(
            user.organization_id,
            user.restaurant_id,
            user.owner_id,
            answer.scope.branchId,
            answer.scope.kind,
            parsed.message.slice(0, 80)
          ).lastInsertRowid
      );
    const changed = db
      .prepare("UPDATE copilot_threads SET version=version+1 WHERE id=? AND version=?")
      .run(id, thread?.version || 0);
    if (!changed.changes) throw conflict();
    db.prepare(
      "INSERT INTO copilot_turns(thread_id,question,response_json,request_key,request_hash) VALUES (?,?,?,?,?)"
    ).run(id, parsed.message, JSON.stringify(answer), parsed.requestKey, requestHash);
    return { threadId: id, version: (thread?.version || 0) + 1, answer };
  })();
}
export function getCopilotEvidence(user, threadId, turnId, sourceId) {
  const thread = authorizedThread(user, threadId),
    turn = db.prepare("SELECT response_json FROM copilot_turns WHERE id=? AND thread_id=?").get(turnId, thread.id);
  if (!turn) throw notFound();
  const answer = JSON.parse(turn.response_json),
    source = answer.sources.find((s) => s.id === sourceId);
  if (!source) throw notFound();
  return { source, stale: answer.dataRevision.revision !== getDataRevision(user).revision };
}
