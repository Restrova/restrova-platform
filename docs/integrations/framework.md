# Integration framework (11.1)

The source → adapter → mapping → validation → Restrova pipeline is available at `/app/integrations` for restaurant owners. Its first adapter is `file_csv_v1`: a manual CSV export, not a live Foodics, Rewaa or delivery-service connection. The UI explicitly states that distinction. Named sources are restaurant scoped, have a template (sales, menu, costs, branches), save reusable column mappings, and keep links to staged import jobs.

## Pipeline and API

1. `POST /api/integrations` with name and templateKey creates the source. `GET /api/integrations` lists at most 100 scoped sources.
2. `POST /api/integrations/:id/preview?filename=export.csv` accepts text/csv up to 5 MB. The adapter uses the shared parser, mapping and validator. Saved mappings are applied transactionally. A changed header layout that invalidates the saved mapping fails safely; use a new named source for the new export format.
3. `POST /api/integrations/:id/jobs/:jobId/mapping` accepts `{mappings:[{sourceColumn,targetField}]}`. Valid mappings are persisted and the confirmation token is rotated. Changing a mapping in the UI disables confirmation until revalidation.
4. `POST /api/integrations/:id/jobs/:jobId/confirm` requires the unexpired single-use confirmationToken. Only a ready job commits through the existing import transaction, audit and revision path. Retrying does not duplicate confirmed data.
5. `GET /api/integrations/:id/history` returns the last 20 scoped jobs. Imported identifiers, file hash and import audit remain attached to the shared records. Existing import-history tooling provides cancellation and detailed audit inspection.

Preview does not change analytics. Successful confirmation announces the data revision and refreshes reports, assistant history staleness, and other imported-data views. Source IDs must remain stable and unique in the same restaurant; duplicate sales are handled by the existing importer, not overwritten. The adapter does not convert currencies or invent missing costs. Existing import currency and validation limits apply.

All connector operations require current owner authorization and restaurant/organization scope. Foreign source/job combinations return 404. Body schemas reject URLs, arbitrary adapter names and unexpected fields. No outbound network requests, arbitrary SQL, external credentials or scheduled jobs are accepted by this file adapter. Migration 0011 adds source definitions and job associations without changing existing records.

## External providers remain separate work

Issues #83–#87 are not completed by this framework. Live Saudi POS, Chinese-provider, delivery and accounting connections need documented provider-specific contracts, test accounts/authorization, explicit branch/product mappings and reconciliation fixtures. Incremental cursors, retry/backfill and a real external-sync health dashboard belong to those implementations. Do not label a file source “connected” to one of those vendors. No provider secrets should be placed in issue bodies or chat; provision them through the deployment's secret configuration when an adapter is implemented.

## Verification

Integration tests exercise a custom-header CSV through mapping and confirmation into the executive report, persisted mapping reuse, immutable source lineage, data revision changes, invalid rows, foreign tenants, mismatched jobs and owner-only access. UI tests cover translated source management and explicit manual mode. The full project validation and CI gate apply.
