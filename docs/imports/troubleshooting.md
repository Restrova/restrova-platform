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
