# Menu cost engine (`4.1-v1`)

Task 4.1 turns the imported catalog, effective-dated item costs, and delivery sales into auditable unit economics. It does not call an AI model and it does not write or change business data.

## Endpoint

```text
GET /api/menu/costs
```

| Query              | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `branchId`         | Optional branch scope; branch managers are always forced to their own |
| `itemCode`         | Optional exact, case-insensitive item-code filter                     |
| `status`           | `active` (default), `inactive`, or `all`                              |
| `asOf`             | Effective-cost and sales cutoff with an explicit timezone             |
| `commissionFrom`   | Optional start of the delivery commission observation window          |
| `limit` / `offset` | Pagination; limit is 1–500                                            |

When `asOf` is omitted, the response records the server timestamp it used. `commissionFrom` must not be later than `asOf`.

## Inputs and precedence

| Output                  | Authoritative input                                          |
| ----------------------- | ------------------------------------------------------------ |
| Selling price           | `catalog_items.selling_price_minor`                          |
| Food cost               | Latest applicable `item_costs.direct_food_cost_minor`        |
| Packaging               | Same effective `item_costs.packaging_cost_minor` record      |
| Commission rate         | Recorded delivery commission ÷ recorded delivery gross sales |
| Commission per item     | Selling price × observed commission rate                     |
| Contribution profit     | Selling price − food cost − packaging − commission           |
| Contribution margin bps | Contribution profit ÷ selling price × 10,000                 |

For a branch request, the latest branch cost effective at or before `asOf` wins. If none exists, the latest restaurant-wide cost is used. A future cost is never applied early. A restaurant-level request uses restaurant-wide cost records only.

Commission evidence includes only `delivery` sales lines in the authenticated restaurant and requested branch, up to `asOf` and optionally from `commissionFrom`. Zero recorded commission with positive delivery gross sales is valid evidence for a zero rate. No lines, or lines without positive gross sales, leave commission and contribution unavailable.

## Deterministic rounding example

Assume a selling price of `5000`, food cost `2400`, packaging `150`, recorded delivery gross sales `15000`, and recorded commission `2000`, all in minor units.

```text
commissionRateBps = round(2000 / 15000 × 10000) = 1333
commissionMinor = round(5000 × 2000 / 15000) = 667
contributionProfitMinor = 5000 − 2400 − 150 − 667 = 1783
contributionMarginBps = round(1783 / 5000 × 10000) = 3566
```

Ratios use integer half-up rounding. Negative contribution is allowed and remains visible. A zero selling price makes the contribution margin unavailable.

## Completeness and lineage

Each item returns:

- `completeness.ready`, evidence flags, and explicit `missingInputs`;
- the catalog record ID and update time used for price;
- the cost record ID, scope, branch, and effective timestamp;
- delivery line count, ID range, observed period, gross sales, and commission totals.

Possible missing inputs are `cost_record`, `delivery_commission_evidence`, and `positive_delivery_gross_sales`. Missing values are `null`, not invented zeroes.

## Authorization and localization

- Owners and viewers may read restaurant or permitted branch scopes.
- Branch managers are automatically restricted to their assigned branch; another or foreign branch returns `404`.
- Catalog and evidence queries always include authenticated organization and restaurant IDs.
- Item codes are matched without case sensitivity; names and categories preserve UTF-8 Arabic, Chinese, and English content.

## Known assumptions

- Observed delivery commission is treated as the best documented rate for the requested window; it is not a supplier contract forecast.
- Contribution profit excludes labor, rent, utilities, marketing, taxes, and other operating expenses.
- Food and packaging values are unit costs from the selected effective cost record.
- Currency conversion is never implicit; the response currency comes from the authenticated organization.
