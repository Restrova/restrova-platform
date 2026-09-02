# Branch ranking (`5.2-v1`)

`GET /api/branches/rankings` returns five deterministic rankings for the authorized branch cohort. It uses the [branch performance model](branch-performance-model.md) (`5.1-v1`) and financial formulas (`3.7-v1`). This is a read-only backend capability for Task 5.2; the operational KPI dashboard is a separate roadmap task.

## Request and access

The query is the same as `/api/branches/performance`: `scope`, `restaurantId`, `branchId`, `period`, `comparison`, `anchor`, `from`, and `to`.

```text
GET /api/branches/rankings?scope=restaurant&period=month&comparison=previous_period&anchor=2026-08-26T12:00:00Z
```

- Owners can rank branches within a restaurant or their organization, or inspect one branch.
- Viewers can inspect only their restaurant and its branches.
- Branch managers default to their assigned branch and cannot widen the scope. They receive no peer counts, rankings, excluded entries, names, or lineage from other branches.
- Missing authentication returns 401; unauthorized scope widening returns 403; inaccessible branches/restaurants return 404; invalid filters return 400.
- Period boundaries and comparisons use the authenticated organization's timezone. Currency also comes from the authenticated organization; no currency conversion occurs.
- Supply an explicit `anchor`, or custom `from`/`to`, for reproducible periods. Changing underlying ledger data can change the results.

Authorization resolves the cohort before any ranking, including before computing leader and exclusion counts.

## Ranking definitions

| Ranking           | Metric                                                  | Order      | Required records                                                            |
| ----------------- | ------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `bestPerforming`  | Modeled net profit, minor units                         | Descending | Every modeled ledger category, current period                               |
| `worstPerforming` | Modeled net profit, minor units                         | Ascending  | Every modeled ledger category, current period                               |
| `fastestGrowing`  | Net revenue percentage change, integer basis points     | Descending | Sales, discounts, refunds in both periods; positive comparison revenue      |
| `highestMargin`   | Net profit / positive net revenue, integer basis points | Descending | Every modeled ledger category, current period; positive current net revenue |
| `highestFoodCost` | Recorded food-cost amount (`cogsMinor`), minor units    | Descending | Food-cost records, current period                                           |

Performance is explicitly net profit, not an unexplained weighted score. Highest food cost means the largest recorded amount; it does not establish the highest cost percentage, waste, or inefficiency. If all profitable branches have losses, the best-performing result means the smallest recorded loss.

Net profit follows the current financial engine: operating profit until taxes, financing, depreciation and amortization are modeled. Unallocated restaurant-level costs are excluded from branch rankings and are never silently distributed. Consult the financial report for unallocated costs and reconciliation.

### Missing data and explicit zeroes

Profit and margin require category coverage for `sales`, `discounts`, `refunds`, `food_costs`, `packaging`, `delivery_commissions`, `labor`, `rent`, `utilities`, `marketing`, and `miscellaneous_operating_expenses`. An absent category cannot prove that its amount was zero. A recorded, evidenced zero is valid; do not create artificial zero entries just to make a branch eligible.

Eligibility is metric-specific: a branch with food costs and missing labor may appear in the food-cost ranking while being excluded from profit and margin. Empty branches never become zero-profit leaders. Category coverage establishes that categories were recorded, not that every transaction or day was captured; that limitation is included in `assumptions`.

The current engine's `branches[].metrics` contains recorded totals and its original completeness metadata. Consumers must use `rankingMetrics` or `rankings` for eligible ranking values. Unavailable `rankingMetrics.*.value` is `null`, with reasons. Never use a raw recorded zero to replace a missing ranking value.

### Growth, ties, and leaders

Revenue growth is `(current net revenue - comparison net revenue) / comparison net revenue × 10000`. Subtraction, scaling and rounding use BigInt; the final basis-point value must be a safe JSON integer. Half values round away from zero. A zero or negative comparison baseline is excluded, as is growth outside the supported integer range. Missing comparison records are different from a recorded zero baseline.

