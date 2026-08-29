import { validationError } from "../errors/appError.js";
import { priceSimulationSchema, validate } from "../validation/schemas.js";
import { getMenuCosts } from "./menuCostService.js";
import { getMenuMargins, menuQuantityScale } from "./menuMarginService.js";

export const priceSimulationFormulaVersion = "4.5-v1";

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
    "Price simulation value"
  );
}

function projectedScenario({ demandChangeBps, quantityMicros, currentUnitContribution, proposedUnitContribution }) {
  const projectedQuantityMicros = roundRatio(BigInt(quantityMicros) * BigInt(10000 + demandChangeBps), 10000n);
  const currentTotal = roundRatio(BigInt(currentUnitContribution) * BigInt(quantityMicros), BigInt(menuQuantityScale));
  const projectedTotal = roundRatio(
    BigInt(proposedUnitContribution) * BigInt(projectedQuantityMicros),
    BigInt(menuQuantityScale)
  );
  return {
    demandChangeBps,
    projectedQuantitySoldMicros: projectedQuantityMicros,
    projectedQuantitySold: projectedQuantityMicros / menuQuantityScale,
    modeledCurrentContributionMinor: currentTotal,
    projectedContributionMinor: projectedTotal,
    contributionImpactMinor: projectedTotal - currentTotal
  };
}

export function simulatePrice(user, body) {
  const parsed = validate(priceSimulationSchema, body);
  if (parsed.from && parsed.to && new Date(parsed.from) > new Date(parsed.to)) {
    throw validationError("Price simulation start must not be after its end.");
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
  let unitEconomics = null;
  let scenarios = [];

  if (ready) {
    const proposedCommissionMinor = roundRatio(
      BigInt(parsed.proposedPriceMinor) * BigInt(costItem.metrics.commissionRateBps),
      10000n
    );
    const proposedContributionMinor =
      parsed.proposedPriceMinor -
      costItem.metrics.foodCostMinor -
      costItem.metrics.packagingMinor -
      proposedCommissionMinor;
    const proposedMarginBps = roundRatio(BigInt(proposedContributionMinor), BigInt(parsed.proposedPriceMinor), 10000n);
    unitEconomics = {
      currentPriceMinor: costItem.metrics.sellingPriceMinor,
      proposedPriceMinor: parsed.proposedPriceMinor,
      priceChangeMinor: parsed.proposedPriceMinor - costItem.metrics.sellingPriceMinor,
      priceChangeBps: roundRatio(
        BigInt(parsed.proposedPriceMinor - costItem.metrics.sellingPriceMinor),
        BigInt(costItem.metrics.sellingPriceMinor),
        10000n
      ),
      foodCostMinor: costItem.metrics.foodCostMinor,
      packagingMinor: costItem.metrics.packagingMinor,
      commissionRateBps: costItem.metrics.commissionRateBps,
      currentCommissionMinor: costItem.metrics.commissionMinor,
      proposedCommissionMinor,
      currentContributionMinor: costItem.metrics.contributionProfitMinor,
      proposedContributionMinor,
      contributionChangeMinor: proposedContributionMinor - costItem.metrics.contributionProfitMinor,
      currentContributionMarginBps: costItem.metrics.contributionMarginBps,
      proposedContributionMarginBps: proposedMarginBps
    };
    scenarios = [...new Set(parsed.demandChangesBps)]
      .sort((a, b) => a - b)
      .map((demandChangeBps) =>
        projectedScenario({
          demandChangeBps,
          quantityMicros: marginItem.metrics.quantitySoldMicros,
          currentUnitContribution: costItem.metrics.contributionProfitMinor,
          proposedUnitContribution: proposedContributionMinor
        })
      );
  }

  return {
    formulaVersion: priceSimulationFormulaVersion,
    sourceFormulaVersions: { costs: costs.formulaVersion, margins: margins.formulaVersion },
    mode: "read_only_simulation",
    amountStorage: "integer_minor_units",
    percentageStorage: "integer_basis_points",
    scope: costs.scope,
    period: margins.period,
    item: { id: costItem.id, itemCode: costItem.itemCode, name: costItem.name, category: costItem.category },
    baseline: {
      quantitySoldMicros: marginItem.metrics.quantitySoldMicros,
      quantitySold: marginItem.metrics.quantitySold,
      observedContributionProfitMinor: marginItem.metrics.contributionProfitMinor
    },
    unitEconomics,
    scenarios,
    completeness: { ready, missingInputs },
    lineage: { costs: costItem.lineage, sales: marginItem.lineage.sales },
    assumptions: [
      "The simulation does not change or persist the catalog price.",
      "Food and packaging cost per unit remain constant in every scenario.",
      "The recorded delivery commission rate remains constant and commission changes with proposed price.",
      "Demand sensitivity changes recorded quantity only; it does not claim a causal demand response.",
      "Projected contribution excludes labor, rent, utilities, marketing, tax, and other operating expenses."
    ]
  };
}
