# Menu intelligence QA and release checklist (`4.8-v1`)

This is the release gate for the complete Task 4 menu pipeline. Calculations remain deterministic domain logic; AI can explain recorded results but cannot supply business figures.

## Calculation verification

| Contract                           | Verification                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /api/menu/costs`              | Selling price, effective food/packaging cost, commission, contribution, precedence, and lineage                     |
| `GET /api/menu/margins`            | Revenue deductions, historical cost allocation, quantity micros, profit, margin, popularity, refunds, and discounts |
| `GET /api/menu/engineering-matrix` | Scope-wide thresholds and deterministic STAR/PLOWHORSE/PUZZLE/DOG boundaries                                        |
| `POST /api/menu/price-simulation`  | Explicit proposed price and demand assumptions; read-only impact in integer minor units                             |
| `POST /api/menu/cost-simulation`   | Explicit supplier/ingredient/packaging inputs; read-only per-unit and volume impact                                 |
| `GET /api/menu/recommendations`    | Six evidence-backed proposal rules, no invented impact, owner-approval metadata, and 7/14-day checks                |

The golden-chain test reconciles item revenue minus food cost, packaging, and commission to contribution profit. It also proves that costs, margins, simulations, classifications, and recommendations use the same organization, restaurant, branch, period, item, and source evidence. Money uses integer minor units; percentages use integer basis points; quantities use integer quantity micros.

## Edge-case and security matrix

- Missing price, cost, commission, or sales evidence stays unavailable and is never converted to zero.
- Fractional quantities, rounding boundaries, deductions, zero revenue, inactive items, effective dates, pagination, and reversed periods are covered.
- Organization and restaurant isolation reject foreign catalog items and branches with a not-found response.
- Branch managers are restricted to their assigned branch; authenticated viewers retain read-only access.
- Price and cost scenarios reject invalid, excessive, duplicate, or unsupported inputs.
- Recommendations remain proposals. This read endpoint never changes a price, recipe, portion, promotion, bundle, or item status.

## UX validation

- `/app/menu-profitability` covers loading, empty, network error, retry, populated, and incomplete-evidence states.
- The selected branch is included in every menu request and remains fixed when the period changes.
- Arabic RTL, Chinese, and English item names and interface copy are preserved.
- Currency, percentages, quantities, and timestamps use locale-aware formatters.
- The evidence dialog has an accessible name, receives keyboard focus, closes with `Escape`, and returns focus to its trigger.
- Responsive table and evidence layouts are checked at desktop and narrow viewport breakpoints.

## Release, observation, and rollback

1. Run `pnpm validate` from the repository root and require GitHub CI to pass on the exact pull-request SHA.
2. Smoke-test authentication, branch selection, `/app/menu-profitability`, and all six API contracts against a non-production dataset.
3. Confirm logs contain request outcomes but no tokens, uploaded datasets, prices beyond returned scoped responses, or personal data.
4. After release, monitor API error rate, response latency, excluded-item count, and incomplete-evidence reasons. A rise in exclusions is a data-quality signal, not permission to estimate values.
5. Roll back the application commit if contract output, scope, or UX regresses. These tasks add no destructive menu writes, so rollback does not require reversing business-data changes.

## Canonical references

- [Menu cost engine](menu-cost-engine.md)
- [Menu margin analysis](menu-margin-analysis.md)
- [Menu engineering matrix](menu-engineering-matrix.md)
- [Menu profitability UI](menu-profitability-ui.md)
- [Price simulation](price-simulation.md)
- [Cost simulation](cost-simulation.md)
- [Menu recommendation rules](menu-recommendation-rules.md)
