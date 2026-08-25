# Task 2 release checklist

Verified by repository migrations and automated backend/frontend tests:

- [x] Database migrations apply twice without error.
- [x] Template metadata and downloads work.
- [x] CSV imports work.
- [x] XLSX parsing works and malformed workbooks fail safely.
- [x] All four templates are covered.
- [x] Automatic and manual column mapping work.
- [x] Row-level validation errors are understandable.
- [x] Preview returns at most the configured rows and does not write operational data.
- [x] Confirmation writes accepted rows transactionally.
- [x] Expired, invalid, reused, and replayed confirmations are rejected.
- [x] Cancellation writes no operational data.
- [x] Duplicate sales/cost rows are skipped safely.
- [x] Organization isolation and owner-only access are enforced.
- [x] Branch references are scoped.
- [x] Audit events, request IDs, history filters, and metrics work.
- [x] File, row, column, cell, MIME, encoding, formula, and request-rate controls exist.
- [x] Arabic and Chinese UTF-8 survive the workflow.
- [x] Frontend happy, mapping, validation-error, confirmation, and cancellation flows are tested.
- [x] `pnpm test` passes locally.
- [x] `pnpm validate` passes locally.
- [x] No secrets or real production data are present in examples.

Before deployment, the release owner must also confirm the pull request's GitHub CI run is green and the target environment has durable storage, a database backup, production secrets, and suitable import limits.
