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

Supported keys are `branches`, `menu`, `costs`, and `sales`. Downloads are UTF-8 CSV files with a BOM for spreadsheet compatibility. Upload parsing, XLSX support, staging, row validation, and confirmation remain in Task 2.2.
