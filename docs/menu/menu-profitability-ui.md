# Menu profitability UI (`4.4-v1`)

The protected `/app/menu-profitability` screen turns the recorded Task 4.2 metrics and Task 4.3 classifications into a decision-first owner view.

It shows the most and least profitable items, highest revenue, highest volume, worst contribution margins, and evidenced direct-cost increases. Users can select a 7-, 30-, or 90-day period; the globally selected branch remains authoritative and is sent to every request.

Rising cost compares the effective food plus packaging cost at the beginning and end of the selected period. An item appears only when both cost observations exist and the end value is greater. Missing costs are never treated as zero.

The table preserves original Arabic, Chinese, and English item names and displays STAR, PLOWHORSE, PUZZLE, and DOG classifications. The evidence drawer exposes recorded order/line references and the number of historical cost records behind an item. Incomplete items are counted as excluded and are never displayed with exact profitability.

The page includes loading, empty, permission, network, and responsive states. Arabic uses RTL layout through the application locale provider. Currency, percentages, quantities, and timestamps use locale-aware formatters.
