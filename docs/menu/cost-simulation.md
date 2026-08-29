# Cost simulation (`4.6-v1`)

Task 4.6 compares proposed food and packaging costs without changing any stored cost record. Scenarios may represent supplier quotes, ingredient or recipe changes, portion adjustments, or packaging alternatives.

## Endpoint

```text
POST /api/menu/cost-simulation
```

The request includes an item code, optional branch and period, and one to nine named scenarios. Each scenario supplies non-negative `proposedFoodCostMinor` and `proposedPackagingMinor` values. Money remains integer minor units.

## Fixed inputs

Each scenario holds the following recorded values constant so the cost impact stays isolated:

- catalog selling price;
- recorded delivery commission rate and resulting current per-unit commission;
- quantity sold in the selected period.

Current food and packaging cost comes from the effective branch record, falling back to the restaurant record. Recorded quantity and observed historical contribution come from Task 4.2.

```text
proposed direct cost = proposed food cost + proposed packaging
proposed contribution per unit = selling price − proposed direct cost − current commission
projected contribution = round(proposed contribution per unit × recorded quantity)
impact = projected contribution − modeled current contribution
```

The response shows food, packaging, total direct-cost, per-unit contribution, margin, recorded-volume contribution, and impact changes for every scenario. Observed historical contribution remains separate because actual line revenue, discounts, refunds, and costs can differ from a catalog-price model.

No scenario projection is returned without effective cost, positive commission evidence, and recorded sales quantity. The response publishes missing inputs, assumptions, source formula versions, catalog/cost/commission lineage, and sales references. Results are contribution—not net profit—and exclude operating expenses and tax.

The endpoint is authenticated and read-only. Organization and restaurant scope comes from the session, branch managers are locked to their assigned branch, inaccessible identifiers return `404`, and multilingual item/scenario names remain unchanged.
