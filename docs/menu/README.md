# Menu intelligence documentation

This directory is the canonical reference for Restrova's menu economics and recommendation pipeline. Menu calculations are deterministic domain logic; AI may explain a result later, but it never supplies prices, costs, commissions, or profit figures.

## Current contracts

| Capability       | Version  | Reference                                       |
| ---------------- | -------- | ----------------------------------------------- |
| Menu cost engine | `4.1-v1` | [Menu cost engine](menu-cost-engine.md)         |
| Margin analysis  | `4.2-v1` | [Menu margin analysis](menu-margin-analysis.md) |
| Source imports   | Task 2   | [Import guide](../imports/README.md)            |
| Financial rules  | `3.7-v1` | [Financial engine](../financial/README.md)      |

## Trust rules

1. Money is returned in integer minor units and rates in integer basis points.
2. Every catalog price, effective cost, and observed commission keeps source lineage.
3. Branch-specific costs override restaurant-wide costs only when effective at the requested time.
4. Missing cost or commission evidence remains `null`; it is never replaced with an estimate.
5. Organization, restaurant, role, and branch scope come from the authenticated session.
6. Arabic, Chinese, and English item names remain unchanged.

The current APIs are `GET /api/menu/costs` and `GET /api/menu/margins`. All menu intelligence endpoints require authentication.
