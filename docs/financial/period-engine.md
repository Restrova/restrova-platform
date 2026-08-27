# Financial period engine

Task 3.3 adds timezone-aware calendar periods and comparable financial results on top of the current versioned financial calculation formula.

## Period rules

- `today` and `yesterday` use local midnight boundaries.
- `week` starts Monday at local midnight.
- `month` starts on the first local calendar day.
- `quarter` starts January 1, April 1, July 1, or October 1.
- `year` starts January 1.
- `custom` requires explicit offset-aware `from` and `to` timestamps.

Preset boundaries use the authenticated organization's IANA timezone. They are converted to UTC instants before querying SQLite, so a daylight-saving day may contain 23 or 25 hours. The returned `to` value is inclusive and ends one millisecond before the next local period.

## Comparisons

`comparison` accepts:

- `previous_period`: previous day, week, month, quarter, year, or an immediately preceding custom range of equal duration.
- `same_weekday`: seven local calendar days earlier; valid for `today` and `yesterday`.
- `previous_year`: the same local calendar boundaries one year earlier. Leap-day values clamp to the last valid day of February.
- `none`: current period only.

The API returns both complete calculation responses plus absolute metric changes (`current - comparison`). Null ratios remain null instead of becoming invented percentages.

## API

`GET /api/financial/period` accepts `period`, `comparison`, `anchor`, `branchId`, `from`, and `to`. `anchor` makes preset queries reproducible; when omitted, the server's current instant is interpreted in the organization timezone.

All current and comparison queries retain the organization, restaurant, role, and branch protections from the financial engine. Category-level lineage and completeness indicators are returned for both ranges.
