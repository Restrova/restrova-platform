# Financial Dashboard API

Task 3.5 adds the UI-ready `GET /api/financial/dashboard` endpoint. It reuses the audited Task 3.2–3.4 calculation, period, scope, and reconciliation engines; it does not maintain a second set of financial formulas.

## Request

The endpoint accepts the same query parameters as `GET /api/financial/report`:

- `scope=organization|restaurant|branch`
- `restaurantId` or `branchId` when the selected scope permits it
- `period=today|yesterday|week|month|quarter|year|custom`
- `comparison=none|previous_period|same_weekday|previous_year`
- `anchor`, or `from` and `to` for a custom period

Owner, viewer, and branch-manager access follows the Branch Financial Engine contract. Cross-tenant restaurant and branch identifiers return `404` without disclosing resource existence.

## Response

The response is versioned as `3.5-v1` and contains:

- `summary`: revenue, cost breakdown, profit, margins in basis points, order metrics, completeness, and source lineage.
- `comparison`: the selected comparison-period metrics, numeric changes, completeness, and lineage, or `null` when comparison is disabled.
- `trends`: timezone-aware buckets with metrics, completeness, and lineage for every point.
- `branchRanking`: branches ordered by net profit, with deterministic revenue and branch-ID tie breakers.
- `reconciliation`: the Task 3.4 organization/restaurant/branch reconciliation result.
- `assumptions`: the deterministic formula assumptions inherited from the calculation engine.

Money remains in integer minor units. Margins remain integer basis points. Empty scopes return zero additive metrics, `null` ratios, `hasData: false`, and an unranked branch instead of presenting missing data as measured performance.

## Trend granularity

Trend buckets are selected deterministically:

| Period                                   | Granularity                         |
| ---------------------------------------- | ----------------------------------- |
| Today, yesterday, or custom up to 2 days | Hour                                |
| Week, month, or custom up to 62 days     | Day                                 |
| Quarter, year, or custom up to 730 days  | Month                               |
| Longer custom periods                    | Year, capped to roughly 120 buckets |

Day, month, and year boundaries follow the authenticated organization's timezone. Hourly buckets follow real elapsed hours, so daylight-saving transition days correctly contain 23 or 25 points.

## Ranking rule

Only branch-assigned ledger entries affect a branch's rank. Restaurant-level unallocated costs remain visible in the consolidated summary and reconciliation but are excluded from branch ranking because no allocation rule exists. Branches without ledger data are returned with `rank: null`.
