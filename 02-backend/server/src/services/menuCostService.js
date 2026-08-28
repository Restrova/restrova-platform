import { notFound, validationError } from "../errors/appError.js";
import * as menuCostRepository from "../repositories/menuCostRepository.js";
import { menuCostQuerySchema, validate } from "../validation/schemas.js";
import { assertBranchAccess } from "./branchService.js";

export const menuCostFormulaVersion = "4.1-v1";

export const menuCostAssumptions = Object.freeze([
  "The latest effective cost at or before asOf is used; a branch cost overrides the restaurant cost.",
  "Delivery commission is the observed commission-to-gross-sales ratio for recorded delivery lines in scope.",
  "Commission and contribution profit remain unavailable without positive delivery gross-sales evidence.",
  "Contribution profit excludes labor, rent, utilities, marketing, tax, and other operating expenses."
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
    "Menu cost ratio"
  );
}

function resolveBranchId(user, requestedBranchId) {
  if (user.role === "branch_manager") {
    if (requestedBranchId && requestedBranchId !== user.branch_id) throw notFound("Branch not found");
    return user.branch_id;
  }
  if (requestedBranchId && !assertBranchAccess(user, requestedBranchId)) throw notFound("Branch not found");
  return requestedBranchId || null;
}

function firstCostByItem(rows) {
  const costs = new Map();
  for (const row of rows) if (!costs.has(row.catalog_item_id)) costs.set(row.catalog_item_id, row);
  return costs;
}

function commissionByItem(rows) {
  return new Map(rows.map((row) => [row.catalog_item_id, row]));
}

function calculateItem(item, cost, commissionEvidence) {
  const sellingPrice = BigInt(item.selling_price_minor);
  const hasCostRecord = Boolean(cost);
  const grossSales = BigInt(commissionEvidence?.gross_sales_minor || 0);
  const recordedCommission = BigInt(commissionEvidence?.delivery_commission_minor || 0);
  const hasCommissionEvidence = Boolean(commissionEvidence && grossSales > 0n);
  const commissionMinor = hasCommissionEvidence ? roundRatio(sellingPrice * recordedCommission, grossSales) : null;
  const foodCostMinor = hasCostRecord ? toSafeInteger(cost.direct_food_cost_minor, "Food cost") : null;
  const packagingMinor = hasCostRecord ? toSafeInteger(cost.packaging_cost_minor, "Packaging cost") : null;
  const contributionProfitMinor =
    foodCostMinor !== null && packagingMinor !== null && commissionMinor !== null
      ? toSafeInteger(
          sellingPrice - BigInt(foodCostMinor) - BigInt(packagingMinor) - BigInt(commissionMinor),
          "Contribution profit"
        )
      : null;

  const missingInputs = [];
  if (!hasCostRecord) missingInputs.push("cost_record");
  if (!commissionEvidence) missingInputs.push("delivery_commission_evidence");
  else if (!hasCommissionEvidence) missingInputs.push("positive_delivery_gross_sales");

  return {
    id: item.id,
    itemCode: item.item_code,
    name: item.name,
    category: item.category,
    active: Boolean(item.active),
    metrics: {
      sellingPriceMinor: toSafeInteger(sellingPrice, "Selling price"),
      foodCostMinor,
      packagingMinor,
      commissionMinor,
      commissionRateBps: hasCommissionEvidence ? roundRatio(recordedCommission, grossSales, 10000n) : null,
      contributionProfitMinor,
      contributionMarginBps:
        contributionProfitMinor !== null && sellingPrice > 0n
          ? roundRatio(BigInt(contributionProfitMinor), sellingPrice, 10000n)
          : null
    },
    completeness: {
      ready: missingInputs.length === 0,
      hasCostRecord,
      hasCommissionEvidence,
      missingInputs
    },
    lineage: {
      sellingPrice: {
        sourceType: "catalog_item",
        sourceId: item.id,
        itemCode: item.item_code,
        updatedAt: item.updated_at
      },
      costs: cost
        ? {
            sourceType: "item_cost",
            sourceId: cost.id,
            scope: cost.branch_id ? "branch" : "restaurant",
            branchId: cost.branch_id,
            effectiveFrom: cost.effective_from,
            recordedAt: cost.created_at
          }
        : null,
      commission: commissionEvidence
        ? {
            sourceType: "sales_lines",
            channel: "delivery",
            lineCount: commissionEvidence.line_count,
            firstLineId: commissionEvidence.first_line_id,
            lastLineId: commissionEvidence.last_line_id,
            firstSaleAt: commissionEvidence.first_sale_at,
            lastSaleAt: commissionEvidence.last_sale_at,
            grossSalesMinor: toSafeInteger(commissionEvidence.gross_sales_minor, "Commission gross sales"),
            recordedCommissionMinor: toSafeInteger(commissionEvidence.delivery_commission_minor, "Recorded commission")
          }
        : null
    }
  };
}

export function getMenuCosts(user, query) {
  const parsed = validate(menuCostQuerySchema, query);
  const branchId = resolveBranchId(user, parsed.branchId);
  const asOf = parsed.asOf || new Date().toISOString();
  if (parsed.commissionFrom && new Date(parsed.commissionFrom) > new Date(asOf)) {
    throw validationError("Commission observation start must not be after asOf.");
  }

  const filters = { ...parsed, branchId, asOf };
  const totalItems = menuCostRepository.countCatalogItems(user, filters);
  const catalogItems = menuCostRepository.listCatalogItems(user, filters);
  if (parsed.itemCode && !catalogItems.length) throw notFound("Menu item not found");

  const itemIds = catalogItems.map((item) => item.id);
  const costs = firstCostByItem(menuCostRepository.listApplicableCosts(user, itemIds, filters));
  const commissions = commissionByItem(menuCostRepository.listDeliveryCommissionEvidence(user, itemIds, filters));
  const items = catalogItems.map((item) => calculateItem(item, costs.get(item.id), commissions.get(item.id)));

  return {
    formulaVersion: menuCostFormulaVersion,
    amountStorage: "integer_minor_units",
    percentageStorage: "integer_basis_points",
    scope: {
      organizationId: user.organization_id,
      restaurantId: user.restaurant_id,
      branchId,
      currencyCode: user.currency.toUpperCase()
    },
    observation: {
      asOf,
      commissionFrom: parsed.commissionFrom || null,
      commissionChannel: "delivery"
    },
    pagination: {
      offset: parsed.offset,
      limit: parsed.limit,
      returnedItems: items.length,
      totalItems
    },
    items,
    assumptions: menuCostAssumptions
  };
}
