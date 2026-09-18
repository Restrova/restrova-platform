# Executive reports (10.3–10.6)

`/app/reports` offers daily, weekly and monthly executive reports, using confirmed imported data and the permission-filtered copilot engines. Arabic RTL, English and Chinese labels and recommendation descriptions use the current locale.

## Periods and contents

The daily default is yesterday in the restaurant timezone; weekly is the last seven completed local dates; monthly is the previous complete calendar month. Both explicit dates may override the default, within the existing 1–31 completed-day limit. The API rejects partial ranges, future dates and unknown cadence/scope/language values. The preceding equal-length period is used for comparisons; monthly comparison is therefore not necessarily the preceding calendar month. The exact comparison bounds are retained in the evidence.

`GET /api/reports/executive?cadence=daily|weekly|monthly` accepts the same restaurant/branch/language/date filters as the copilot. It includes the financial and operational pack (revenue, operating profit, margin, distinct orders, reconciled AOV, item and branch rankings, alerts), executive accounting explanation, up to three proposed actions, and daily trend points for weekly/monthly reports. Missing days are null rather than zero; no unsupported profit or savings is introduced. Each trend point and proposed action links to an evidence snapshot. The same authorization applies to interactive and exported reports.

## Top three policy

Ranking version `operational-priority-v1` is an explicit conservative review policy, not a model of guaranteed financial return: refund and abnormal-discount reviews precede ingredient-cost/pricing reviews, followed by rising costs, falling sales, supplier quotes, menu retention/portion changes, branch underperformance and promotions. Recommendations with no lineage or low confidence are excluded. Duplicate branch/item/action combinations are collapsed; stable branch/key tie breakers make ordering reproducible. Expected savings remain null because unit cost changes, total contribution and revenue movements are not interchangeable. Fewer than three actions is legitimate. More than 20 branches requires selecting a branch for actions; the rest of the report remains available.

Actions link to the existing recommendation review workflow; reports never approve or execute them. The UI describes ranking as operational priority rather than claiming a mathematically optimal financial outcome.

## Export

- **Print / save PDF** opens the browser's print dialog, where the user selects Save as PDF. This is a browser print workflow, not server-side PDF generation or an automatic attachment. Print styles isolate the report, keep Arabic direction, repeat table headings and avoid splitting individual rows/cards. The user's browser controls the final printer/PDF destination.
- **Download CSV** calls `GET /api/reports/export.csv` with the displayed dates pinned. The server rechecks permissions, returns no-store text/csv with attachment disposition, and preserves exact integer minor-unit values, basis points, nulls as blank cells, status, source IDs, currency and import revision. Text cells beginning with spreadsheet formula indicators are apostrophe-prefixed; numeric negative values remain numeric strings. UTF-8 BOM supports common spreadsheet applications. CSV is the numeric attachment format in this release; XLSX is not implemented here.

Migration is only required for the separate integration framework. Report generation is read-only, with no scheduler or outbound delivery. Existing request logs record endpoint failures. Reports use the existing engine limits (50,000 transaction lines, 500 menu items, 31 selected dates); narrow scope when those limits are exceeded. Daily source snapshots in the trend enable reconciliation rather than unsupported interpolation.

Automated coverage checks calendar defaults, trend reconciliation, unavailable values, evidence links, stable action ranking/deduplication, cross-tenant and role restrictions, malformed input, formula-safe CSV, localized UI, print invocation and export of the displayed period. Browser visual/print verification could not be performed in the development session because the cloud browser blocked the local preview URL; verify final pagination in the target browser's print preview.
