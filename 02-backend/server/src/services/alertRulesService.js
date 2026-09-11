import { getBranchOperations } from "./branchOperationsService.js";
import { alertRulesQuerySchema, validate } from "../validation/schemas.js";

const copy = {
  ar: {
    food_cost_above_target: [
      "تكلفة الطعام أعلى من الحد المحدد",
      "راجع تكلفة المكونات والهدر وحجم الحصص، وقارنها بالحد المحدد قبل ما تعتمد أي تغيير."
    ],
    sales_drop: [
      "المبيعات انخفضت",
      "راجع الأصناف وقنوات الطلب في الأيام المقارنة، وتأكد من اكتمال الاستيراد قبل ما تحدد السبب."
    ],
    profit_margin_drop: [
      "هامش الربح انخفض",
      "راجع بنود التكاليف والخصومات والمرتجعات للفترتين، وحدد البند اللي يحتاج متابعة."
    ],
    refund_rate_increase: [
      "نسبة المرتجعات ارتفعت",
      "راجع الطلبات المرتجعة وأسبابها مع الفريق، وابدأ بالأسباب المتكررة بعد التأكد منها."
    ],
    discount_rate_increase: [
      "نسبة الخصومات ارتفعت",
      "راجع العروض وصلاحيات الخصم، وتأكد إن الخصومات ماشية مع الخطة المعتمدة."
    ]
  },
  en: {
    food_cost_above_target: [
      "Food cost exceeds the configured target",
      "Review ingredient costs, waste and portions against the configured target before making changes."
    ],
    sales_drop: [
      "Sales declined",
      "Review items and order channels on the compared dates, and verify import completeness before identifying a cause."
    ],
    profit_margin_drop: [
      "Profit margin declined",
      "Review cost categories, discounts and refunds in both periods to identify entries needing follow-up."
    ],
    refund_rate_increase: [
      "Refund rate increased",
      "Review refunded orders and documented reasons with the team, starting with verified recurring issues."
    ],
    discount_rate_increase: [
      "Discount rate increased",
      "Review promotions and discount permissions against the approved plan."
    ]
  },
  zh: {
    food_cost_above_target: ["食材成本超过设定目标", "对照设定目标检查食材成本、损耗和份量，再决定是否调整。"],
    sales_drop: ["销售额下降", "检查对比日期的菜品和订单渠道，并在判断原因前确认导入数据是否完整。"],
    profit_margin_drop: ["利润率下降", "检查两个期间的成本项目、折扣和退款，找出需要跟进的记录。"],
    refund_rate_increase: ["退款率上升", "与团队核查退款订单及其原因，优先处理已确认的重复问题。"],
    discount_rate_increase: ["折扣率上升", "对照已批准的计划检查促销活动和折扣权限。"]
  }
};

const rules = [
  ["food_cost_above_target", "foodCostTargetBps", "ratio"],
  ["sales_drop", "salesDropBps", "relative_decrease"],
  ["profit_margin_drop", "profitMarginDropBps", "percentage_point_decrease"],
  ["refund_rate_increase", "refundRateIncreaseBps", "percentage_point_increase"],
  ["discount_rate_increase", "discountRateIncreaseBps", "percentage_point_increase"]
];

