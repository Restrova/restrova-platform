# 02 — Backend / مطور Backend

This section is owned by the backend developer.

## Main code

- [`server/`](server/) — Express API, authentication, database access, restaurant tools, and production server runtime.

## Responsibilities

- API routes and validation.
- JWT/session handling.
- Organization, restaurant, branch, and role isolation.
- SQLite/PostgreSQL persistence.
- Restaurant tool implementations.
- Secure server-only model integration.

## Run backend validation

From the repository root:

```bash
pnpm --filter server test
pnpm --filter server eval
```

## Task 2.1 — import template API

Authenticated users can inspect and download the platform CSV templates used by the staged-import flow:

```text
GET /api/data/templates
GET /api/data/templates/:key
GET /api/data/templates/:key/download
```

Supported keys are `branches`, `menu`, `costs`, and `sales`. Downloads are UTF-8 CSV files with a BOM for spreadsheet compatibility.

## Task 2.2 — safe staged import

Owners can upload CSV or XLSX files without writing live restaurant data during preview:

```text
POST /api/data/import-jobs/preview?templateKey=<key>&filename=<file>
GET  /api/data/import-jobs/:id
POST /api/data/import-jobs/:id/confirm
POST /api/data/import-jobs/:id/cancel
```

The preview endpoint receives the raw file body with a CSV/XLSX content type. It stores file metadata and SHA-256, validates every row, returns the first 20 rows and row-level errors, and issues a confirmation token bound to the stored job. Confirmation writes accepted rows only. Sales lines are duplicate-safe, money is normalized to integer minor units, UTF-8 Arabic/Chinese text is preserved, and ISO timestamps with `+08:00` are supported.

The older `/api/data/import/preview` and `/api/data/import` routes remain for legacy compatibility.
