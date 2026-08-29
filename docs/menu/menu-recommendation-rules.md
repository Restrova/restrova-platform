# Menu recommendation rules (`4.7-v1`)

`GET /api/menu/recommendations` converts the recorded menu-engineering matrix into deterministic proposals. It does not modify prices, recipes, portions, promotions, bundles, or item availability.

## Rule table

| Matrix class | Proposed action                                           |
| ------------ | --------------------------------------------------------- |
| STAR         | `promote_item`                                            |
| PLOWHORSE    | `raise_price`, `reduce_ingredient_cost`, `change_portion` |
| PUZZLE       | `bundle_item`                                             |
| DOG          | `consider_removal`                                        |

Each proposal includes the recorded popularity, margin, revenue, volume, contribution profit, cost coverage, sales-line count, and the original sales/cost lineage. Names remain unchanged, including Arabic and Chinese text.

## Evidence and uncertainty

The endpoint never creates a projected impact. `projectedImpact` remains `null` until an owner supplies an explicit proposal to the price or cost simulation API. Fewer than five recorded sales lines lowers confidence to `medium` and publishes the limitation instead of hiding it.

## Approval and measurement

All results start at `proposed`, require the `owner` role for acceptance, and declare that no execution occurred. The published lifecycle is `proposed`, `accepted` or `rejected`, `in_progress`, then `completed` or `cancelled`. This endpoint only produces the proposal; a later command workflow must persist and audit any transition or external change.

If a proposal is accepted and implemented through an authorized workflow, compare item revenue, quantity, contribution profit, and contribution margin against the original period after 7 and 14 days.

Tenant, restaurant, and branch scope are resolved from the authenticated session using the same isolation rules as the engineering matrix.
