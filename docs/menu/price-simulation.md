# Price simulation (`4.5-v1`)

Task 4.5 provides a deterministic, read-only simulation of a proposed catalog price. It never updates the catalog and never claims that a price change will cause a particular demand response.

## Endpoint

```text
POST /api/menu/price-simulation
```

The request supplies `itemCode`, positive `proposedPriceMinor`, optional `branchId`, `from`, `to`, and one to nine `demandChangesBps` values. Money is integer minor units, percentages are integer basis points, and quantity is integer millionths. Demand change is limited to -90% through +100%; duplicates are removed and scenarios are sorted.

## Calculation

Effective food and packaging costs and the observed delivery commission rate come from Task 4.1. Baseline quantity and observed historical contribution come from Task 4.2.

```text
proposed commission per unit = round(proposed price × recorded commission rate)
proposed contribution per unit = proposed price − food cost − packaging − proposed commission
projected quantity = round(recorded quantity × (1 + demand change))
projected contribution = round(proposed contribution per unit × projected quantity)
impact = projected contribution − modeled current contribution
```

The response distinguishes observed historical contribution from the like-for-like modeled current contribution used for comparison. It calls the result contribution, never net profit, because operating expenses and tax are outside this item simulation.

No scenario values are returned unless sales quantity, effective costs, and positive delivery commission evidence are available. Missing inputs remain explicit. Lineage includes the catalog price, effective cost, commission observation, and sales references.

The simulation is read-only. Authenticated organization and restaurant scope cannot be supplied by the client. Branch managers are forced to their assigned branch, inaccessible identifiers return `404`, and multilingual item names remain unchanged.
