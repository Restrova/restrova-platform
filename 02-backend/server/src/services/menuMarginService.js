import { notFound, validationError } from "../errors/appError.js";
import * as menuMarginRepository from "../repositories/menuMarginRepository.js";
import { menuMarginQuerySchema, validate } from "../validation/schemas.js";
import { assertBranchAccess } from "./branchService.js";

export const menuMarginFormulaVersion = "4.2-v1";
export const menuQuantityScale = 1_000_000;

export const menuMarginAssumptions = Object.freeze([
  "Item revenue equals gross sales minus recorded discounts and refunds.",
  "Each sales line uses the latest effective branch cost at sale time, falling back to restaurant cost.",
  "Profit metrics are unavailable when any sales line lacks an effective cost record.",
  "Recorded quantities are normalized to the nearest one-millionth for deterministic allocation.",
  "Popularity is the item's quantity share across the full requested scope, period, and catalog status.",
  "Refund and discount rates use recorded gross sales as their denominator."
]);

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
    "Menu margin ratio"
  );
}

function quantityMicros(value) {
  const quantity = Number(value);
  const scaled = Math.round(quantity * menuQuantityScale);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(scaled)) {
    throw validationError("Sales quantity exceeds the supported precision or range.");
  }
  return BigInt(scaled);
}

function quantityFromMicros(value) {
  return toSafeInteger(value, "Quantity") / menuQuantityScale;
}

function resolveBranchId(user, requestedBranchId) {
  if (user.role === "branch_manager") {
    if (requestedBranchId && requestedBranchId !== user.branch_id) throw notFound("Branch not found");
    return user.branch_id;
  }
  if (requestedBranchId && !assertBranchAccess(user, requestedBranchId)) throw notFound("Branch not found");
  return requestedBranchId || null;
}

function costHistoryByScope(rows) {
  const history = new Map();
  for (const row of rows) {
    const key = `${row.catalog_item_id}:${row.branch_id || "restaurant"}`;
    const records = history.get(key) || [];
    records.push(row);
    history.set(key, records);
  }
  return history;
}

function effectiveCost(history, line) {
  const saleTime = Date.parse(line.created_at);
  const branch = history.get(`${line.catalog_item_id}:${line.branch_id}`) || [];
  const restaurant = history.get(`${line.catalog_item_id}:restaurant`) || [];
  return (
    branch.find((cost) => Date.parse(cost.effective_from) <= saleTime) ||
    restaurant.find((cost) => Date.parse(cost.effective_from) <= saleTime) ||
    null
  );
}

function groupLines(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const lines = grouped.get(row.catalog_item_id) || [];
    lines.push(row);
    grouped.set(row.catalog_item_id, lines);
  }
  return grouped;
}

