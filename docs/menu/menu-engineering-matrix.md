# Menu engineering matrix (`4.3-v1`)

Task 4.3 classifies menu items from the recorded sales and historical-cost evidence produced by `4.2-v1`. It does not use a language model or estimated business figures.

## Endpoint

```text
GET /api/menu/engineering-matrix
```

The endpoint accepts the same `branchId`, `status`, `from`, `to`, `itemCode`, `limit`, and `offset` query parameters as menu margin analysis. Classification thresholds always use the complete authenticated scope; filtering and pagination only change returned items.

## Eligibility and thresholds

An item is eligible only when it has positive revenue, positive sold quantity, and complete effective-cost coverage. Other items appear in `excluded` with their missing evidence and never receive an invented classification.

- Popularity is the item's quantity share among eligible items.
- High popularity is greater than or equal to the equal-share average: `10000 / eligible item count`.
- High margin is greater than or equal to the eligible portfolio's revenue-weighted contribution margin.
- Equality is high for deterministic boundary behavior.

| Popularity | Contribution margin | Classification |
| ---------- | ------------------- | -------------- |
| High       | High                | `STAR`         |
| High       | Low                 | `PLOWHORSE`    |
| Low        | High                | `PUZZLE`       |
| Low        | Low                 | `DOG`          |

Every classified item preserves the full Task 4.2 metrics, completeness, sales references, and historical-cost lineage. The response publishes both thresholds, eligible totals, formula versions, scope, period, assumptions, and exclusions so the result can be reproduced and audited.

Organization and restaurant scope comes only from the authenticated session. Branch managers remain locked to their assigned branch, and inaccessible branch identifiers return `404`. Arabic, Chinese, and English item names are returned unchanged.
