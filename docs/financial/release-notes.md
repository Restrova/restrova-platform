# Financial engine release notes

## 2026-08-27 — Phase 3 complete

Task 3.8 completes the documented Financial Engine phase. The current public contracts are calculation `3.7-v1`, period `3.3-v1`, hierarchical report `3.4-v1`, and dashboard `3.5-v1`.

### Task 3.8 — Financial Engine Documentation

- Added the canonical financial documentation index.
- Added complete metric definitions, worked examples, data-lineage and audit procedures, known assumptions, limitations, and release history.
- Linked financial documentation from repository and Backend guides.
- Added automated documentation contract tests for categories, versions, assumptions, examples, and local links.

### Task 3.7 — Financial Accuracy Tests

- Added golden calculation datasets covering rounding, refunds, discounts, negative results, multiple branches, multiple currencies, exact date boundaries, and timezones.
- Introduced calculation formula `3.7-v1`.
- Made tax treatment explicit as `not_modeled`; no tax is estimated or deducted.
- Changed margin and cost-percentage behavior to unavailable when revenue is zero or negative.
- Preserved fractional seconds in SQLite range comparisons.
- Corrected UI minor-unit display for zero-decimal and three-decimal currencies.

Compatibility note: clients that assumed every non-zero revenue produced a numeric margin must accept `null` for negative revenue. This is an intentional accuracy correction.

### Task 3.6 — Financial Dashboard UI

- Replaced the dashboard placeholder with real Task 3.5 API data.
- Added revenue, net profit, margins, food/labor percentages, AOV, orders, trends, cost breakdown, branch ranking, period comparison, and evidence coverage.
- Added Arabic RTL, English, and Simplified Chinese content plus accessible trend data.

### Task 3.5 — Financial Dashboard API

- Added the UI-ready `GET /api/financial/dashboard` contract versioned as `3.5-v1`.
- Added deterministic trend buckets, cost breakdown, comparison deltas, branch ranking, completeness, lineage, and reconciliation.

## 2026-08-26 — Periods and hierarchy

### Task 3.4 — Branch Financial Engine

- Added `GET /api/financial/report`, version `3.4-v1`.
- Added independent branch calculations, restaurant/organization consolidation, explicit unallocated costs, and additive reconciliation.
- Enforced owner, viewer, branch-manager, restaurant, branch, and tenant boundaries.

### Task 3.3 — Financial Period Engine

- Added `GET /api/financial/period`, version `3.3-v1`.
- Added timezone-aware today, yesterday, week, month, quarter, year, and custom periods.
- Added previous-period, same-weekday, and previous-year comparisons, including DST and leap-day behavior.

### Task 3.2 — Core Financial Calculation Engine

- Added deterministic revenue, COGS, gross/contribution/operating/net profit, margin, AOV, order count, total cost, and cost-per-order formulas.
- Added integer minor-unit and basis-point rounding, category lineage, completeness, explicit assumptions, and scope isolation.
- Initial formula contract was `3.2-v1`; it was superseded by the Task 3.7 accuracy contract `3.7-v1`.

## 2026-08-25 — Financial ledger

### Task 3.1 — Financial Data Model

- Added the version `1` scoped financial ledger.
- Added all supported income, revenue-deduction, variable-cost, and operating-expense categories.
- Added required source references, evidence, duplicate protection, integer minor units, owner-only writes, and branch-manager read isolation.

## Upgrade and rollback notes

- Tasks 3.1–3.8 require no new external service and no financial data backfill for the current SQLite model.
- Formula `3.7-v1` is an API behavior change, not a database migration.
- Rollback to a pre-Task 3.7 application restores older negative-revenue margin behavior and two-decimal UI assumptions; this is not recommended for accuracy.
- Render free preview data remains ephemeral. Persistent production financial data requires a durable volume or managed database and verified backups.
- Before deployment, run `pnpm validate`; after deployment, verify `/api/health`, `/api/ready`, owner authentication, a scoped financial calculation, and dashboard rendering.
