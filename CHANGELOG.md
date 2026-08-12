# Changelog

All notable project changes should be documented here.

This project follows a simple date-based changelog until a formal release process is introduced.

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
