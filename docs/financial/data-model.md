# Financial data model

Task 3.1 introduces a scoped, auditable financial ledger for the inputs used by later calculation and dashboard tasks.

## Storage contract

- Every amount is a non-negative integer in the currency's minor unit. For example, `1250` SAR means SAR 12.50.
- Currency comes from the authenticated organization and is stored on every entry for historical clarity.
- Each entry belongs to exactly one organization and restaurant and may optionally belong to one branch.
- Every entry requires `source_type` and `source_reference`. Their scoped unique key makes retries idempotent and preserves lineage.
- `occurred_at` records when the event happened. Optional periods require both `period_start` and `period_end`; this supports rent, labor, and other period costs without prematurely allocating them.
- `evidence` stores small source facts such as an invoice or POS reference. It must not contain credentials or raw uploaded datasets.

## Categories

| Group              | Categories                                                                    |
| ------------------ | ----------------------------------------------------------------------------- |
| Income             | `sales`                                                                       |
| Revenue deductions | `discounts`, `refunds`                                                        |
| Variable costs     | `food_costs`, `packaging`, `delivery_commissions`                             |
| Operating expenses | `labor`, `rent`, `utilities`, `marketing`, `miscellaneous_operating_expenses` |

All ledger amounts are unsigned facts. Category semantics determine whether a later formula adds or subtracts a value. Task 3.2 owns those deterministic formulas; Task 3.1 does not claim profit from incomplete inputs.

## API

- `GET /api/financial/model` returns the versioned storage contract and category groups.
- `POST /api/financial/entries` creates an owner-authorized record.
- `GET /api/financial/entries` lists records with optional `category`, `branchId`, `from`, `to`, and `limit` filters.

Queries always include organization and restaurant scope. Branch managers are forced to their assigned branch, cross-tenant branch identifiers return `404`, and only owners can write.
