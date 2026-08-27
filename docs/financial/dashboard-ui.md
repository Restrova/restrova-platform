# Financial dashboard UI

The financial dashboard is available at `/app/dashboard`. It reads the versioned Task 3.5 dashboard API and never calculates or fabricates a replacement business figure when source data is absent.

## Scope and access

- Owners can view organization, restaurant, or branch scope.
- Viewers can view restaurant or branch scope within their organization.
- Branch managers are fixed to their assigned branch.
- The API remains the authority for organization, restaurant, branch, and role boundaries. The UI sends only the identifier needed by the selected scope.

## Metrics and formulas

The dashboard displays revenue, net profit, net margin, food cost percentage, labor cost percentage, average order value, order count, and total recorded costs. Money arrives as integer minor units and is converted only for locale-aware display.

Food and labor percentages are display-only ratios calculated with signed half-up rounding:

`ratio basis points = round(cost minor units × 10,000 / revenue minor units)`

When revenue is zero or the API returns a missing metric, the UI displays an em dash. The empty state explicitly says that no values are inferred.

## Visuals and evidence

- Revenue and net-profit trends use the API's time buckets. An accessible table exposes the same values to assistive technology.
- Cost bars represent recorded cost categories only.
- Branch ranking uses the API's deterministic ordering and identifies that unallocated restaurant costs are excluded from branch ranks.
- Data coverage lists present and missing ledger categories and counts the source references in the API lineage response.

## Localization and states

All dashboard labels and states are translated in Arabic, English, and Simplified Chinese. The layout responds to RTL direction through logical CSS properties. Loading, empty, network, permission, and generic failure states use the shared design-system components.

## Verification

Frontend tests cover source-backed rendering, filter query scope, deterministic minor-unit helpers, empty data, permission failures, and Arabic RTL behavior. Run the full repository gate with `pnpm validate`.
