import { menuMarginQuerySchema, validate } from "../validation/schemas.js";
import { getMenuMargins } from "./menuMarginService.js";

export const menuEngineeringFormulaVersion = "4.3-v1";

function roundRatio(numerator, denominator, scale = 1) {
  if (!denominator) return null;
  return Math.round((numerator * scale) / denominator);
}

export function classifyMenuItems(items) {
  const eligible = items.filter(
    (item) =>
      item.completeness.ready &&
      item.metrics.quantitySoldMicros > 0 &&
      item.metrics.itemRevenueMinor > 0 &&
      item.metrics.contributionProfitMinor !== null &&
      item.metrics.contributionMarginBps !== null
  );
  const totalQuantityMicros = eligible.reduce((sum, item) => sum + item.metrics.quantitySoldMicros, 0);
  const totalRevenueMinor = eligible.reduce((sum, item) => sum + item.metrics.itemRevenueMinor, 0);
  const totalContributionMinor = eligible.reduce((sum, item) => sum + item.metrics.contributionProfitMinor, 0);
  const popularityThresholdBps = eligible.length ? roundRatio(1, eligible.length, 10000) : null;
  const marginThresholdBps = roundRatio(totalContributionMinor, totalRevenueMinor, 10000);

  const classified = eligible.map((item) => {
    const engineeringPopularityBps = roundRatio(item.metrics.quantitySoldMicros, totalQuantityMicros, 10000);
    const highPopularity = engineeringPopularityBps >= popularityThresholdBps;
    const highMargin = item.metrics.contributionMarginBps >= marginThresholdBps;
    const classification = highPopularity ? (highMargin ? "STAR" : "PLOWHORSE") : highMargin ? "PUZZLE" : "DOG";
    return {
      ...item,
      engineering: {
        classification,
        highPopularity,
        highMargin,
        popularityBps: engineeringPopularityBps,
        popularityThresholdBps,
        contributionMarginBps: item.metrics.contributionMarginBps,
        marginThresholdBps
      }
    };
  });

  const eligibleIds = new Set(eligible.map((item) => item.id));
  const excluded = items
    .filter((item) => !eligibleIds.has(item.id))
    .map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      reasons: item.completeness.missingInputs.length
        ? item.completeness.missingInputs
        : item.metrics.itemRevenueMinor <= 0
          ? ["positive_item_revenue"]
          : ["complete_profitability"]
    }));
  return {
    thresholds: {
      method: "portfolio_average",
      popularityThresholdBps,
      marginThresholdBps,
      eligibleItemCount: eligible.length,
      eligibleQuantitySoldMicros: totalQuantityMicros,
      eligibleRevenueMinor: totalRevenueMinor,
      eligibleContributionProfitMinor: totalContributionMinor
    },
    items: classified,
    excluded
  };
}

export function getMenuEngineeringMatrix(user, query) {
  const parsed = validate(menuMarginQuerySchema, query);
  const requestedItemCode = parsed.itemCode?.toLowerCase();
  const analysis = getMenuMargins(user, { ...parsed, itemCode: undefined }, { allItems: true });
  const matrix = classifyMenuItems(analysis.items);
  const items = requestedItemCode
    ? matrix.items.filter((item) => item.itemCode.toLowerCase() === requestedItemCode)
    : matrix.items.slice(parsed.offset, parsed.offset + parsed.limit);
  const excluded = requestedItemCode
    ? matrix.excluded.filter((item) => item.itemCode.toLowerCase() === requestedItemCode)
    : matrix.excluded;

  return {
    formulaVersion: menuEngineeringFormulaVersion,
    sourceFormulaVersion: analysis.formulaVersion,
    amountStorage: analysis.amountStorage,
    percentageStorage: analysis.percentageStorage,
    scope: analysis.scope,
    period: analysis.period,
    thresholds: matrix.thresholds,
    pagination: {
      offset: parsed.offset,
      limit: parsed.limit,
      returnedItems: items.length,
      totalItems: matrix.items.length
    },
    items,
    excluded,
    assumptions: [
      "Only items with positive revenue, sales quantity, and complete historical costs are classified.",
      "High popularity means at least the equal-share average among eligible items.",
      "High margin means at least the eligible portfolio's revenue-weighted contribution margin.",
      "Equality is classified as high so boundary results remain deterministic."
    ]
  };
}
