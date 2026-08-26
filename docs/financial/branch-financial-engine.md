# Branch Financial Engine

Task 3.4 adds a reconciled financial hierarchy at `GET /api/financial/report`.

## Scope and access

- `scope=organization` consolidates every restaurant in the authenticated organization and requires the owner role.
- `scope=restaurant` reports the selected restaurant. Owners may select another restaurant in their organization; viewers remain limited to their authenticated restaurant.
- `scope=branch` reports one independently selected branch. Branch managers default to their assigned branch and cannot access higher-level reports.
- Unknown restaurant and branch identifiers return `404` so cross-tenant resource existence is not disclosed.

The endpoint accepts the Task 3.3 period parameters: `period`, `comparison`, `anchor`, `from`, and `to`.

## Consolidation rules

Branch calculations include only ledger rows assigned to that branch. Restaurant-level rows with no `branch_id` are returned separately as `unallocated`; they are never assigned to a branch by assumption.

Restaurant totals are calculated from their complete ledger, not by adding rounded branch ratios. Organization totals are calculated from the complete organization ledger. All money remains in integer minor units, and margins remain basis points.

The response includes reconciliation checks for additive metrics and ledger-entry counts:

1. Each restaurant equals its branches plus its unallocated rows.
2. The organization equals its restaurants.
3. Ratios and per-order metrics are recalculated from consolidated facts instead of summed.

## Evidence and localization

Consolidated lineage includes the source type, source reference, restaurant ID, and branch ID. Arabic, Chinese, and English names are returned exactly as stored. The report does not translate identifiers or invent missing figures; empty scopes explicitly report `hasData: false`.
