# Branch operations (Tasks 5.3–5.7)

The **Sales comparison** navigation item opens `/app/sales-comparison`. It replaces the placeholder with branch scorecards, a same-store comparison, time/channel breakdowns and evidence-backed opportunities. The interface supports Arabic RTL, English and Simplified Chinese.

## API and access

`GET /api/branches/operations` requires an authenticated session. It returns `operationsVersion: "5.7-v1"`, the authorized scope, organization currency/timezone, resolved periods, `scorecards`, `sameStore`, `timeAnalysis`, `channels`, `opportunities` and the calculation policy.

| Query                      | Meaning                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `scope`                    | `branch`, `restaurant` or `organization`; defaults to restaurant, or assigned branch for managers                        |
| `restaurantId`, `branchId` | Identifiers permitted by the selected scope                                                                              |
| `period`                   | `today`, `yesterday`, `week`, `month`, `quarter`, `year`, `custom`                                                       |
| `comparison`               | `previous_period`, `previous_year`, `none`; `same_weekday` is also supported by the API for today/yesterday              |
| `anchor`                   | Optional ISO timestamp; defaults to the request time                                                                     |
| `from`, `to`               | ISO timestamp bounds for a custom period                                                                                 |
| `fromDate`, `toDate`       | Alternative custom date bounds (`YYYY-MM-DD`), interpreted as inclusive local calendar days in the organization timezone |

Date-only and timestamp bounds cannot be mixed. Reversed/invalid bounds, more than 400 calendar days per period, and more than 50,000 imported sales lines are rejected with the standard validation error. Use shorter periods for larger datasets. Currency is never converted.

Owners can compare their organization. Viewers are restricted to the current restaurant; managers cannot leave their assigned branch. Financial report authorization is resolved before operational sales rows or lifecycle evidence are fetched. Row queries always include organization, restaurant and branch identifiers. Restaurant-level unallocated costs remain outside branch scorecards.

## Same-store comparison — #42

The revenue source is confirmed `sales_lines`, including explicit zero discounts/refunds from the import contract. The same branch set is used for both totals.

1. Resolve both requested periods in the organization timezone.
2. Keep only complete local calendar days that finished before the anchor instant. Partial boundary days, the current unfinished day and future days are excluded.
3. For each weekday, retain the same number of dates in both periods. If counts differ, retain the most recent matching occurrences. A 31-day month is never treated as equivalent to a 28-day month without alignment.
4. Require a documented branch opening date on or before the first retained date, and no closure on or before the last retained date.
5. Require at least one confirmed sales line on **every** retained date in both periods. Missing dates are reported and excluded, never silently filled with zero.
6. Sum the eligible branches' actual recorded sales, discounts, refunds, commissions and distinct orders. Revenue equals gross sales minus discounts and refunds. Percentage growth is unavailable for zero/negative baselines or a result outside the supported safe-integer range; absolute changes remain available when representable.

The response exposes exact retained dates, eligible branch IDs, exclusion reasons, missing dates and source sales-line/order IDs. No comparable branches means null cohort totals and no invented growth percentage. A single eligible branch may be compared with its own history; it is not declared a ranking winner.

Calendar-day/weekday matching is not a holiday or seasonality model. Temporary closures and reopening intervals are not modeled. Sales presence does not certify that every transaction was imported. The UI explicitly discloses these limits.

### Opening and closing dates

Owners record optional `openedOn` and `closedOn` through the existing branch create/update APIs and **Branch management** forms. Opening date is inclusive. Closing date is the first day without operations (exclusive end). A closing date requires an earlier opening date. Omitting fields preserves prior values; explicit null clears them subject to this validation.

Migration `0007_branch_operations.sql` creates `branch_lifecycle`. Each update records the authenticated owner and update timestamp. Existing branches retain unknown lifecycle dates; creation/import timestamps are not silently treated as actual opening dates.

## Scorecards — #43

