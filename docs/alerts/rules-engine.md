# Alert rules engine (Task 6.1)

`GET /api/alerts/evaluate` evaluates confirmed data without saving alerts or sending notifications. It requires the normal bearer session. Rule version: `6.1-v1`.

The response contains triggered `alerts` plus all five `evaluations` per authorized branch. Each evaluation is `triggered`, `not_triggered`, or `insufficient_data`. An empty alert array alone is **not** evidence of healthy performance. `summary` counts each status for monitoring and consumers.

## Inputs and thresholds

Use the branch-operations filters: `scope`, `restaurantId`, `branchId`, `period`, `comparison`, `anchor`, and either timestamp `from`/`to` or custom local `fromDate`/`toDate`. Pin the anchor and source records to reproduce a result. Existing tenant/restaurant/branch authorization, the 400-calendar-day range limit, and the 50,000-sales-line limit apply. Responses use `Cache-Control: no-store`.

| Rule                   | Query override            | Default                   | Measurement                                                        |
| ---------------------- | ------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Food cost above target | `foodCostTargetBps`       | 3500 (35%)                | Current food cost / net sales                                      |
| Sales drop             | `salesDropBps`            | 1000 (10%)                | (Previous net sales − current net sales) / previous net sales      |
| Profit margin drop     | `profitMarginDropBps`     | 300 (3 percentage points) | Previous net profit / net sales − current net profit / net sales   |
| Refund rate increase   | `refundRateIncreaseBps`   | 200 (2 percentage points) | Current refunds / gross sales − previous refunds / gross sales     |
| Discount rate increase | `discountRateIncreaseBps` | 300 (3 percentage points) | Current discounts / gross sales − previous discounts / gross sales |

All rules use strict **greater than**. Equality does not trigger. Rates use basis points (100 bps = one percentage point). Exact BigInt fractions determine the result before display rounding; a tiny excess can therefore trigger while `measuredBps` rounds to the threshold. Recompute from the supplied integer amounts to inspect such a boundary.

Thresholds must be nonnegative integers, up to 10,000 for sales/refunds/discounts or 100,000 for food cost/margin. Invalid, empty, repeated, unsupported, and unknown query parameters return 400. Zero thresholds are allowed. Defaults are documented screening assumptions, not inferred business targets. Overrides affect only this request; saved alert preferences are a separate roadmap task.

Example: `/api/alerts/evaluate?period=custom&fromDate=2026-08-17&toDate=2026-08-23&anchor=2026-08-24T12:00:00Z&comparison=previous_period&scope=branch&branchId=123&foodCostTargetBps=3200&language=ar`.

## Evidence and eligibility

All five rules, including food-cost target screening, currently require the fixed same-store cohort: explicitly recorded branch opening/closing dates, observed sales on each matched completed date, and equal weekday counts between periods. `comparison=none`, unknown lifecycle, missing days, or no matched completed days return insufficient data. Missing sales are never assumed to be zero. See [branch operations](../operations/branch-operations.md) for the calendar policy and exclusions.

Sales/refund/discount rules use confirmed sales lines. Food-cost and profit rules additionally require both entire periods to survive alignment, preventing comparison of full-period booked costs with partial-day sales. Current food cost needs explicit food-cost and revenue categories; profit needs every modeled cost and revenue category in both periods, including explicit zero entries. Relevant ledger net revenue must equal imported net revenue. Manual ledger data are allowed only when this reconciliation succeeds.

Every evaluation supplies branch identity, threshold, measurement, exact matched dates, imported totals and sales-line/order identifiers. Ledger-based evaluations also supply financial metrics, category completeness and ledger lineage. Denominators must be positive; zero or negative values yield `non_positive_denominator`, never an invented percentage. Missing categories, mismatched sources, partial alignment, and unrepresentable measurements have distinct reason codes. Unsafe underlying integer totals fail with 400.

`language=ar|en|zh` selects titles and suggested review actions; otherwise a supported session language is used, falling back to Saudi Arabic. Numeric output and identifiers are language-independent, so an Arabic RTL or Chinese/English consumer can render the same evidence. This backend task does not add the Alert Center UI (#50).

## Boundaries and operation

Owners can evaluate authorized organization/restaurant/branch scopes. Branch managers remain restricted to their assigned branch; viewers have the same read-only restaurant/branch limits as financial reporting. Requests reuse financial-report authorization before any operational source query. No migration or provider credentials are needed.

The endpoint is synchronous and read-only. Standard API error handling applies; callers can observe status counts and insufficient-data reason codes without logging source payloads. It does not persist resolution history, assign severity, infer causes, estimate savings, or deliver external messages. IDs identify a branch/rule/current window and are not persisted incident IDs; retain the rule version, thresholds, full period including comparison, and evidence when storing an evaluation snapshot later.

Data completeness is conservative but observed dates do not prove every transaction was imported. Holiday effects and temporary closures are not modeled. Statistical baselines (#48), severity (#49), UI (#50), notifications (#51), preferences (#52), and history (#53) remain separate tasks.

## Verification

API tests cover all five rules, healthy/improving periods, exact thresholds, rounded boundary excess, losses, localization, deterministic outputs, lineage, missing data, partial days, source mismatch, zero denominators, unsafe totals, invalid configuration, and tenant/role restrictions. Shared synthetic operations fixtures also retain regression coverage for the existing branch analytics. Run `pnpm validate` before merging.
