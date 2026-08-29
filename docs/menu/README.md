# Menu intelligence documentation

This directory is the canonical reference for Restrova's menu economics and recommendation pipeline. Menu calculations are deterministic domain logic; AI may explain a result later, but it never supplies prices, costs, commissions, or profit figures.

## Current contracts

| Capability           | Version  | Reference                                                 |
| -------------------- | -------- | --------------------------------------------------------- |
| Menu cost engine     | `4.1-v1` | [Menu cost engine](menu-cost-engine.md)                   |
| Margin analysis      | `4.2-v1` | [Menu margin analysis](menu-margin-analysis.md)           |
| Engineering matrix   | `4.3-v1` | [Menu engineering matrix](menu-engineering-matrix.md)     |
| Profitability UI     | `4.4-v1` | [Menu profitability UI](menu-profitability-ui.md)         |
| Price simulation     | `4.5-v1` | [Price simulation](price-simulation.md)                   |
| Cost simulation      | `4.6-v1` | [Cost simulation](cost-simulation.md)                     |
| Recommendation rules | `4.7-v1` | [Menu recommendation rules](menu-recommendation-rules.md) |
| QA and release gate  | `4.8-v1` | [QA and release checklist](qa-release-checklist.md)       |
| Source imports       | Task 2   | [Import guide](../imports/README.md)                      |
| Financial rules      | `3.7-v1` | [Financial engine](../financial/README.md)                |

## Trust rules

1. Money is returned in integer minor units and rates in integer basis points.
2. Every catalog price, effective cost, and observed commission keeps source lineage.
3. Branch-specific costs override restaurant-wide costs only when effective at the requested time.
4. Missing cost or commission evidence remains `null`; it is never replaced with an estimate.
5. Organization, restaurant, role, and branch scope come from the authenticated session.
6. Arabic, Chinese, and English item names remain unchanged.

The current APIs are `GET /api/menu/costs`, `GET /api/menu/margins`, `GET /api/menu/engineering-matrix`, `POST /api/menu/price-simulation`, `POST /api/menu/cost-simulation`, and `GET /api/menu/recommendations`. All menu intelligence endpoints require authentication.
