# Financial engine documentation

This directory is the canonical engineering and product reference for Restrova's deterministic financial engine. It covers the ledger, formulas, periods, hierarchy, dashboard API and UI, accuracy contract, and the limits of what the platform can claim.

The implementation remains authoritative. Documentation contract tests fail when a financial category, formula version, response version, or explicit assumption changes without the corresponding reference update.

## Current contract versions

| Contract               | Version  | Authority                                                                         |
| ---------------------- | -------- | --------------------------------------------------------------------------------- |
| Ledger model           | `1`      | [`financialService.js`](../../02-backend/server/src/services/financialService.js) |
| Calculation formula    | `3.7-v1` | [`metric-reference.md`](metric-reference.md)                                      |
| Period engine          | `3.3-v1` | [`period-engine.md`](period-engine.md)                                            |
| Hierarchical report    | `3.4-v1` | [`branch-financial-engine.md`](branch-financial-engine.md)                        |
| Dashboard API          | `3.5-v1` | [`dashboard-api.md`](dashboard-api.md)                                            |
| Financial dashboard UI | Task 3.6 | [`dashboard-ui.md`](dashboard-ui.md)                                              |

## Read by goal

- Product and finance reviewers: start with [metric definitions](metric-reference.md), then [worked examples](calculation-examples.md) and [known assumptions](assumptions.md).
- Backend and data engineers: read the [data model](data-model.md), [lineage and audit contract](lineage-and-audit.md), [period engine](period-engine.md), and [hierarchical report](branch-financial-engine.md).
- Frontend engineers: read the [dashboard API](dashboard-api.md) and [dashboard UI](dashboard-ui.md).
- QA and release reviewers: read the [accuracy tests](accuracy-tests.md) and [financial release notes](release-notes.md).

## Trust rules

1. Money is stored and returned as integer minor units. Currency conversion is never implicit.
2. Percentages are integer basis points (`10000` = 100%) and are unavailable when revenue is not positive.
3. Every result is restricted by authenticated organization, restaurant, role, branch, and requested period.
4. Additive totals are calculated from ledger facts; ratios are recalculated and never summed.
5. Missing categories remain visible through completeness metadata. Zero is not presented as proof that an unconnected cost is truly zero.
6. Every category retains source lineage. No dashboard or AI layer may replace a missing business fact with an estimate.
7. Tax is not modeled in `3.7-v1`; the platform does not estimate or deduct it.

## API sequence

| Purpose                 | Endpoint                       |
| ----------------------- | ------------------------------ |
| Inspect the model       | `GET /api/financial/model`     |
| Write a ledger fact     | `POST /api/financial/entries`  |
| Audit ledger facts      | `GET /api/financial/entries`   |
| Calculate scoped values | `GET /api/financial/calculate` |
| Resolve periods         | `GET /api/financial/period`    |
| Reconcile hierarchy     | `GET /api/financial/report`    |
| Render dashboard data   | `GET /api/financial/dashboard` |

All endpoints require authentication. Only owners may write financial entries. Cross-tenant restaurant or branch identifiers return `404`; insufficient role access returns `403` where revealing the resource is safe.

## Change policy

A change to category semantics, rounding, missing-value behavior, tax treatment, order identity, consolidation, or period boundaries requires:

1. a new or explicitly reviewed contract version;
2. updated golden datasets and automated coverage;
3. updates to this documentation set and release notes;
4. a passing `pnpm validate` and GitHub CI before merge.