Scorecards reuse the versioned financial ledger/report engine and expose current/comparison metrics, integer deltas, category completeness and source references. Net revenue requires sales, discount and refund records. Total costs require all modeled cost categories. Operating profit/margin require both. An explicit zero is evidence; an absent category is not.

The UI shows missing figures as unavailable. It shows ledger deltas only when all days of both requested periods survived fair alignment. Same-store sales growth comes from the aligned confirmed-import cohort. Financial ledger values can differ from imported sales totals when the ledger also contains manually entered facts; the sources are labeled separately.

## Day and hour analysis — #44

The selected period's confirmed sale timestamps are converted using the organization's IANA timezone. DST repeated hours are grouped into the same local hour, while order IDs remain distinct within a bucket.

- Weekdays: Sunday `0` through Saturday `6`.
- Hours: `0` through `23`.
- Breakfast: 05:00–11:59; lunch: 12:00–16:59; dinner: 17:00–21:59; late night: 22:00–04:59.

These are declared calendar-clock dayparts, not branch operating-day offsets. Monetary totals reconcile across each breakdown. Bucket order counts are distinct within each bucket; orders split across times/channels may appear in multiple buckets, so adding bucket order counts is not a distinct total.

## Channel performance — #45

The sales import template is now version **2**, with a backward-compatible optional `aggregator_name` column. Existing version-1 CSV headers still import. Arabic `منصة التوصيل` and Chinese `外卖平台` aliases are supported by column mapping.

| Imported fields                      | Reporting group                            |
| ------------------------------------ | ------------------------------------------ |
| `channel=dine_in`                    | Dine-in                                    |
| `channel=takeaway`                   | Takeaway                                   |
| `channel=delivery`, empty aggregator | Direct delivery                            |
| `channel=delivery`, named aggregator | Aggregators and a named-platform breakdown |

Names are trimmed, limited to 120 characters and only accepted for delivery. Platform group names retain their exact case and original language. Migration 0007 adds nullable `sales_lines.aggregator_name`; existing delivery rows remain direct/unspecified delivery and are never guessed to belong to a platform.

Groups expose gross/net sales, discounts, refunds, commissions, distinct order counts and source lineage. Revenue after commission is **not profit** and is labeled accordingly. This is an imported-data breakdown, not a live connection to a delivery provider.

## Opportunity rules — #46

Rules apply only to eligible same-store branches. These are review prompts with observed evidence, not causal findings or guaranteed savings.

| Signal             | Trigger                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Falling sales      | Net revenue change at or below −10% against a positive baseline                                                                   |
| High refunds       | Refunds at least 5% of gross sales                                                                                                |
| Abnormal discounts | Discounts at least 10% of gross sales and up at least 3 percentage points                                                         |
| Underperformance   | Growth at least 10 percentage points below the aggregate growth of at least two other comparable branches with positive baselines |
| Rising costs       | Food cost/net revenue ratio up at least 3 percentage points, with recorded costs and positive revenue in both periods             |

The cost rule additionally requires complete aligned periods and agreement between imported revenue and ledger revenue in both periods, so it does not mix unmatched dates or inconsistent revenue sources. Every rule includes its threshold, observed values, dates and sales evidence; cost signals also include ledger lineage. `expectedImpactMinor` is null: no savings are invented.

## Verification and release

`task5Operations.test.js` covers cohort exclusions, unequal-month weekday alignment, partial days, integer amounts, scope/role denial, DST, all five opportunity rules and confirmed aggregator imports. `branch-operations.test.jsx` covers all three locales, sources, missing costs, scope changes, custom dates and retry behavior. Existing migration and import-template tests cover the upgrade and compatibility.

Run `pnpm validate` and require GitHub CI before merging. The migration is additive, with no deletion of existing records. Back up the database before a production rollout. An application rollback must retain the migrated database and its migration record; do not drop lifecycle/platform data to undo a frontend release. Production provider deployment and real restaurant dataset validation are separate operational checks.
