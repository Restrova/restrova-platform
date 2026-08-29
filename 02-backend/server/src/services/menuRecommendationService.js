import { menuMarginQuerySchema, validate } from "../validation/schemas.js";
import { getMenuEngineeringMatrix } from "./menuEngineeringService.js";

export const menuRecommendationFormulaVersion = "4.7-v1";

const RULES = Object.freeze({
  STAR: ["promote_item"],
  PLOWHORSE: ["raise_price", "reduce_ingredient_cost", "change_portion"],
  PUZZLE: ["bundle_item"],
  DOG: ["consider_removal"]
});

const RATIONALES = Object.freeze({
  raise_price: "high_popularity_below_portfolio_margin",
  reduce_ingredient_cost: "high_popularity_below_portfolio_margin",
  change_portion: "high_popularity_below_portfolio_margin",
  promote_item: "high_popularity_high_margin",
  bundle_item: "low_popularity_high_margin",
  consider_removal: "low_popularity_below_portfolio_margin"
});

function confidenceFor(item) {
  if (item.completeness.salesLineCount >= 5 && item.completeness.costCoverageBps === 10000) {
    return { level: "high", limitations: [] };
  }
  return {
    level: "medium",
    limitations: ["limited_sales_history_review_before_acceptance"]
  };
}

function evidenceFor(item) {
  return {
    classification: item.engineering.classification,
    popularityBps: item.engineering.popularityBps,
    popularityThresholdBps: item.engineering.popularityThresholdBps,
    contributionMarginBps: item.engineering.contributionMarginBps,
    marginThresholdBps: item.engineering.marginThresholdBps,
    itemRevenueMinor: item.metrics.itemRevenueMinor,
    quantitySoldMicros: item.metrics.quantitySoldMicros,
    contributionProfitMinor: item.metrics.contributionProfitMinor,
    costCoverageBps: item.completeness.costCoverageBps,
    salesLineCount: item.completeness.salesLineCount
  };
}

function recommendationFor(item, action) {
  const confidence = confidenceFor(item);
  return {
    id: `menu:${item.id}:${action}:${menuRecommendationFormulaVersion}`,
    item: {
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      category: item.category
    },
    action,
    rationale: RATIONALES[action],
    priority: item.engineering.classification === "DOG" ? "high" : "medium",
    confidence,
    evidence: evidenceFor(item),
    lineage: item.lineage,
    projectedImpact: null,
    projectedImpactLimitation: "requires_an_explicit_price_or_cost_scenario_and_is_not_invented",
    approval: {
      requiredRole: "owner",
      status: "proposed",
      allowedNextStatuses: ["accepted", "rejected"],
      executionPerformed: false
    },
    outcomeMeasurement: {
      checkpointsDays: [7, 14],
      compareMetrics: [
        "item_revenue_minor",
        "quantity_sold_micros",
        "contribution_profit_minor",
        "contribution_margin_bps"
      ]
    }
  };
}

export function buildMenuRecommendations(items) {
  return items.flatMap((item) =>
    (RULES[item.engineering.classification] || []).map((action) => recommendationFor(item, action))
  );
}

export function getMenuRecommendations(user, query) {
  const parsed = validate(menuMarginQuerySchema, query);
  const matrix = getMenuEngineeringMatrix(user, parsed);
  const recommendations = buildMenuRecommendations(matrix.items);

  return {
    formulaVersion: menuRecommendationFormulaVersion,
    sourceFormulaVersion: matrix.formulaVersion,
    amountStorage: matrix.amountStorage,
    percentageStorage: matrix.percentageStorage,
    scope: matrix.scope,
    period: matrix.period,
    thresholds: matrix.thresholds,
    pagination: {
      ...matrix.pagination,
      returnedRecommendations: recommendations.length
    },
    recommendations,
    excluded: matrix.excluded,
    governance: {
      mode: "read_only_proposals",
      ownerApprovalRequired: true,
      automaticExecution: false,
      lifecycle: ["proposed", "accepted", "rejected", "in_progress", "completed", "cancelled"]
    },
    assumptions: [
      "Recommendations are deterministic proposals derived only from the recorded menu-engineering evidence.",
      "No price, cost, portion, promotion, bundle, or availability change is executed by this endpoint.",
      "Projected impact remains unavailable until an explicit scenario is supplied to a simulation endpoint.",
      "Accepted changes should be compared with the same recorded metrics after 7 and 14 days."
    ]
  };
}
