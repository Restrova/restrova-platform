# Menu margin analysis (`4.2-v1`)

Task 4.2 analyzes actual sales lines with the cost that was effective when each sale occurred. The calculation is deterministic domain logic and never asks AI to create or estimate business figures.

## Endpoint

```text
GET /api/menu/margins
```

| Query              | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `branchId`         | Optional branch scope; branch managers are always forced to their own |
| `itemCode`         | Optional exact, case-insensitive item-code filter                     |
| `status`           | `active` (default), `inactive`, or `all`                              |
| `from` / `to`      | Inclusive sales timestamps with explicit timezones                    |
| `limit` / `offset` | Catalog pagination; limit is 1–500                                    |

The popularity denominator covers every item in the requested organization, restaurant, branch, period, and catalog status, even when `itemCode` or pagination narrows the returned page.

## Formulas

All money uses integer minor units. Percentages use basis points, where `10000` is 100%.

| Metric               | Formula                                                           |
| -------------------- | ----------------------------------------------------------------- |
| Item revenue         | Gross sales − discounts − refunds                                 |
| Quantity sold        | Sum of recorded quantities                                        |
| Allocated food cost  | Sum of round(unit food cost at sale time × line quantity)         |
| Gross profit         | Item revenue − allocated food cost                                |
| Gross margin         | Gross profit ÷ positive item revenue                              |
| Contribution profit  | Gross profit − allocated packaging − recorded delivery commission |
| Contribution margin  | Contribution profit ÷ positive item revenue                       |
| Food-cost percentage | Allocated food cost ÷ positive item revenue                       |
| Popularity           | Item quantity ÷ total scoped quantity                             |
| Refund rate          | Refunds ÷ positive gross sales                                    |
| Discount rate        | Discounts ÷ positive gross sales                                  |

Margins and food-cost percentage are `null` when item revenue is zero or negative. Refund and discount rates are `null` when gross sales are zero.

## Historical cost selection

Every sales line independently selects the latest cost effective at or before its sale timestamp:

1. use the branch-specific cost when available;
2. otherwise use the restaurant-wide cost;
3. never apply a future cost early.

This means two sales of the same item can use different historical costs. Unit food and packaging costs are multiplied by the line quantity and rounded to minor units before item totals are added.

Quantity is normalized to the nearest integer millionth (`quantity_micros`, scale `1,000,000`) for reproducible allocation and popularity. The response includes both the authoritative integer quantity and the human-readable decimal value.

## Cost coverage and missing data

Profit is published only when every analyzed sales line has an effective cost record. If one or more lines are missing costs:

- revenue, quantity, commission, popularity, refund rate, and discount rate remain available;
- allocated costs, gross profit, contribution profit, and related ratios are `null`;
- quantity-weighted `costCoverageBps`, line counts, `missingInputs`, and the affected sales-line IDs explain the gap.

An item without sales returns zero recorded activity, unavailable profitability, and `sales_lines` in `missingInputs`. Zero is never presented as evidence of profit.

## Evidence lineage

Each item exposes:

- sales-line and distinct-order counts plus the first and last sale timestamps;
- up to 20 exact order/line references with a truncation flag;
- every effective cost record used, including scope, branch, and effective timestamp;
- exact IDs for sales lines missing costs.

All database queries include authenticated organization and restaurant IDs. Branch managers cannot remove or change their assigned branch scope, and cross-tenant identifiers return `404`. Arabic, Chinese, and English catalog content is returned unchanged.

## Worked example

For gross sales `15000`, discounts `1000`, refunds `500`, historical food cost `6500`, packaging `700`, delivery commission `1000`, and quantity `3` out of scoped quantity `5`:

```text
itemRevenueMinor = 15000 − 1000 − 500 = 13500
grossProfitMinor = 13500 − 6500 = 7000
grossMarginBps = round(7000 / 13500 × 10000) = 5185
contributionProfitMinor = 7000 − 700 − 1000 = 5300
contributionMarginBps = round(5300 / 13500 × 10000) = 3926
foodCostPercentageBps = round(6500 / 13500 × 10000) = 4815
popularityBps = round(3 / 5 × 10000) = 6000
refundRateBps = round(500 / 15000 × 10000) = 333
discountRateBps = round(1000 / 15000 × 10000) = 667
```
