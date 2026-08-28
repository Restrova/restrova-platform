# Financial assumptions and known limits

Formula `3.7-v1` makes its limits explicit so the platform cannot imply a more complete accounting result than the connected ledger supports.

## Assumptions returned by the API

The calculation and dashboard APIs return these exact assumptions:

1. COGS includes direct food costs only.
2. Packaging and delivery commissions are contribution costs.
3. Net profit equals operating profit until tax, interest, depreciation, and amortization categories are modeled.
4. Order count is the number of distinct sales source references.

These statements are exported from the engine and checked against this document in automated tests.

## Tax treatment

Tax policy is:

| Field             | Value                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| `status`          | `not_modeled`                                                                           |
| `ledgerCategory`  | `unsupported`                                                                           |
| `netProfitPolicy` | `equals_operating_profit`                                                               |
| `description`     | Tax is not deducted or estimated until a versioned tax category and policy are modeled. |

The engine rejects an unsupported `tax` ledger category. It does not infer whether POS sales are tax-inclusive, estimate a rate, deduct tax, or label operating profit as after-tax profit. A future tax implementation requires an explicit jurisdiction/effective-date policy, ledger categories, a formula-version change, migrations where needed, and golden tests.

## Cost coverage

- `food_costs` is the only COGS category. Packaging and delivery commissions are contribution costs, not food cost.
- Labor, rent, utilities, marketing, and miscellaneous operating expenses are included only when ledger facts exist.
- Depreciation, amortization, interest, financing charges, capital expenditure, owner drawings, and income tax are not modeled.
- Period expenses are stored with optional source coverage dates but are not prorated or allocated across days or branches automatically.
- Restaurant-level unallocated costs affect restaurant and organization results but never branch profit or ranking until an approved allocation rule exists.

## Revenue and orders

- Revenue means gross sales minus recorded discounts and recorded refunds.
- Chargebacks, vouchers, loyalty points, tips, service charges, gift-card liability, and tax are not separately modeled.
- One distinct sales source reference equals one order within its restaurant/branch scope.
- A duplicate or reused reference within the same scoped source is deduplicated for lineage and order count.
- Deductions may exceed sales, producing negative revenue and negative profit. Margins and cost percentages are then unavailable rather than displayed as misleading positive percentages.

## Currency

- Each organization has one currency contract; no exchange-rate conversion occurs.
- Every entry stores that organization currency for historical traceability.
- Organization consolidation therefore never intentionally mixes currencies.
- The UI uses the ISO currency exponent for display, including zero-decimal JPY and three-decimal BHD.
- Historical currency changes, foreign-currency invoices, and exchange-rate gains/losses are not modeled.

## Time and operating periods

- Preset periods use the authenticated organization's IANA timezone and calendar boundaries.
- A local daylight-saving day may contain 23 or 25 hours.
- Custom ranges require offset-aware timestamps and use inclusive endpoints.
- Fractional seconds are preserved by range comparisons.
- Optional ledger `period_start` and `period_end` describe source coverage; `occurred_at` determines inclusion in the current engine.

## Data quality and presentation

- `hasData: true` means at least one scoped ledger fact exists; it does not mean every category is complete.
- Missing categories must remain visible beside profitability metrics.
- Zero additive values can be mechanically correct for connected data but must not be described as verified real-world zero when coverage is missing.
- The dashboard and AI assistant may summarize, rank, or explain engine output. They may not calculate a replacement figure or hide the underlying evidence state.

## Not an accounting close

The current financial engine is an operational decision view, not a statutory general ledger, tax return, audited statement, or substitute for professional accounting advice. Production users should reconcile it with their POS, payroll, inventory, invoicing, and accounting systems before making regulated or irreversible decisions.
