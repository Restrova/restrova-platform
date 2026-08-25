# Import templates and validation

Download the canonical headers from the template API. Column matching ignores case and common spacing/punctuation differences while keeping every original uploaded header visible in mapping and preview responses.

## Branches

Required: `branch_code`, `name`, `city`. Optional: `address`, `phone`, `pos_system`, `operating_day_start`, `operating_day_end`.

Common aliases include `Branch`, `Branch Code`, `Branch Name`, `Restaurant Branch`, `City Name`, and `POS`. Times use `HH:MM`. Codes must be unique within the file; existing scoped codes are updated on confirmation.

## Menu

Required: `item_code`, `name`, `selling_price`. Optional: `category`, `active`.

Common aliases include `Item`, `Item Code`, `Item Name`, `Menu Item`, `Product`, `Selling Price`, `Sale Price`, `Price`, and `Unit Price`. Prices are non-negative with at most two decimals and are stored as integer minor units. `active` accepts `true/false`, `yes/no`, or `1/0`.

## Costs

Required: `item_code`, `direct_food_cost`, `effective_from`. Optional: `branch_code`, `packaging_cost`.

The item must already exist in the scoped catalog. A branch code, when supplied, must reference the same organization and restaurant. Costs use at most two decimals. `effective_from` must include an explicit timezone such as `2026-08-25T09:00:00+08:00` or `Z`. Repeated item/scope/effective-time rows are reported as duplicates.

## Sales

Required: `external_order_id`, `external_line_id`, `branch_code`, `created_at`, `channel`, `item_code`, `quantity`, `gross_sales`. Optional: `discount`, `refund_amount`, `delivery_commission`.

Common aliases include `Order ID`, `Line ID`, `Branch Name`, `Menu Item`, and `Qty`. Branch and item references must exist in scope. `channel` is `dine_in`, `takeaway`, or `delivery`; quantity must be greater than zero; money uses at most two decimals; and `created_at` requires an explicit timezone. Restaurant + branch + order + line identifiers provide duplicate/replay protection.

## Error guide

| Error                          | Corrective action                                                            |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Missing required column        | Map an uploaded column to the required field or add the column and re-upload |
| Invalid numeric/price/quantity | Use a plain non-negative amount; quantity must be greater than zero          |
| Invalid date/timezone          | Send an ISO timestamp ending in `Z` or a numeric offset such as `+08:00`     |
| Unknown branch/menu item       | Import the referenced branch/menu first or correct the code                  |
| Duplicate row                  | Verify it is intentional; duplicates are skipped rather than written twice   |
| Unsupported/malformed file     | Export a valid UTF-8 CSV or XLSX workbook and retry                          |
| File/resource limit            | Split or shorten the source data within the configured limits                |
| Unsafe formula                 | Replace formula-like text with its plain data value                          |

Arabic, Chinese, and English are preserved as UTF-8 through upload, mapping, validation, preview, persistence, and history.
