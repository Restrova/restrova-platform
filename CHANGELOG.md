# Changelog

All notable project changes should be documented here.

This project follows a simple date-based changelog until a formal release process is introduced.

## 2026-08-27

- Completed Task 3.8 with a canonical financial engine documentation set covering metric definitions, calculation examples, data lineage, assumptions, known limits, version history, and release/rollback notes.
- Added documentation contract tests that keep supported categories, API/formula versions, assumptions, worked examples, and navigation aligned with the implementation.
- Completed Task 3.7 with financial golden datasets covering rounding, tax policy, deductions, negative results, multiple branches/currencies, millisecond boundaries, and timezones.
- Corrected negative-revenue margin behavior, ISO currency minor-unit display, fractional-second queries, and full-stack QA stability.
- Completed Task 3.6 with a localized, accessible financial dashboard UI backed by the versioned financial API, data coverage, and source lineage.
- Completed Task 3.5 with dashboard-ready summaries, trends, cost breakdown, comparisons, branch ranking, reconciliation, and deterministic evidence.

See the [financial engine release notes](docs/financial/release-notes.md) for contract versions and compatibility details.

## 2026-08-26

- Completed Task 3.4 with independent branch economics, restaurant and organization consolidation, explicit unallocated costs, and reconciliation checks.
- Added role-safe hierarchical financial reporting with period comparisons, scoped lineage, multilingual names, and tenant isolation coverage.
- Fixed local Vite port CORS handling and corrected GitHub-to-Render deployment blueprints for free preview and persistent production use.

- Completed Task 3.3 with timezone-aware today, yesterday, week, month, quarter, year, and custom financial periods.
- Added previous-period, same-weekday, and previous-year comparisons with deterministic boundaries, metric deltas, DST coverage, lineage, and branch isolation.
- Completed Task 3.2 with deterministic revenue, COGS, profit, margin, AOV, and cost-per-order calculations over the scoped financial ledger.
- Added basis-point and minor-unit rounding rules, completeness signals, category-level lineage, calculation assumptions, period filters, and tenant/branch isolation coverage.

## 2026-08-25

- Completed Task 3.1 with an organization-, restaurant-, and branch-scoped financial ledger covering all revenue, deduction, variable-cost, and operating-expense inputs in integer minor units.
- Added required source lineage, idempotent financial references, owner-only writes, branch-manager read isolation, API coverage, and financial data-model documentation.
- Completed Task 1.3 QA with full-stack onboarding, organization isolation, branch isolation, and role-boundary coverage.
- Added a Task 1.3 QA matrix documenting the verified scopes, evidence, and release gate.
- Completed Task 1.2 with a guided owner, organization, restaurant, and first-branch onboarding flow.
- Added owner-only branch setup, team invitations, one-time temporary credential handling, and explicit role/branch management in Arabic, Chinese, and English.
- Hardened team access by preserving at least one organization owner and avoiding invalid temporary credentials for existing accounts.
- Added frontend onboarding/management coverage and backend role, tenant, and invitation edge-case coverage.
- Completed Task 2 safe import release readiness across validation, integration coverage, audit history, security limits, and documentation.
- Added scoped import history and operational metrics APIs plus request-correlated lifecycle audit events without logging tokens or uploaded datasets.
- Added configurable upload, row, column, cell, preview, token-lifetime, and import rate limits; strict extension/MIME/content validation; fatal UTF-8 checks; formula protection; and explicit-timezone validation.
- Added expiring, rotating, one-use confirmation tokens and replay/cancellation hardening.
- Expanded backend and frontend flow coverage for history, metrics, access isolation, malformed files, resource limits, expiration, confirmation, cancellation, and row-error UX.
- Added complete import/API/template/runbook/release documentation and safe Arabic/Chinese/English sample CSV files.

## 2026-08-13

- Added Task 2.3 automatic column alias mapping and manual mapping correction for staged imports.
- Added `needs_mapping`, `validation_failed`, and `ready` validation states without breaking the existing import job lifecycle status.
- Added row-level source-column/value diagnostics, separated warnings from blocking errors, and blocked confirmation while validation errors remain.
- Added mapping persistence, confirmation-token rotation after remapping, a mapping update API, migration coverage, and Task 2.3 acceptance tests.

## 2026-08-11

- Added Task 2.2 safe staged CSV/XLSX import jobs with first-20-row preview and row-level validation errors.
- Added server-side confirmation tokens, cancellation, file SHA-256 metadata, persisted import statistics, and no-live-write preview semantics.
- Added staged catalog items, effective-dated costs, and duplicate-safe sales-line storage using integer minor units for money.
- Added basic dependency-free XLSX parsing, UTF-8 Arabic/Chinese coverage, `+08:00` date coverage, and Task 2.2 acceptance tests.
- Added Task 2.1 versioned import template schema for branches, menu, costs, and sales.
- Added authenticated template metadata and CSV download API endpoints.
- Added UTF-8/BOM-safe CSV template downloads and template API coverage tests.
- Updated repository documentation to make Task 2.2 the next implementation step.

## 2026-08-09

- Added enterprise readiness audit and roadmap.
- Added repository foundation for pnpm-based development, contribution workflow, security policy, and CI readiness.