function calculateItem(item, lines, history, totalScopeQuantity) {
  let grossSales = 0n;
  let discounts = 0n;
  let refunds = 0n;
  let commission = 0n;
  let quantity = 0n;
  let costedQuantity = 0n;
  let foodCost = 0n;
  let packaging = 0n;
  const missingCostLineIds = [];
  const usedCosts = new Map();
  const orderIds = new Set();

  for (const line of lines) {
    const lineQuantity = quantityMicros(line.quantity);
    grossSales += BigInt(line.gross_sales_minor);
    discounts += BigInt(line.discount_minor);
    refunds += BigInt(line.refund_amount_minor);
    commission += BigInt(line.delivery_commission_minor);
    quantity += lineQuantity;
    orderIds.add(`${line.branch_id}:${line.external_order_id}`);

    const cost = effectiveCost(history, line);
    if (!cost) {
      missingCostLineIds.push(line.id);
      continue;
    }
    costedQuantity += lineQuantity;
    foodCost += BigInt(roundRatio(BigInt(cost.direct_food_cost_minor) * lineQuantity, BigInt(menuQuantityScale)));
    packaging += BigInt(roundRatio(BigInt(cost.packaging_cost_minor) * lineQuantity, BigInt(menuQuantityScale)));
    usedCosts.set(cost.id, cost);
  }

  const hasSalesData = lines.length > 0;
  const hasCompleteCosts = hasSalesData && missingCostLineIds.length === 0;
  const revenue = grossSales - discounts - refunds;
  const grossProfit = hasCompleteCosts ? revenue - foodCost : null;
  const contributionProfit = grossProfit === null ? null : grossProfit - packaging - commission;
  const positiveRevenue = revenue > 0n;
  const positiveGrossSales = grossSales > 0n;
  const missingInputs = [];
  if (!hasSalesData) missingInputs.push("sales_lines");
  if (hasSalesData && !hasCompleteCosts) missingInputs.push("effective_cost_records");
  const references = lines.slice(0, 20).map((line) => ({
    sourceId: line.id,
    branchId: line.branch_id,
    externalOrderId: line.external_order_id,
    externalLineId: line.external_line_id
  }));

  return {
    id: item.id,
    itemCode: item.item_code,
    name: item.name,
    category: item.category,
    active: Boolean(item.active),
    metrics: {
      grossSalesMinor: toSafeInteger(grossSales, "Gross sales"),
      discountsMinor: toSafeInteger(discounts, "Discounts"),
      refundsMinor: toSafeInteger(refunds, "Refunds"),
      itemRevenueMinor: toSafeInteger(revenue, "Item revenue"),
      quantitySold: quantityFromMicros(quantity),
      quantitySoldMicros: toSafeInteger(quantity, "Quantity sold"),
      allocatedFoodCostMinor: hasCompleteCosts ? toSafeInteger(foodCost, "Allocated food cost") : null,
      allocatedPackagingMinor: hasCompleteCosts ? toSafeInteger(packaging, "Allocated packaging") : null,
      deliveryCommissionMinor: toSafeInteger(commission, "Delivery commission"),
      grossProfitMinor: grossProfit === null ? null : toSafeInteger(grossProfit, "Gross profit"),
      grossMarginBps: grossProfit !== null && positiveRevenue ? roundRatio(grossProfit, revenue, 10000n) : null,
      contributionProfitMinor:
        contributionProfit === null ? null : toSafeInteger(contributionProfit, "Contribution profit"),
      contributionMarginBps:
        contributionProfit !== null && positiveRevenue ? roundRatio(contributionProfit, revenue, 10000n) : null,
      foodCostPercentageBps: hasCompleteCosts && positiveRevenue ? roundRatio(foodCost, revenue, 10000n) : null,
      popularityBps: totalScopeQuantity > 0n ? roundRatio(quantity, totalScopeQuantity, 10000n) : null,
      refundRateBps: positiveGrossSales ? roundRatio(refunds, grossSales, 10000n) : null,
      discountRateBps: positiveGrossSales ? roundRatio(discounts, grossSales, 10000n) : null
    },
    completeness: {
      ready: hasSalesData && hasCompleteCosts,
      hasSalesData,
      hasCompleteCosts,
      salesLineCount: lines.length,
      costedSalesLineCount: lines.length - missingCostLineIds.length,
      missingCostLineCount: missingCostLineIds.length,
      costCoverageBps: quantity > 0n ? roundRatio(costedQuantity, quantity, 10000n) : null,
      missingInputs
    },
    lineage: {
      sales: hasSalesData
        ? {
            sourceType: "sales_lines",
            lineCount: lines.length,
            orderCount: orderIds.size,
            firstSaleAt: lines[0].created_at,
            lastSaleAt: lines.at(-1).created_at,
            references,
            referencesTruncated: lines.length > references.length
          }
        : null,
      costs: [...usedCosts.values()].map((cost) => ({
        sourceType: "item_cost",
        sourceId: cost.id,
        scope: cost.branch_id ? "branch" : "restaurant",
        branchId: cost.branch_id,
        effectiveFrom: cost.effective_from,
        recordedAt: cost.created_at
      })),
      missingCostLineIds
    }
  };
}

export function getMenuMargins(user, query) {
  const parsed = validate(menuMarginQuerySchema, query);
  const branchId = resolveBranchId(user, parsed.branchId);
  if (parsed.from && parsed.to && new Date(parsed.from) > new Date(parsed.to)) {
    throw validationError("Menu analysis start must not be after its end.");
  }

  const filters = { ...parsed, branchId };
  const totalItems = menuMarginRepository.countCatalogItems(user, filters);
  const catalogItems = menuMarginRepository.listCatalogItems(user, filters);
  if (parsed.itemCode && !catalogItems.length) throw notFound("Menu item not found");

  const itemIds = catalogItems.map((item) => item.id);
  const lines = menuMarginRepository.listSalesLines(user, itemIds, filters);
  const groupedLines = groupLines(lines);
  const history = costHistoryByScope(menuMarginRepository.listCostHistory(user, itemIds, filters));
  const totalScopeQuantity = menuMarginRepository
    .listScopedQuantities(user, filters)
    .reduce((total, row) => total + quantityMicros(row.quantity), 0n);
  const items = catalogItems.map((item) =>
    calculateItem(item, groupedLines.get(item.id) || [], history, totalScopeQuantity)
  );

  return {
    formulaVersion: menuMarginFormulaVersion,
    amountStorage: "integer_minor_units",
    percentageStorage: "integer_basis_points",
    quantityStorage: { unit: "quantity_micros", scale: menuQuantityScale },
    scope: {
      organizationId: user.organization_id,
      restaurantId: user.restaurant_id,
      branchId,
      currencyCode: user.currency.toUpperCase()
    },
    period: { from: parsed.from || null, to: parsed.to || null },
    population: {
      totalQuantitySold: quantityFromMicros(totalScopeQuantity),
      totalQuantitySoldMicros: toSafeInteger(totalScopeQuantity, "Total quantity sold")
    },
    pagination: {
      offset: parsed.offset,
      limit: parsed.limit,
      returnedItems: items.length,
      totalItems
    },
    items,
    assumptions: menuMarginAssumptions
  };
}
