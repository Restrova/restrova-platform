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

## Financial engine

The versioned financial ledger, calculation, period, hierarchy, and dashboard APIs are documented in the [canonical financial engine guide](../docs/financial/README.md). Start with the [metric reference](../docs/financial/metric-reference.md) for formulas and units, and the [lineage contract](../docs/financial/lineage-and-audit.md) for audit and scope behavior.

## Menu cost engine

`GET /api/menu/costs` returns versioned per-item selling price, effective food and packaging cost, observed delivery commission, contribution profit, completeness, and source lineage. Calculations use integer minor units and basis points, apply branch-cost precedence, and never replace missing evidence with estimates. See the [menu cost engine contract](../docs/menu/menu-cost-engine.md).

`GET /api/menu/margins` analyzes actual item revenue, quantity, historical costs, gross and contribution profit, food-cost percentage, popularity, refunds, and discounts. It publishes profitability only with complete effective-cost coverage. See the [menu margin analysis contract](../docs/menu/menu-margin-analysis.md).

`GET /api/menu/engineering-matrix` deterministically classifies eligible items as STAR, PLOWHORSE, PUZZLE, or DOG using scope-wide popularity and contribution-margin thresholds while preserving evidence lineage. See the [menu engineering matrix contract](../docs/menu/menu-engineering-matrix.md).

`POST /api/menu/price-simulation` compares current and proposed item prices and projects contribution impact across explicit demand-sensitivity assumptions. It is read-only and blocks projections when recorded evidence is incomplete. See the [price simulation contract](../docs/menu/price-simulation.md).

`POST /api/menu/cost-simulation` compares named supplier, ingredient, and packaging cost scenarios at the recorded selling price, commission rate, and sales quantity. It is read-only and preserves evidence and missing-data boundaries. See the [cost simulation contract](../docs/menu/cost-simulation.md).

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

## Task 2.3 — import validation and mapping

Staged imports now detect common uploaded column aliases and preserve the original uploaded column names in preview responses. Owners can correct a mapping before confirmation:

```text
PUT /api/data/import-jobs/:id/mapping
```

The request body contains the complete mapping list:

```json
{
  "mappings": [
    { "sourceColumn": "Sale Price", "targetField": "selling_price" },
    { "sourceColumn": "Qty", "targetField": "quantity" }
  ]
}
```

Preview responses expose `validationStatus` (`needs_mapping`, `validation_failed`, or `ready`), a computed `workflowStatus`, mapping metadata, row errors with original source columns/values, and separate row warnings. Confirmation is blocked until the validation status is `ready`. A successful manual remap rotates the confirmation token so confirmation remains bound to the latest preview.
