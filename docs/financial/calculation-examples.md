# Financial calculation examples

These examples use formula `3.7-v1`. Values shown in calculation tables are integer minor units unless stated otherwise.

## Example A: complete branch period

Assume a SAR organization records the following branch facts for one period:

| Category                           | Entries        | Total minor units |
| ---------------------------------- | -------------- | ----------------- |
| `sales`                            | 10000 and 5000 | 15000             |
| `discounts`                        | 1000           | 1000              |
| `refunds`                          | 500            | 500               |
| `food_costs`                       | 4000           | 4000              |
| `packaging`                        | 500            | 500               |
| `delivery_commissions`             | 1000           | 1000              |
| `labor`                            | 2000           | 2000              |
| `rent`                             | 1000           | 1000              |
| `utilities`                        | 500            | 500               |
| `marketing`                        | 250            | 250               |
| `miscellaneous_operating_expenses` | 250            | 250               |

Step-by-step:

1. Revenue = 15000 − 1000 − 500 = `13500` (SAR 135.00).
2. Gross profit = 13500 − 4000 = `9500`.
3. Gross margin = round(9500 × 10000 ÷ 13500) = `7037` bps (70.37%).
4. Contribution profit = 9500 − 500 − 1000 = `8000`.
5. Contribution margin = round(8000 × 10000 ÷ 13500) = `5926` bps (59.26%).
6. Operating expenses = 2000 + 1000 + 500 + 250 + 250 = `4000`.
7. Operating profit = 8000 − 4000 = `4000`.
8. Net profit = operating profit = `4000` because tax and financing categories are not modeled.
9. Net margin = round(4000 × 10000 ÷ 13500) = `2963` bps (29.63%).
10. Two distinct sales references produce `orderCount = 2`.
11. AOV = round(13500 ÷ 2) = `6750` (SAR 67.50).
12. Total costs = 4000 + 500 + 1000 + 4000 = `9500`.
13. Cost per order = round(9500 ÷ 2) = `4750` (SAR 47.50).

These expected values are also locked by `task3FinancialCalculation.test.js`.

## Example B: deductions exceed sales

Inputs:

- sales `1000`;
- discounts `600`;
- refunds `500`;
- food costs `200`;
- packaging `100`;
- labor `50`.

Results:

| Metric                        | Result |
| ----------------------------- | ------ |
| Revenue                       | `-100` |
| Gross profit                  | `-300` |
| Contribution profit           | `-400` |
| Operating and net profit      | `-450` |
| Total costs                   | `350`  |
| Average order value           | `-100` |
| Gross/contribution/net margin | `null` |

The engine does not clamp negative money to zero. It does make margins unavailable because dividing by non-positive revenue would present a commercially misleading percentage.

## Example C: branch reconciliation

For one restaurant:

| Scope                   | Revenue | Food | Labor | Rent | Net profit used by scope |
| ----------------------- | ------- | ---- | ----- | ---- | ------------------------ |
| Branch A                | 10000   | 3000 | 0     | 0    | 7000                     |
| Branch B                | 7000    | 0    | 2000  | 0    | 5000                     |
| Restaurant unallocated  | 0       | 0    | 0     | 1000 | -1000                    |
| Restaurant consolidated | 17000   | 3000 | 2000  | 1000 | 11000                    |

The restaurant total reconciles to both branches plus the unallocated rent. Branch ranking excludes the unallocated rent because no approved allocation rule assigns it to a branch. Branch A ranks above Branch B using branch-only net profit.

## Example D: currency display

The API returns the same integer `12345` without conversion:

| Currency | ISO exponent | Display value |
| -------- | ------------ | ------------- |
| CNY      | 2            | CNY 123.45    |
| JPY      | 0            | JPY 12,345    |
| BHD      | 3            | BHD 12.345    |

Organization totals never mix currencies because every ledger query is organization-scoped and each organization owns one currency contract.

## Example E: local-day boundaries

At UTC instant `2026-08-27T03:30:00.000Z`:

- Asia/Shanghai local time is 11:30 on August 27, so the entry belongs to that local `today` period.
- America/New_York local time is 23:30 on August 26, so the same instant does not belong to August 27 local `today`.

Preset periods are resolved in the authenticated organization's IANA timezone and then converted to inclusive UTC boundaries for querying.