// Fractions remain exact through rule evaluation; display rounding never triggers an alert.
function fraction(numerator, denominator) {
  return denominator > 0 ? { n: BigInt(numerator), d: BigInt(denominator) } : null;
}
function subtract(left, right) {
  return left && right ? { n: left.n * right.d - right.n * left.d, d: left.d * right.d } : null;
}
function bps(value) {
  if (!value) return null;
  const n = value.n * 10000n;
  const rounded = Number(((n < 0n ? -n : n) + value.d / 2n) / value.d) * (n < 0n ? -1 : 1);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

export function getAlertRules(user, query) {
  const parsed = validate(alertRulesQuerySchema, query);
  const language = parsed.language ?? (["ar", "en", "zh"].includes(user.language) ? user.language : "ar");
  const operations = getBranchOperations(user, parsed);
  const thresholds = Object.fromEntries(rules.map(([, key]) => [key, parsed[key]]));
  const eligible = new Map(operations.sameStore.eligible.map((branch) => [branch.branchId, branch]));
  const excluded = new Map(operations.sameStore.excluded.map((branch) => [branch.branchId, branch]));
  const evaluations = [];
  for (const card of operations.scorecards) {
    const branch = eligible.get(card.branchId);
    for (const [type, thresholdKey, measurement] of rules) {
      const [title, suggestedAction] = copy[language][type];
      const result = {
        id: `${card.restaurantId}:${card.branchId}:${type}:${operations.period.current.from}:${operations.period.current.to}`,
        restaurantId: card.restaurantId,
        branchId: card.branchId,
        branchName: card.branchName,
        type,
        title,
        suggestedAction,
        status: "insufficient_data",
        reason: null,
        thresholdBps: thresholds[thresholdKey],
        measurement,
        operator: ">",
        measuredBps: null,
        expectedImpactMinor: null,
        evidence: {
          dates: operations.sameStore.alignment,
          current: branch?.current ?? null,
          comparison: branch?.comparison ?? null,
          excludedReasons: excluded.get(card.branchId)?.reasons ?? [],
          ledger: null
        }
      };
      evaluations.push(result);
      // All five rules use the same documented fixed cohort, including the target rule.
      if (!branch) {
        result.reason = "not_comparable";
        continue;
      }
      let measured;
      if (type === "sales_drop") {
        measured = fraction(
          BigInt(branch.comparison.revenueMinor) - BigInt(branch.current.revenueMinor),
          branch.comparison.revenueMinor
        );
      } else if (type === "refund_rate_increase" || type === "discount_rate_increase") {
        const field = type === "refund_rate_increase" ? "refundsMinor" : "discountsMinor";
        measured = subtract(
          fraction(branch.current[field], branch.current.grossSalesMinor),
          fraction(branch.comparison[field], branch.comparison.grossSalesMinor)
        );
      } else {
        result.evidence.ledger = {
          current: card.current,
          comparison: card.comparison,
          completeness: card.completeness,
          lineage: card.lineage
        };
        if (!card.fullPeriodComparable) {
          result.reason = "ledger_period_not_fully_aligned";
          continue;
        }
        const periods = type === "food_cost_above_target" ? ["current"] : ["current", "comparison"];
        const amountKey = type === "food_cost_above_target" ? "foodCostsMinor" : "netProfitMinor";
        if (periods.some((period) => card[period]?.[amountKey] == null || card[period]?.revenueMinor == null)) {
          result.reason = "missing_ledger_categories";
          continue;
        }
        if (periods.some((period) => card[period].revenueMinor !== branch[period].revenueMinor)) {
          result.reason = "ledger_sales_mismatch";
          continue;
        }
        const current = fraction(card.current[amountKey], card.current.revenueMinor);
        measured =
          type === "food_cost_above_target"
            ? current
            : subtract(fraction(card.comparison.netProfitMinor, card.comparison.revenueMinor), current);
      }
      if (!measured) {
        result.reason = "non_positive_denominator";
        continue;
      }
      result.measuredBps = bps(measured);
      if (result.measuredBps === null) {
        result.reason = "measurement_out_of_range";
        continue;
      }
      result.status = measured.n * 10000n > BigInt(result.thresholdBps) * measured.d ? "triggered" : "not_triggered";
    }
  }
  evaluations.sort((a, b) => a.branchId - b.branchId || a.type.localeCompare(b.type));
  return {
    rulesVersion: "6.1-v1",
    language,
    scope: operations.scope,
    currencyCode: operations.currencyCode,
    timezone: operations.timezone,
    period: operations.period,
    thresholds,
    alerts: evaluations.filter((item) => item.status === "triggered"),
    evaluations,
    summary: Object.fromEntries(
      ["triggered", "not_triggered", "insufficient_data"].map((status) => [
        status,
        evaluations.filter((item) => item.status === status).length
      ])
    ),
    policy: {
      comparison: "strict_greater_than_exact_fraction",
      thresholdsSource: "request_overrides_with_documented_defaults",
      money: "integer_minor_units",
      rateUnit: "basis_points_100_per_percentage_point",
      cohort: operations.sameStore.alignment.policy,
      limitations: [
        "Rules require comparable completed dates and explicit branch lifecycle evidence, including the food-cost target rule.",
        "Food cost and profit rules require full aligned periods, explicit ledger categories and reconciliation with imported net sales.",
        "Defaults are screening thresholds, not inferred restaurant targets. Overrides are not saved as preferences.",
        "Missing evidence is not a healthy result. No causal explanation or financial impact is estimated.",
        ...operations.policy.limitations
      ]
    }
  };
}
