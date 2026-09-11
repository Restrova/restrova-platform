# Operating forecasts — Tasks 7.1–7.4

| Issue | Output                                                               |
| ----- | -------------------------------------------------------------------- |
| #54   | Tomorrow, next 7 days and next 30 days: gross sales and order counts |
| #55   | Branch and complete group net-revenue projections                    |
| #56   | Food, packaging, commissions and operating costs                     |
| #57   | Gross, contribution and net profit outlook                           |

Use `/app/forecasts` or authenticated `GET /api/forecasts`. Filters: `scope=branch|restaurant|organization`, compatible restaurant/branch IDs, `horizon=1|7|30`, `historyDays=29..365` (default 57), optional ISO `anchor`, and `language=ar|en|zh`. The UI maps Chinese `zh-CN` to API `zh` and follows current restaurant/branch selection. Owners, managers and viewers retain existing financial-report boundaries.

## Reproducible model

Version `7.4-v1` is a documented baseline model, not a fitted large language model. The anchor's local calendar date is excluded from history. Forecast dates start **tomorrow relative to the anchor's local date**, not today. Every future date uses the median of at least four observed historical occurrences of that weekday for gross sales, net sales and orders. All selected historical days and source identifiers are returned; the exact anchor and data reproduce the forecast.

A branch needs an explicit opening date and must not be closed on the forecast date. Missing sale dates are excluded, never treated as zero. Weekly patterns are modeled; holidays, annual seasonality, promotions, future mix changes and closures without lifecycle records are not inferred. Incomplete input can produce a sales forecast while costs/profits remain unavailable.

Cost projections require sales evidence on every history date, positive aggregate net revenue, explicit presence of all modeled ledger categories (including zero entries), and equality of total ledger/imported net revenue. Food, packaging and commission use their historical total divided by historical net revenue, multiplied by the projected day's net revenue. Operating costs use the total booked operating expense divided uniformly by the number of historical calendar days. This handles monthly bookings as an explicit average allocation, not proof of the actual spend on each day.

- Gross profit = net revenue − food costs.
- Contribution profit = gross profit − packaging − delivery commissions.
- Net profit = contribution profit − operating costs.

Net profit follows the existing model: tax, interest, depreciation and amortization are not modeled. Negative profit is permitted. A nonpositive revenue denominator yields unavailable costs/profits rather than a fabricated ratio. Arithmetic uses integer minor units and BigInt intermediate totals; rounding occurs at each daily projected metric. Period totals sum the displayed daily projections.

## Completeness and evidence

Group totals are available only when **every authorized branch** has the corresponding metric. Missing/new/closed branches cannot silently disappear from a group total. Any unallocated ledger entries in the selected group make aggregated costs and profits unavailable; branch projections remain inspectable and imported sales totals are preserved. Unallocated expense is never silently ignored when presenting group profit.

Responses include group daily/period totals, every branch projection, baseline dates for each forecast day, full historical date coverage, imported/ledger lineage, category totals, missing categories and reconciliation status. APIs cap history at 365 days and 50,000 rows per source across the scope. Unsafe integers and invalid filters fail explicitly. This is an estimate based on recorded evidence; observed dates do not prove every transaction was imported.

## Validation and boundaries

Automated coverage includes all three horizons, daily/period arithmetic, all cost/profit definitions, complete group aggregation, unallocated costs, missing categories/dates, source mismatch, deterministic anchors and organization/restaurant/role boundaries. The UI covers localized labels, unavailable states, horizon changes and errors. `pnpm validate` and GitHub CI are required before merge.

Calibrated confidence (#58), accuracy tracking (#59) and additional seasonal intelligence (#60) are intentionally separate issues. No accuracy percentage or guaranteed business outcome is claimed.
