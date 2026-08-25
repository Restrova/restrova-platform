# Safe staged imports

Restrova imports branch, menu, cost, and sales data through a staged workflow:

1. Choose a versioned template.
2. Upload a CSV or XLSX file.
3. Review automatic column mappings and correct them when needed.
4. Validate required fields, types, references, dates, and duplicates.
5. Review the first configured number of rows (20 by default).
6. Confirm with the job-specific, short-lived token or cancel the job.
7. Review the scoped history and audit events.

Preview and mapping updates never write operational restaurant data. Only the confirm endpoint writes accepted rows, inside a database transaction. Duplicate cost and sales rows are skipped safely.

## Status reference

| Public workflow status | Meaning                                                 | Allowed next action                                         |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| `needs_mapping`        | A required Restrova field is not mapped                 | Correct and save mappings, or cancel                        |
| `validation_failed`    | One or more rows have blocking errors                   | Correct the source file and create a new preview, or cancel |
| `ready`                | Mapping and row validation passed                       | Confirm before the token expires, remap, or cancel          |
| `failed`               | A processing or confirmation failure was audited        | Investigate by request ID and retry with a fresh preview    |
| `confirmed`            | Accepted rows were written and the token was consumed   | Read history only                                           |
| `cancelled`            | The staged job was cancelled without operational writes | Read history only                                           |

The database lifecycle value `preview_ready` is combined with `validation_status` to produce the workflow statuses above. Audit events additionally distinguish creation, upload, validation, readiness, confirmation, completion, cancellation, and safe failure stages.

## Safety and isolation

- All endpoints require authentication; staged imports currently require the organization `owner` role.
- Every job lookup, history query, reference validation, and persistence operation is scoped to the authenticated organization and restaurant.
- Preview data is limited, but complete validated rows remain server-side for exact confirmation.
- Confirmation tokens use 256 bits of randomness, are stored only as SHA-256 hashes, expire, rotate after mapping changes, and are erased after confirmation or cancellation.
- File extension, MIME type, parser compatibility, UTF-8 validity, size, row, column, and cell-length limits are enforced server-side.
- Text values beginning with spreadsheet formula indicators are rejected.
- Logs and audit events contain safe identifiers and statistics, never confirmation tokens or full uploaded datasets.
- No temporary files are created; parsing is in memory, so there is no temporary-file cleanup path.

## Configuration

| Variable                                |   Default | Purpose                                       |
| --------------------------------------- | --------: | --------------------------------------------- |
| `IMPORT_MAX_FILE_SIZE_BYTES`            | `5000000` | Maximum raw CSV/XLSX upload size              |
| `IMPORT_MAX_ROWS`                       |   `10000` | Maximum non-empty data rows                   |
| `IMPORT_MAX_COLUMNS`                    |     `100` | Maximum worksheet/header columns              |
| `IMPORT_MAX_CELL_LENGTH`                |   `10000` | Maximum characters in one header or cell      |
| `IMPORT_PREVIEW_ROWS`                   |      `20` | Maximum rows returned in the preview response |
| `IMPORT_CONFIRMATION_TOKEN_TTL_SECONDS` |    `1800` | Confirmation-token lifetime                   |
| `IMPORT_PREVIEW_RATE_LIMIT_MAX`         |      `20` | Preview requests per rate-limit window        |
| `IMPORT_ACTION_RATE_LIMIT_MAX`          |      `60` | Mapping/confirm/cancel requests per window    |
| `RATE_LIMIT_WINDOW_MS`                  |  `900000` | Shared rate-limit window                      |

## Database migrations

Apply migrations in numeric order through the normal application bootstrap; do not edit production tables manually.

- `0002_import_templates.sql`: versioned template metadata.
- `0003_staged_imports.sql`: jobs, staged rows, catalog, costs, and sales lines.
- `0004_import_mapping_validation.sql`: mapping metadata and validation states.
- `0005_import_audit_security.sql`: token expiry/consumption, request correlation, and immutable audit events.

The migration runner wraps each migration in a transaction and records it in `schema_migrations`. Back up the durable database before deployment. Roll back the application by restoring that backup; SQLite does not provide automatic down migrations for these additive changes.

## More references

- [API guide](api.md)
- [Templates, aliases, and validation](templates.md)
- [Troubleshooting runbook](troubleshooting.md)
- [Release checklist](release-checklist.md)
- [Safe sample files](examples/)
