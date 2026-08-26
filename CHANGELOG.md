# Changelog

All notable project changes should be documented here.

This project follows a simple date-based changelog until a formal release process is introduced.

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
