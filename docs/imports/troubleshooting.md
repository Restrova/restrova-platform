# Import troubleshooting runbook

Start every investigation with `request_id`, `import_job_id`, `organization_id`, and (when relevant) `branch_id`. Do not paste confirmation tokens or uploaded datasets into logs or tickets.

| Symptom                        | Checks                                                                                         | Safe action                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Import appears stuck           | Read the job and audit timeline; compare the latest event and request ID                       | Preview processing is synchronous. If no response completed, retry as a new job after checking API health and limits |
| High validation failure rate   | Group row errors by code/field; inspect mapping warnings                                       | Correct aliases/mappings or source values; do not bypass blocking errors                                             |
| Unexpected duplicate detection | Check template, file SHA-256, branch, external order/line IDs, or cost effective time          | Confirm identifiers represent new facts before changing them                                                         |
| Confirmation fails             | Check job status, validation state, token expiry, and whether mapping rotated the token        | Use only the newest token; create a new preview after expiry                                                         |
| Parser error                   | Verify `.csv`/`.xlsx`, MIME, UTF-8, workbook integrity, and configured limits                  | Re-export from the source system as a plain valid file                                                               |
| Permission failure             | Verify authenticated organization, restaurant, role, and branch reference ownership            | Use an owner in the correct organization; never transfer job IDs across tenants                                      |
| Persistence failure            | Correlate the request ID with sanitized server errors; check database health and disk capacity | Keep the job unconfirmed, repair infrastructure, then create a fresh preview                                         |

Operational metrics are available at `GET /api/data/import-jobs/metrics`. Audit history is immutable and contains safe event details only. Back up the durable database before migrations or production releases.

## XLSX table layout

The importer reads the first numbered worksheet and expects column headers in its first row. It accepts both default-namespace and prefixed SpreadsheetML cell, row, value, inline-string and shared-string elements. Formatted report covers with blank header cells produce a table-layout error instead of being reported as empty.

Multi-sheet summary reports are not transaction imports. Export the underlying table with a single header row and retain the original reporting period, currency and aggregation level. Never fabricate order IDs, transaction dates or currency to force a summary into the sales template. Resolve unexplained differences between reported gross sales, discounts and net revenue with the source before confirmation. Keep restaurant/branch assignment explicit. This parser fix does not add multi-sheet report analysis to Copilot or close the remaining owner UI localization reviews.
