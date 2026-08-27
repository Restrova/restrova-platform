# Financial accuracy tests

Task 3.7 adds a regression contract for the financial engine, API, and currency display. The suite is intended to fail loudly if a future change alters a business figure without a deliberate formula-version update.

## Golden calculation cases

The canonical cases in `02-backend/server/test-data/financialAccuracyGolden.js` contain only integer minor-unit ledger facts and exact expected metrics. They lock:

- nearest-integer and nearest-basis-point rounding, half away from zero;
- discounts and refunds as revenue deductions;
- negative revenue and profit results without clamping or sign rewriting;
- distinct sales references as order count;
- category lineage and completeness.

## Tax contract

Tax is not modeled in formula version `3.7-v1`. Both the model and calculation APIs expose:

- `status: not_modeled`;
- `ledgerCategory: unsupported`;
- `netProfitPolicy: equals_operating_profit`.

The ledger rejects a `tax` category and negative input amounts. This is intentional: deductions are represented by their category semantics, while the engine must not estimate taxes or accept signed facts that can reverse those semantics.

## Currency contract

Ledger and API values remain untouched integer minor units. There is no cross-currency conversion. Tests use CNY, JPY, and BHD to cover two-, zero-, and three-decimal ISO currencies. The web client derives the currency exponent from `Intl.NumberFormat` before converting minor units for display.

## Date and scope contract

Range queries are inclusive at both ends and preserve fractional seconds through SQLite `julianday` comparisons. Golden integration coverage includes entries one millisecond before, on, and one millisecond after a requested range.

Multiple-branch totals must reconcile to the sum of scoped branches while keeping distinct order references branch-aware. Timezone cases verify that the same UTC instant is included or excluded according to each organization's local operating date, including zones with daylight-saving rules.

## Verification

Run `pnpm validate`. Task 3.7 coverage is part of the normal Backend and Frontend suites and therefore also runs in GitHub CI before merge.
