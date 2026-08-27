function goldenEntry(category, amountMinor, sourceReference, branchId = 1) {
  return {
    organization_id: 1,
    restaurant_id: 1,
    branch_id: branchId,
    category,
    amount_minor: amountMinor,
    source_type: "import",
    source_reference: sourceReference
  };
}

export const financialAccuracyGoldenCases = [
  {
    name: "ratio rounding uses nearest basis point half away from zero",
    entries: [goldenEntry("sales", 6, "ROUND-SALE"), goldenEntry("food_costs", 5, "ROUND-FOOD")],
    expectedMetrics: {
      grossSalesMinor: 6,
      discountsMinor: 0,
      refundsMinor: 0,
      revenueMinor: 6,
      cogsMinor: 5,
      grossProfitMinor: 1,
      grossMarginBps: 1667,
      contributionProfitMinor: 1,
      contributionMarginBps: 1667,
      operatingExpensesMinor: 0,
      operatingProfitMinor: 1,
      netProfitMinor: 1,
      netMarginBps: 1667,
      orderCount: 1,
      averageOrderValueMinor: 6,
      totalCostsMinor: 5,
      costPerOrderMinor: 5
    }
  },
  {
    name: "per-order halves round away from zero in integer minor units",
    entries: [
      goldenEntry("sales", 1, "HALF-SALE-A"),
      goldenEntry("sales", 0, "HALF-SALE-B"),
      goldenEntry("food_costs", 1, "HALF-FOOD")
    ],
    expectedMetrics: {
      grossSalesMinor: 1,
      discountsMinor: 0,
      refundsMinor: 0,
      revenueMinor: 1,
      cogsMinor: 1,
      grossProfitMinor: 0,
      grossMarginBps: 0,
      contributionProfitMinor: 0,
      contributionMarginBps: 0,
      operatingExpensesMinor: 0,
      operatingProfitMinor: 0,
      netProfitMinor: 0,
      netMarginBps: 0,
      orderCount: 2,
      averageOrderValueMinor: 1,
      totalCostsMinor: 1,
      costPerOrderMinor: 1
    }
  },
  {
    name: "discounts and refunds can produce deterministic negative financial results",
    entries: [
      goldenEntry("sales", 1000, "NEGATIVE-SALE"),
      goldenEntry("discounts", 600, "NEGATIVE-DISCOUNT"),
      goldenEntry("refunds", 500, "NEGATIVE-REFUND"),
      goldenEntry("food_costs", 200, "NEGATIVE-FOOD"),
      goldenEntry("packaging", 100, "NEGATIVE-PACKAGING"),
      goldenEntry("labor", 50, "NEGATIVE-LABOR")
    ],
    expectedMetrics: {
      grossSalesMinor: 1000,
      discountsMinor: 600,
      refundsMinor: 500,
      revenueMinor: -100,
      cogsMinor: 200,
      grossProfitMinor: -300,
      grossMarginBps: null,
      contributionProfitMinor: -400,
      contributionMarginBps: null,
      operatingExpensesMinor: 50,
      operatingProfitMinor: -450,
      netProfitMinor: -450,
      netMarginBps: null,
      orderCount: 1,
      averageOrderValueMinor: -100,
      totalCostsMinor: 350,
      costPerOrderMinor: 350
    }
  }
];
