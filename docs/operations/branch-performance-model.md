# Branch performance model (`5.1-v1`)

`GET /api/branches/performance` returns one evidence-backed scorecard per accessible branch. It reuses the financial formula engine (`3.7-v1`) and the timezone-aware period/report engine rather than recalculating business facts in AI.

## Query

The endpoint accepts the financial report query: `scope`, `restaurantId`, `branchId`, `period`, `comparison`, `anchor`, `from`, and `to`. Owners can request restaurant or organization scope. Viewers can read their restaurant. Branch managers are forced to their assigned branch and cannot widen scope.

## Scorecard

Each branch returns:

- gross and net revenue in integer minor units;
- gross, contribution, operating, and net profit;
- gross, contribution, and net margin in integer basis points;
- distinct recorded orders and AOV;
- COGS, operating expenses, total costs, and cost per order;
- refund and discount amounts plus rates against gross sales;
- revenue, net-profit, and order growth against the resolved comparison period;
- current/comparison completeness and category-level source lineage.

Growth includes current value, comparison value, absolute change, and basis-point change. When the comparison value is zero, the percentage is `null` with `percentage_growth_unavailable_with_zero_baseline`; the service never invents an infinite percentage. When comparison is disabled, growth values remain `null`.

Restaurant-level costs without a branch remain unallocated. They are not distributed across branches because no evidence-backed allocation rule exists.

Arabic, Chinese, and English restaurant/branch names pass through unchanged. Currency is never converted.

The [branch ranking endpoint](branch-ranking.md) uses this model with metric-specific evidence requirements, stable ties and explicit exclusion reasons.
