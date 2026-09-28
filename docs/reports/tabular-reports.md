# Detailed reports and controlled exports (#99–#104)

Open **Reports → Detailed reports & exports**. The existing executive daily/weekly/monthly report remains available below. Choose financial, branch, menu or accounting-ledger data. All controls and display headings support Arabic, English and Chinese; Arabic inherits RTL and wide tables have keyboard-focusable horizontal scrolling.

## Data and scope

- Confirmed imports feed the existing financial ledger and menu cost engines. Aggregate previews are separate and never become daily transactions automatically.
- Dates represent 1–31 completed calendar days in the restaurant timezone. Empty dates select yesterday. Both dates must be supplied together. Comparison uses the preceding period of the same length.
- Financial reports include recorded restaurant-level unallocated entries; branch scorecards exclude those entries. Source evidence includes reconciliation and coverage.
- A metric is unavailable unless all of its required categories are present. Explicit zero records count as present; absent records do not. Older imports omit zero ledger deductions: zero discounts, refunds and delivery commissions are recovered only when every sales reference is an imported order with matching in-period lines and reconciled gross amounts. This recovery is recorded in coverage evidence and never assumes missing costs are zero. Comparisons require both periods' inputs. Menu profit requires effective cost coverage for every included sales line.
- Menu reports include all active and inactive catalog items within the limit, without silently stopping at the first page. Menu contribution profit is not net restaurant profit.
- Taxes, interest, depreciation and amortization are not modeled. Operating profit is labeled accordingly. Ledger tax amounts are empty with `not_modeled` status. These are structured source records for downstream review, not tax returns, tax invoices, or jurisdiction-certified filings.

## API

`GET /api/reports/table`, `/api/reports/table.csv`, `/api/reports/table.xlsx`

Supported query fields: `kind=financial|branches|menu|ledger`, `scope=restaurant|branch`, `branchId`, `fromDate`, `toDate`, `language=ar|en|zh`, and optional `expectedRevision`. Unknown fields and invalid scopes fail validation. A branch manager is confined to their assigned branch; an owner remains within the authenticated restaurant and organization. Viewers may read non-ledger reports, but cannot export or read ledger detail. All responses use `Cache-Control: no-store`.

The UI pins export dates and the displayed import revision. If a subsequent import changes that revision, export returns 409 and asks the user to regenerate. Other live edits can affect regenerated reports; the returned digest identifies the exact report content, not an immutable saved snapshot. Financial data and import revisions remain unchanged by exports.

Maximum: 5,000 report rows (or catalog items for menu reports). Larger requests fail explicitly and should be narrowed by branch or date. The UI previews 100 rows and states that exports include all rows.

## Export format

CSV uses UTF-8 BOM, CRLF, quoted cells and formula-prefix neutralization for text. Numeric amounts remain integer minor units. Metadata columns identify the organization, restaurant, scope, period, comparison period, timezone, currency, amount storage, revision and SHA-256 digest. Missing values remain blank; status fields explain coverage. Empty datasets produce a header-only CSV; use the report response or workbook Metadata sheet for their metadata.

XLSX contains **Report**, **Raw data**, and **Metadata** sheets. Report uses localized headings, readable major currency units, a styled header, frozen first row, column widths, autofilter and Arabic RTL. Raw data retains integer minor units for reconciliation. Metadata includes scope, currency, dates, revision, digest and limitations. All untrusted text is stored as literal inline strings; no formulas, macros, hyperlinks or external relationships are generated. The ZIP includes verified CRC checksums. Workbook structure follows [Microsoft SpreadsheetML documentation](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document).

Sources are inspectable in the on-screen evidence panel. CSV and XLSX contain identifiers and digests, not a full historical evidence snapshot. Preserve the JSON response when a complete point-in-time evidence package is needed.

## Audit and operations

Migration `0012_report_exports.sql` adds an append-only application audit table with actor, tenant, branch, kind, format, row count, revision, digest and creation time. It stores no exported cell values or credentials. An event records successful preparation of an export response, not proof that the client saved the file. Existing authentication governs every request; revocation is effective immediately. Export generation fails before recording success if the workbook cannot be generated.

The migration is additive and runs through the existing transactional migration runner. Roll back application code to the previous version if necessary; retain the audit table and its records. No external delivery service, scheduled report job, paid dependency or new credential is needed. Scheduled delivery and branded PDF work remain separate issues.

## Validation

Automated tests cover arithmetic and previous periods, missing inputs, branch/tenant isolation, viewer denial, invalid query fields, stale revisions, literal formula-like names, row limits, audit records, binary downloads, and confirmed-import-to-report flow. Frontend tests cover date validation, selected scope, localized errors, export parameters and result clearing. An independent ZIP CRC check and `openpyxl` read verified the generated workbook, RTL, frozen header, fill style, Chinese/Arabic text, literal formula-like names and three-decimal KWD amounts. Full device/browser acceptance for #96–#98 remains separate.
