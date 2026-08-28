# Financial metric reference

This reference defines calculation formula `3.7-v1`. All money fields are signed integer minor units in the authenticated organization's currency. All margin fields are signed integer basis points, where `10000` means 100%.

## Ledger inputs

Ledger amounts are non-negative. Whether an amount adds to revenue, deducts from revenue, or adds to cost is determined by its category.

| Category                           | Meaning                                               | Formula role                              |
| ---------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| `sales`                            | Gross sale captured under one source reference        | Adds to gross sales and identifies orders |
| `discounts`                        | Discount granted against sales                        | Deducts from revenue                      |
| `refunds`                          | Refunded sale value                                   | Deducts from revenue                      |
| `food_costs`                       | Direct ingredient or food cost                        | COGS                                      |
| `packaging`                        | Packaging directly associated with orders             | Contribution cost                         |
| `delivery_commissions`             | Delivery marketplace or channel commission            | Contribution cost                         |
| `labor`                            | Recorded labor expense                                | Operating expense                         |
| `rent`                             | Recorded rent expense                                 | Operating expense                         |
| `utilities`                        | Recorded utility expense                              | Operating expense                         |
| `marketing`                        | Recorded marketing expense                            | Operating expense                         |
| `miscellaneous_operating_expenses` | Other recorded operating expense not classified above | Operating expense                         |

`tax` is not a supported category. See [known assumptions](assumptions.md).

## Revenue and profit

| Response field            | Definition                              | Formula                                                                 |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `grossSalesMinor`         | Sales before deductions                 | sum(`sales`)                                                            |
| `discountsMinor`          | Recorded discounts                      | sum(`discounts`)                                                        |
| `refundsMinor`            | Recorded refunds                        | sum(`refunds`)                                                          |
| `revenueMinor`            | Net revenue after recorded deductions   | gross sales − discounts − refunds                                       |
| `cogsMinor`               | Direct food cost                        | sum(`food_costs`)                                                       |
| `grossProfitMinor`        | Revenue after direct food cost          | revenue − COGS                                                          |
| `contributionProfitMinor` | Profit after direct order-channel costs | gross profit − packaging − delivery commissions                         |
| `operatingExpensesMinor`  | Recorded operating expenses             | labor + rent + utilities + marketing + miscellaneous operating expenses |
| `operatingProfitMinor`    | Profit after modeled operating expenses | contribution profit − operating expenses                                |
| `netProfitMinor`          | Current modeled net profit              | operating profit                                                        |
| `totalCostsMinor`         | All modeled costs                       | COGS + packaging + delivery commissions + operating expenses            |

`netProfitMinor` is not after-tax profit. It equals operating profit until tax, interest, depreciation, and amortization have versioned ledger categories and formulas.

## Margins and cost ratios

| Field or UI metric      | Formula                                      | Availability                   |
| ----------------------- | -------------------------------------------- | ------------------------------ |
| `grossMarginBps`        | round(gross profit × 10000 ÷ revenue)        | `null` when revenue ≤ 0        |
| `contributionMarginBps` | round(contribution profit × 10000 ÷ revenue) | `null` when revenue ≤ 0        |
| `netMarginBps`          | round(net profit × 10000 ÷ revenue)          | `null` when revenue ≤ 0        |
| Food cost %             | round(food cost × 10000 ÷ revenue)           | em dash in UI when revenue ≤ 0 |
| Labor cost %            | round(labor cost × 10000 ÷ revenue)          | em dash in UI when revenue ≤ 0 |

Ratios round to the nearest basis point, half away from zero. A negative profit with positive revenue therefore produces a negative margin. A zero or negative revenue denominator produces `null`, not a misleading percentage.

## Orders and per-order values

| Response field           | Definition                                | Formula                                |
| ------------------------ | ----------------------------------------- | -------------------------------------- |
| `orderCount`             | Distinct sales source references in scope | count distinct scoped sales references |
| `averageOrderValueMinor` | Net revenue per recorded order            | round(revenue ÷ order count)           |
| `costPerOrderMinor`      | Modeled costs per recorded order          | round(total costs ÷ order count)       |

Distinct identity includes restaurant and branch scope, so identical external order references in two branches remain two orders. Per-order values are `null` when order count is zero and round to the nearest minor unit, half away from zero.

## Rounding and numeric limits

- Calculations use integer and `BigInt` arithmetic. Floating-point money is never introduced.
- Input amounts must be safe, non-negative JavaScript integers.
- Final money outputs must remain within the safe integer range or the request fails validation.
- The web client converts minor units only for display using the ISO currency exponent: CNY uses 2 digits, JPY 0, and BHD 3.
- Currency conversion and exchange-rate gains or losses are not performed.

## Missing and incomplete data

`completeness.hasData` states whether any ledger fact exists in scope. `presentCategories`, `missingCategories`, and `entryCount` describe coverage. Additive metrics may be zero when no fact is present, but margins and per-order ratios remain `null` when their denominators are unavailable.

Consumers must show the completeness state with the metric. They must not convert a missing category into a claim that the real-world cost is zero.
