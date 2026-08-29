import { validationError } from "../errors/appError.js";
import { costSimulationSchema, validate } from "../validation/schemas.js";
import { getMenuCosts } from "./menuCostService.js";
import { getMenuMargins, menuQuantityScale } from "./menuMarginService.js";

export const costSimulationFormulaVersion = "4.6-v1";

function toSafeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw validationError(`${label} exceeds the supported integer range.`);
  return number;
}

function roundRatio(numerator, denominator, scale = 1n) {
  if (denominator === 0n) return null;
  const scaled = numerator * scale;
  const sign = scaled < 0n !== denominator < 0n ? -1n : 1n;
  const absoluteNumerator = scaled < 0n ? -scaled : scaled;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  return toSafeInteger(
    sign * ((absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator),
    "Cost simulation value"
  );
}

function modelScenario(scenario, baseline) {
  const proposedDirectCostMinor = scenario.proposedFoodCostMinor + scenario.proposedPackagingMinor;
  const proposedContributionMinor = baseline.sellingPriceMinor - proposedDirectCostMinor - baseline.commissionMinor;
  const projectedContributionMinor = roundRatio(
    BigInt(proposedContributionMinor) * BigInt(baseline.quantitySoldMicros),
    BigInt(menuQuantityScale)
  );
  return {
    name: scenario.name,
    proposedFoodCostMinor: scenario.proposedFoodCostMinor,
    foodCostChangeMinor: scenario.proposedFoodCostMinor - baseline.foodCostMinor,
    proposedPackagingMinor: scenario.proposedPackagingMinor,
    packagingChangeMinor: scenario.proposedPackagingMinor - baseline.packagingMinor,
    proposedDirectCostMinor,
    directCostChangeMinor: proposedDirectCostMinor - baseline.directCostMinor,
    proposedContributionMinor,
    contributionChangePerUnitMinor: proposedContributionMinor - baseline.contributionMinor,
    proposedContributionMarginBps: roundRatio(
      BigInt(proposedContributionMinor),
      BigInt(baseline.sellingPriceMinor),
      10000n
    ),
    projectedContributionMinor,
    contributionImpactMinor: projectedContributionMinor - baseline.modeledContributionMinor
  };
}

export function simulateCosts(user, body) {
  const parsed = validate(costSimulationSchema, body);
  if (parsed.from && parsed.to && new Date(parsed.from) > new Date(parsed.to)) {
    throw validationError("Cost simulation start must not be after its end.");
  }
  const common = { branchId: parsed.branchId, itemCode: parsed.itemCode };
  const costs = getMenuCosts(user, {
    ...common,
    asOf: parsed.to,
    commissionFrom: parsed.from,
    limit: 1,
    offset: 0
  });
  const margins = getMenuMargins(user, {
    ...common,
    from: parsed.from,
    to: parsed.to,
    limit: 1,
    offset: 0
  });
  const costItem = costs.items[0];
  const marginItem = margins.items[0];
  const missingInputs = [
    ...new Set([...costItem.completeness.missingInputs, ...marginItem.completeness.missingInputs])
  ];
  if (!marginItem.completeness.hasSalesData) missingInputs.push("recorded_sales_quantity");
  const ready = costItem.completeness.ready && marginItem.completeness.hasSalesData;
  let baseline = null;
  let scenarios = [];

  if (ready) {
    const modeledContributionMinor = roundRatio(
      BigInt(costItem.metrics.contributionProfitMinor) * BigInt(marginItem.metrics.quantitySoldMicros),
      BigInt(menuQuantityScale)
    );
    baseline = {
      sellingPriceMinor: costItem.metrics.sellingPriceMinor,
      foodCostMinor: costItem.metrics.foodCostMinor,
      packagingMinor: costItem.metrics.packagingMinor,
      directCostMinor: costItem.metrics.foodCostMinor + costItem.metrics.packagingMinor,
      commissionMinor: costItem.metrics.commissionMinor,
      commissionRateBps: costItem.metrics.commissionRateBps,
      contributionMinor: costItem.metrics.contributionProfitMinor,
      contributionMarginBps: costItem.metrics.contributionMarginBps,
      quantitySoldMicros: marginItem.metrics.quantitySoldMicros,
      quantitySold: marginItem.metrics.quantitySold,
      modeledContributionMinor,
      observedContributionProfitMinor: marginItem.metrics.contributionProfitMinor
    };
    scenarios = parsed.scenarios.map((scenario) => modelScenario(scenario, baseline));
  }

  return {
    formulaVersion: costSimulationFormulaVersion,
    sourceFormulaVersions: { costs: costs.formulaVersion, margins: margins.formulaVersion },
    mode: "read_only_simulation",
    amountStorage: "integer_minor_units",
    percentageStorage: "integer_basis_points",
    scope: costs.scope,
    period: margins.period,
    item: { id: costItem.id, itemCode: costItem.itemCode, name: costItem.name, category: costItem.category },
    baseline,
    scenarios,
    completeness: { ready, missingInputs },
    lineage: { costs: costItem.lineage, sales: marginItem.lineage.sales },
    assumptions: [
      "The simulation does not change or persist item costs.",
      "Selling price, recorded quantity, and delivery commission rate remain constant in every scenario.",
      "Proposed food cost can represent a supplier, recipe, portion, or ingredient change supplied by the user.",
      "Projected contribution excludes labor, rent, utilities, marketing, tax, and other operating expenses.",
      "Observed historical contribution remains separate from like-for-like modeled scenario contribution."
    ]
  };
}