Equal integer metric values share competition ranks: `1, 1, 3`. Ties sort by numeric `restaurantId`, then numeric `branchId`, independently of language and database row order. Margin and growth ties use the displayed rounded basis-point value. All tied rank-one branches are returned as leaders.

A leader requires at least two eligible branches in the authorized cohort. A single eligible branch can have rank 1 in `items`, but `leaders` is empty with `status: "insufficient_comparable_branches"`. This prevents a branch manager's sole visible branch from being presented as the organization's best or worst branch.

Growth `items` includes flat and declining branches with sufficient records. When no eligible branch has positive rounded growth, `fastestGrowing.leaders` is empty with `status: "no_positive_growth"`; the least severe decline is not called growth. Otherwise status is `ready`.

Comparisons use the requested periods. Same-store normalization and special handling of new/closed branches belong to Task 5.3 and are not inferred here.

## Response and lineage

The response includes:

- `rankingVersion`, `sourcePerformanceVersion`, and `sourceFormulaVersion`;
- `scope`, `currencyCode`, `timezone`, and resolved current/comparison `period`;
- `policy` with category requirements, tie order, minimum cohort and unallocated-cost treatment;
- all five `rankings`, each with `metric`, `order`, `unit`, `status`, eligible/excluded counts, tied `leaders`, ranked `items` and `excluded` entries;
- `branches` with identities, recorded metrics, `growthEvidence`, nullable `rankingMetrics`, current/comparison completeness and category-level lineage;
- the financial and ranking assumptions needed to interpret the output.

Join ranking entries to `branches` by `(restaurantId, branchId)` to inspect their evidence. `growthEvidence` exposes both current and comparison net revenue, and `lineage.comparison` identifies the records used for the baseline. Lineage never includes another tenant's or an inaccessible branch's records.

Arabic, Chinese and English branch/restaurant names pass through unchanged. Stable status and reason codes are suitable for localized consumers; sorting never depends on translated labels. No frontend layout is changed by this endpoint.

| Reason code                              | Meaning                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `missing_category_records`               | Required category evidence is absent; `period` and `categories` identify the gap |
| `comparison_disabled`                    | The request explicitly used `comparison=none`                                    |
| `positive_comparison_revenue_required`   | Percentage growth cannot be ranked from a zero or negative baseline              |
| `positive_current_revenue_required`      | Margin cannot be ranked with nonpositive net revenue                             |
| `growth_outside_supported_integer_range` | Growth would exceed safe integer basis points                                    |

## Worked example

All modeled current categories are recorded, including true zeroes where applicable. Both periods have complete sales/discount/refund category coverage. Values below are in CNY minor units.

| Branch              | Net revenue | Net profit | Food costs | Previous net revenue |    Margin |    Growth |
| ------------------- | ----------: | ---------: | ---------: | -------------------: | --------: | --------: |
| 深圳总店            |       10000 |       5000 |       4000 |                 5000 |  5000 bps | 10000 bps |
| فرع نانشان          |       20000 |       6000 |       7000 |                16000 |  3000 bps |  2500 bps |
| Harbor Branch       |       10000 |      -1000 |       9000 |                10000 | -1000 bps |     0 bps |
| Equal Profit Branch |       10000 |       5000 |       2000 |                 5000 |  5000 bps | 10000 bps |

Best: فرع نانشان. Worst: Harbor Branch. Fastest growth and highest margin: 深圳总店 and Equal Profit Branch tied. Highest recorded food cost: Harbor Branch. A fifth branch with only sales records cannot displace a profit leader by having missing costs interpreted as zero.

## Operations and validation

No migrations, new environment variables, credentials or provider services are needed. The endpoint uses the existing authenticated routes, request IDs, error handling and financial read paths. Monitor HTTP errors and latency using the existing operations logging; do not log full financial payloads or source references.

`02-backend/server/test/task5BranchRanking.test.js` covers the worked example, tied ranks, losses, explicit zeroes, incomplete data, single-branch cohorts, growth baselines and bounds, disabled comparisons, cross-tenant/restaurant/role access, multilingual names, invalid filters, custom periods and DST. Run `pnpm validate` before merging. The existing dashboard ranking remains compatible and is not replaced by this stricter contract.
